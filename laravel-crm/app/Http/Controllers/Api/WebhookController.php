<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Email;
use App\Models\Lead;
use App\Models\WhatsappMessage;
use App\Services\ActivityService;
use App\Services\AutomationService;
use App\Services\InboxService;
use App\Services\LeadService;
use App\Services\ScoringService;
use App\Services\WhatsAppService;
use Illuminate\Http\Request;

class WebhookController extends Controller
{
    /** Public website / Meta lead-ad form capture (A1.1 / A1.2). */
    public function leadForm(Request $request, LeadService $leads)
    {
        $data = $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'nullable|email',
            'phone' => 'nullable|string|max:30',
            'source' => 'nullable|string',
            'campaign' => 'nullable|string',
            'ad_set' => 'nullable|string',
            'city' => 'nullable|string',
        ]);
        if (empty($data['email']) && empty($data['phone'])) {
            return response()->json(['message' => 'Phone or email required'], 422);
        }
        $data['source'] = $data['source'] ?? 'Website Form';
        $result = $leads->capture($data);
        if ($result['status'] === 'duplicate') {
            return response()->json(['message' => 'duplicate', 'lead_id' => $result['duplicate']['matches'][0]['id'] ?? null], 200);
        }
        return response()->json(['message' => 'captured', 'lead_id' => $result['lead']->id], 201);
    }

    /** WhatsApp inbound + delivery receipts + STOP opt-out (C1.3 / R8.2). */
    public function whatsapp(Request $request, WhatsAppService $wa, ActivityService $activity)
    {
        // Meta WhatsApp Cloud API webhook format (entry/changes)
        if ($request->has('entry')) {
            return $this->handleMetaWhatsapp($request, app(InboxService::class));
        }
        if (! $this->verifySignature($request)) {
            return response()->json(['message' => 'invalid signature'], 401);
        }

        $phone = $request->input('phone');
        $lead = Lead::where('phone', $phone)->latest()->first();
        if (! $lead) {
            return response()->json(['message' => 'no lead'], 200);
        }

        $type = $request->input('type', 'message');
        if ($type === 'status') {
            $status = $request->input('status'); // delivered|read
            $providerId = $request->input('provider_id');
            $msg = WhatsappMessage::where('provider_id', $providerId)->first();
            if ($msg) {
                $msg->status = $status;
                if ($status === 'delivered') $msg->delivered_at = now();
                if ($status === 'read') $msg->read_at = now();
                $msg->save();
            }
            return response()->json(['message' => 'status updated']);
        }

        $body = trim((string) $request->input('body', ''));
        if (strtoupper($body) === 'STOP') {
            $lead->update(['whatsapp_opt_out' => true]);
            $activity->log($lead, 'system', 'WhatsApp opt-out (STOP received)');
            return response()->json(['message' => 'opted out']);
        }

        $wa->import($lead, $body, $request->input('provider_id'));
        app(AutomationService::class)->fire('whatsapp.replied', $lead);
        return response()->json(['message' => 'imported']);
    }

    /** Meta webhook GET verification handshake (hub.mode / hub.verify_token / hub.challenge). */
    public function whatsappVerify(Request $request)
    {
        $mode = $request->query('hub_mode');
        $token = $request->query('hub_verify_token');
        $challenge = $request->query('hub_challenge');
        if ($mode === 'subscribe' && hash_equals((string) config('integrations.whatsapp.cloud.verify_token'), (string) $token)) {
            return response((string) $challenge, 200);
        }
        return response('forbidden', 403);
    }

    private function handleMetaWhatsapp(Request $request, InboxService $inbox)
    {
        $secret = config('integrations.whatsapp.cloud.app_secret');
        if ($secret) { // only enforce when live app secret is configured
            $given = (string) $request->header('X-Hub-Signature-256', '');
            $expected = 'sha256='.hash_hmac('sha256', $request->getContent(), $secret);
            if (! $given || ! hash_equals($expected, $given)) {
                return response()->json(['message' => 'invalid signature'], 401);
            }
        }

        foreach ($request->input('entry', []) as $entry) {
            foreach ($entry['changes'] ?? [] as $change) {
                $value = $change['value'] ?? [];
                $contactName = data_get($value, 'contacts.0.profile.name');

                foreach ($value['messages'] ?? [] as $m) {
                    $from = $m['from'] ?? null;
                    if (! $from) continue;
                    $lead = Lead::where('phone', $from)->latest()->first();
                    if (! $lead) {
                        $res = app(LeadService::class)->capture(['name' => $contactName ?: $from, 'phone' => $from, 'source' => 'WhatsApp']);
                        $lead = $res['lead'] ?? Lead::where('phone', $from)->latest()->first();
                    }
                    if (! $lead) continue;

                    [$body, $type, $media] = $this->extractMetaMessage($m);
                    $reply = $this->extractReply($m);
                    if (strtoupper(trim($body)) === 'STOP') {
                        $lead->update(['whatsapp_opt_out' => true]);
                        continue;
                    }
                    $conv = $inbox->getOrCreateForLead($lead);
                    if ($contactName && ! $conv->contact_name) {
                        $conv->update(['contact_name' => $contactName]);
                    }
                    $inbox->recordInbound($conv, $body, $type, $media, $m['id'] ?? null);
                    app(AutomationService::class)->fire('whatsapp.replied', $lead);
                    $handled = false;
                    try {
                        $handled = $this->handleInboundAutomation($conv->fresh(), $lead, $body, $inbox, $reply);
                    } catch (\Throwable $e) {
                        \Illuminate\Support\Facades\Log::warning('WA inbound automation: '.$e->getMessage());
                    }
                    if (! $handled) {
                        $inbox->runAutoReplies($conv, $body);
                    }
                }

                foreach ($value['statuses'] ?? [] as $s) {
                    $msg = WhatsappMessage::where('provider_id', $s['id'] ?? null)->first();
                    if ($msg) {
                        $msg->status = $s['status'] ?? $msg->status;
                        if (($s['status'] ?? null) === 'delivered') $msg->delivered_at = now();
                        if (($s['status'] ?? null) === 'read') $msg->read_at = now();
                        $msg->save();
                    }
                }
            }
        }

        return response()->json(['message' => 'EVENT_RECEIVED']);
    }

    /** P2/P3: drive an active bot session or apply inbound rules (office-hours, keyword routing, auto-assign). */
    private function handleInboundAutomation($conv, $lead, string $body, InboxService $inbox, ?array $reply = null): bool
    {
        $engine = app(\App\Services\WaFlowEngine::class);
        // Send bot messages as REAL interactive/list payloads when connected; text fallback otherwise.
        $send = function ($msgs) use ($inbox, $conv) {
            foreach ($msgs as $mm) {
                $type = $mm['type'] ?? 'text';
                try {
                    if ($type === 'buttons') {
                        $btns = array_map(fn ($b) => ['id' => $b['id'] ?? '', 'title' => $b['label'] ?? ''], $mm['buttons'] ?? []);
                        $inbox->reply($conv, ['type' => 'interactive', 'body' => $mm['text'] ?? '', 'buttons' => $btns]);
                    } elseif ($type === 'list') {
                        $rows = array_map(fn ($r) => ['id' => $r['id'] ?? '', 'title' => $r['label'] ?? '', 'description' => $r['description'] ?? ''], $mm['rows'] ?? []);
                        $inbox->reply($conv, ['type' => 'list', 'body' => $mm['text'] ?? '', 'button_label' => $mm['button_label'] ?? 'Choose', 'rows' => $rows]);
                    } else {
                        $text = $mm['text'] ?? '';
                        if (trim($text) !== '') {
                            $inbox->reply($conv, ['body' => $text]);
                        }
                    }
                } catch (\Throwable $e) {
                    // Graceful text fallback (e.g. provider rejects interactive) so the bot never stalls.
                    $text = $mm['text'] ?? '';
                    if ($type === 'buttons') {
                        $text .= "\n".implode("\n", array_map(fn ($b) => '• '.($b['label'] ?? ''), $mm['buttons'] ?? []));
                    }
                    if ($type === 'list') {
                        $text .= "\n".implode("\n", array_map(fn ($r) => '• '.($r['label'] ?? ''), $mm['rows'] ?? []));
                    }
                    if (trim($text) !== '') {
                        try {
                            $inbox->reply($conv, ['body' => $text]);
                        } catch (\Throwable $e2) {
                        }
                    }
                }
            }
        };
        $applyCaptured = function ($data) use ($lead) {
            $fill = [];
            foreach (['name', 'email', 'phone', 'preferred_location', 'property_type', 'budget_max', 'timeline'] as $f) {
                if (! empty($data[$f])) {
                    $fill[$f] = $data[$f];
                }
            }
            if ($fill) {
                $lead->update($fill);
            }
        };

        // Prefer the interactive reply id (matches a bot node option id) over raw text.
        $input = ($reply['id'] ?? '') !== '' ? $reply['id'] : $body;

        // Active bot session → advance it
        $state = $conv->bot_state;
        if (is_array($state) && ! empty($state['flow_id'])) {
            $flow = \App\Models\WaFlow::find($state['flow_id']);
            if ($flow) {
                $res = $engine->step($flow, $state['state'] ?? ['node' => null, 'data' => []], $input, $conv->id, true);
                $send($res['messages'] ?? []);
                $applyCaptured($res['state']['data'] ?? []);
                $conv->bot_state = ! empty($res['done']) ? null : ['flow_id' => $flow->id, 'state' => $res['state']];
                if (! empty($res['done']) && ($res['action'] ?? '') === 'handoff' && ! $conv->assigned_to) {
                    $r = app(\App\Services\InboundRouter::class)->evaluate($body, now(), true);
                    if ($r['assigned_to']) {
                        $conv->assigned_to = $r['assigned_to'];
                    }
                }
                $conv->save();

                return true;
            }
            $conv->bot_state = null;
        }

        // No active session → did the customer tap a template quick-reply button linked to a bot?
        if ($reply) {
            $flow = $this->templateButtonFlow($conv, $reply);
            if ($flow) {
                $res = $engine->start($flow, $conv->id, true);
                $send($res['messages'] ?? []);
                $applyCaptured($res['state']['data'] ?? []);
                if (empty($res['done'])) {
                    $conv->bot_state = ['flow_id' => $flow->id, 'state' => $res['state']];
                }
                $conv->save();

                return true;
            }
        }

        // No active session → evaluate inbound rules
        $r = app(\App\Services\InboundRouter::class)->evaluate($body, now(), true);
        if ($r['assigned_to']) {
            $conv->assigned_to = $r['assigned_to'];
        }
        if (! empty($r['tags'])) {
            $conv->tags = array_values(array_unique(array_merge($conv->tags ?? [], $r['tags'])));
        }
        $handled = false;
        if (! empty($r['bot'])) {
            $flow = \App\Models\WaFlow::find($r['bot']['id']);
            if ($flow) {
                $res = $engine->start($flow, $conv->id, true);
                $send($res['messages'] ?? []);
                $applyCaptured($res['state']['data'] ?? []);
                if (empty($res['done'])) {
                    $conv->bot_state = ['flow_id' => $flow->id, 'state' => $res['state']];
                }
                $handled = true;
            }
        }
        if (! $handled && ! empty($r['reply'])) {
            $inbox->reply($conv, ['body' => $r['reply']]);
            $handled = true;
        }

        // No rule handled it → auto-trigger a matching bot directly (keyword flows first, then the default fallback bot).
        if (! $handled && empty($r['away'])) {
            $flow = $engine->matchFlow($body);
            if ($flow) {
                // Keyword bots fire whenever their keyword appears; the default/fallback bot only greets on the
                // customer's first message so it doesn't restart on every subsequent reply.
                $isFirstInbound = $conv->messages()->where('direction', 'inbound')->count() <= 1;
                if ($flow->trigger_type === 'keyword' || $isFirstInbound) {
                    $res = $engine->start($flow, $conv->id, true);
                    $send($res['messages'] ?? []);
                    $applyCaptured($res['state']['data'] ?? []);
                    if (empty($res['done'])) {
                        $conv->bot_state = ['flow_id' => $flow->id, 'state' => $res['state']];
                    }
                    if (! empty($res['done']) && ($res['action'] ?? '') === 'handoff' && ! $conv->assigned_to) {
                        $rr = app(\App\Services\InboundRouter::class)->evaluate($body, now(), true);
                        if ($rr['assigned_to']) {
                            $conv->assigned_to = $rr['assigned_to'];
                        }
                    }
                    $handled = true;
                }
            }
        }
        $conv->save();

        return $handled;
    }

    /** Find a WaFlow linked to the quick-reply button the customer just tapped on a recent template. */
    private function templateButtonFlow($conv, array $reply): ?\App\Models\WaFlow
    {
        $last = $conv->messages()->where('direction', 'outbound')->whereNotNull('template')->latest('id')->first();
        if (! $last) {
            return null;
        }
        $tpl = \App\Models\WhatsappTemplate::where('name', $last->template)->first();
        if (! $tpl || empty($tpl->buttons)) {
            return null;
        }
        $title = strtolower(trim($reply['title'] ?? ''));
        $id = strtolower(trim($reply['id'] ?? ''));
        foreach ($tpl->buttons as $b) {
            if (($b['type'] ?? '') !== 'QUICK_REPLY' || empty($b['flow_id'])) {
                continue;
            }
            $btnText = strtolower(trim($b['text'] ?? ''));
            if ($btnText !== '' && ($btnText === $title || $btnText === $id)) {
                return \App\Models\WaFlow::find($b['flow_id']);
            }
        }

        return null;
    }

    /** Extract the id/title of an interactive button/list reply or a template quick-reply response. */
    private function extractReply(array $m): ?array
    {
        $type = $m['type'] ?? '';
        if ($type === 'interactive') {
            $r = data_get($m, 'interactive.button_reply') ?? data_get($m, 'interactive.list_reply');
            if ($r) {
                return ['id' => (string) ($r['id'] ?? ''), 'title' => (string) ($r['title'] ?? '')];
            }
        }
        if ($type === 'button') { // response to a template quick-reply button
            return [
                'id' => (string) ($m['button']['payload'] ?? $m['button']['text'] ?? ''),
                'title' => (string) ($m['button']['text'] ?? ''),
            ];
        }

        return null;
    }

    private function extractMetaMessage(array $m): array
    {
        $type = $m['type'] ?? 'text';

        return match ($type) {
            'text' => [$m['text']['body'] ?? '', 'text', null],
            'image' => [$m['image']['caption'] ?? '[Image received]', 'image', $m['image']['link'] ?? null],
            'document' => [$m['document']['caption'] ?? '[Document received]', 'document', $m['document']['link'] ?? null],
            'video' => [$m['video']['caption'] ?? '[Video received]', 'video', $m['video']['link'] ?? null],
            'audio' => ['[Voice message received]', 'audio', null],
            'location' => ['Location: '.data_get($m, 'location.latitude').', '.data_get($m, 'location.longitude'), 'location', null],
            'button' => [$m['button']['text'] ?? '[Button reply]', 'button', null],
            'interactive' => [data_get($m, 'interactive.button_reply.title') ?? data_get($m, 'interactive.list_reply.title') ?? '[Interactive reply]', 'interactive', null],
            default => ['['.$type.' message]', $type, null],
        };
    }

    /** Telephony call-status webhook (Mcube/Exotel) — logs duration + recording on the lead. */
    public function telephony(Request $request, ActivityService $activity)
    {
        // Providers (Mcube/Exotel) can't sign with our internal secret; this endpoint only
        // annotates existing call/lead records, so we accept the provider callback as-is.
        $callId   = $request->input('call_id') ?? $request->input('callid') ?? $request->input('CallSid');
        $status   = $request->input('status') ?? $request->input('callstatus') ?? $request->input('dialcallstatus');
        $duration = (int) ($request->input('duration') ?? $request->input('callduration') ?? $request->input('DialCallDuration') ?? 0);
        $recording = $request->input('recording_url') ?? $request->input('filename') ?? $request->input('RecordingUrl');

        $call = $callId ? \App\Models\Call::where('provider_call_id', $callId)->latest()->first() : null;
        $lead = $call?->lead ?: Lead::where('phone', $request->input('phone') ?? $request->input('custnumber'))->latest()->first();

        if ($call) {
            $call->update(array_filter([
                'status'        => $status,
                'duration'      => $duration ?: $call->duration,
                'recording_url' => $recording ?: $call->recording_url,
                'outcome'       => $this->mapCallOutcome($status),
            ], fn ($v) => $v !== null));
        }
        if ($lead) {
            $body = 'Call '.($status ?: 'update').' · '.gmdate('i:s', $duration).' min'
                .($recording ? "\nRecording: ".$recording : '');
            $activity->log($lead, 'call', 'Telephony: '.($status ?: 'status'), $body, array_merge($request->all(), [
                'duration' => $duration, 'recording_url' => $recording,
            ]));
            $lead->last_contacted_at = now();
            $lead->save();
        }
        return response()->json(['message' => 'ok']);
    }

    private function mapCallOutcome(?string $s): ?string
    {
        $s = strtolower((string) $s);
        if ($s === '') return null;
        if (str_contains($s, 'no') && str_contains($s, 'answer')) return 'no_answer';
        if (str_contains($s, 'missed')) return 'no_answer';
        if (str_contains($s, 'busy')) return 'busy';
        if (str_contains($s, 'fail') || str_contains($s, 'reject') || str_contains($s, 'cancel')) return 'no_answer';
        if (str_contains($s, 'answer') || str_contains($s, 'completed') || str_contains($s, 'connect')) return 'connected';
        return null;
    }

    /** Email open/click tracking (S2.1 / S2.2) — public pixel/redirect. */
    public function emailEvent(Request $request, string $event, int $emailId, ScoringService $scoring)
    {
        $email = Email::find($emailId);
        if ($email) {
            if ($event === 'open' && ! $email->opened_at) {
                $email->update(['opened_at' => now(), 'status' => 'opened']);
            }
            if ($event === 'click') {
                $email->update(['clicked_at' => now(), 'status' => 'clicked']);
            }
            if ($lead = $email->lead) {
                $scoring->apply($lead);
                app(AutomationService::class)->fire('email.'.$event.'ed', $lead);
            }
        }
        // Return 1x1 transparent gif for open pixel
        if ($event === 'open') {
            return response(base64_decode('R0lGODlhAQABAAAAACwAAAAAAQABAAA='))->header('Content-Type', 'image/gif');
        }
        return response()->json(['message' => 'tracked']);
    }

    protected function verifySignature(Request $request): bool
    {
        $secret = config('integrations.webhook_secret');
        $sig = $request->header('X-CRM-Signature');
        if (! $sig) {
            return app()->environment('local'); // relaxed in local/dev
        }
        return hash_equals(hash_hmac('sha256', $request->getContent(), $secret), $sig);
    }

    /** Razorpay webhook — payment.captured / payment_link.paid -> confirm booking token. */
    public function razorpay(Request $request, \App\Services\RazorpayService $razorpay, \App\Services\PaymentService $payments)
    {
        $body = $request->getContent();
        $sig = $request->header('X-Razorpay-Signature', '');
        if (! $razorpay->verifyWebhookSignature($body, $sig)) {
            return response()->json(['message' => 'invalid signature'], 401);
        }
        $payload = $request->all();
        $event = $payload['event'] ?? '';
        $plinkId = data_get($payload, 'payload.payment_link.entity.id')
            ?? data_get($payload, 'payload.payment.entity.notes.plink_id');
        $refId = data_get($payload, 'payload.payment_link.entity.reference_id');

        $booking = \App\Models\Booking::when($plinkId, fn ($q) => $q->where('meta->razorpay_plink', $plinkId))
            ->when(! $plinkId && $refId, fn ($q) => $q->where('booking_ref', explode('-'.substr($refId, -5), $refId)[0]))
            ->latest()->first();

        if ($booking && in_array($event, ['payment.captured', 'payment_link.paid', 'order.paid'])) {
            // Idempotency: skip if this gateway payment was already recorded.
            $gwRef = data_get($payload, 'payload.payment.entity.id');
            $already = $gwRef && \App\Models\Payment::where('gateway_ref', $gwRef)->exists();
            if (! $already && $booking->token_status !== 'paid') {
                $payments->record($booking, [
                    'type' => 'token',
                    'amount' => (int) (data_get($payload, 'payload.payment.entity.amount', $booking->token_amount * 100) / 100),
                    'method' => 'razorpay',
                    'gateway' => 'razorpay',
                    'gateway_ref' => $gwRef,
                ]);
            }
        }
        return response()->json(['message' => 'ok']);
    }

    /** Lead-capture chatbot (Section A). Scripted; optionally LLM-backed later. */
    public function chatbot(Request $request, LeadService $leads)
    {
        $data = $request->validate([
            'message' => 'nullable|string',
            'name' => 'nullable|string',
            'email' => 'nullable|email',
            'phone' => 'nullable|string',
        ]);

        if (! empty($data['name']) && (! empty($data['email']) || ! empty($data['phone']))) {
            $result = $leads->capture([
                'name' => $data['name'], 'email' => $data['email'] ?? null,
                'phone' => $data['phone'] ?? null, 'source' => 'Chatbot',
                'intent_notes' => $data['message'] ?? null,
            ]);
            $leadId = $result['status'] === 'created' ? $result['lead']->id : ($result['duplicate']['matches'][0]['id'] ?? null);
            return response()->json([
                'reply' => "Thanks ".($data['name'])."! Our team will reach out shortly. Meanwhile, would you like a brochure or a site visit?",
                'done' => true,
                'lead_id' => $leadId,
            ]);
        }

        return response()->json([
            'reply' => "Hi! I can help you explore our projects. Could you share your name and phone or email so our team can assist you?",
            'done' => false,
            'need' => ['name', 'phone_or_email'],
        ]);
    }

    /** Meta Lead Ads webhook — GET verification handshake. */
    public function metaLeadsVerify(Request $request, \App\Services\MetaLeadService $meta)
    {
        $challenge = $meta->verify(
            (string) $request->query('hub_mode', $request->query('hub.mode')),
            $request->query('hub_verify_token', $request->query('hub.verify_token')),
            $request->query('hub_challenge', $request->query('hub.challenge'))
        );
        if ($challenge === null) {
            return response('Forbidden', 403);
        }
        return response($challenge, 200)->header('Content-Type', 'text/plain');
    }

    /** Meta Lead Ads webhook — POST leadgen notifications. */
    public function metaLeads(Request $request, \App\Services\MetaLeadService $meta)
    {
        try {
            $result = $meta->handle($request->getContent(), $request->header('X-Hub-Signature-256'), $request->all());
        } catch (\RuntimeException $e) {
            return response('Invalid signature', 403);
        }
        return response()->json(array_merge(['message' => 'EVENT_RECEIVED'], $result), 200);
    }
}
