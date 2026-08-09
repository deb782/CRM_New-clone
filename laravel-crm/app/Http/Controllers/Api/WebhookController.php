<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Email;
use App\Models\Lead;
use App\Models\WhatsappMessage;
use App\Services\ActivityService;
use App\Services\AutomationService;
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

    /** Telephony call-status webhook. */
    public function telephony(Request $request, ActivityService $activity)
    {
        if (! $this->verifySignature($request)) {
            return response()->json(['message' => 'invalid signature'], 401);
        }
        $lead = Lead::where('phone', $request->input('phone'))->latest()->first();
        if ($lead) {
            $activity->log($lead, 'call', 'Telephony status: '.$request->input('status'), null, $request->all());
        }
        return response()->json(['message' => 'ok']);
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
}
