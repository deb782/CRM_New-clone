<?php

namespace App\Services;

use App\Integrations\WhatsApp\Contract;
use App\Models\Lead;
use App\Models\User;
use App\Models\WhatsappAutoReply;
use App\Models\WhatsappConversation;
use App\Models\WhatsappMessage;

class InboxService
{
    public function __construct(private Contract $driver, private ActivityService $activity) {}

    public function getOrCreateForLead(Lead $lead): WhatsappConversation
    {
        $conv = WhatsappConversation::where('lead_id', $lead->id)
            ->orWhere('contact_phone', $lead->phone)->first();
        if ($conv) {
            if (! $conv->lead_id) {
                $conv->update(['lead_id' => $lead->id, 'contact_name' => $conv->contact_name ?: $lead->name]);
            }

            return $conv;
        }

        return WhatsappConversation::create([
            'lead_id' => $lead->id,
            'contact_phone' => $lead->phone,
            'contact_name' => $lead->name,
            'assigned_to' => $this->pickAgent(),
        ]);
    }

    /** Least-loaded auto-assignment across active sales agents (balanced round-robin). */
    private function pickAgent(): ?int
    {
        if (! \App\Models\WhatsappSetting::current()->auto_assign) {
            return null;
        }
        $roleIds = \App\Models\Role::whereIn('slug', ['sales_bde', 'sales_bdm', 'sales_head'])->pluck('id');
        if ($roleIds->isEmpty()) {
            return null;
        }
        $agents = User::where('is_active', true)->whereIn('role_id', $roleIds)->pluck('id');
        if ($agents->isEmpty()) {
            return null;
        }
        $counts = WhatsappConversation::where('status', 'open')->whereIn('assigned_to', $agents)
            ->selectRaw('assigned_to, count(*) as c')->groupBy('assigned_to')->pluck('c', 'assigned_to');

        return $agents->sortBy(fn ($id) => $counts[$id] ?? 0)->values()->first();
    }

    private function fillVariables(string $body, array $vars): string
    {
        return preg_replace_callback('/\{\{(\d+)\}\}/', function ($m) use ($vars) {
            $i = (int) $m[1] - 1;

            return $vars[$i] ?? $m[0];
        }, $body);
    }

    public function recordInbound(WhatsappConversation $conv, string $body, string $type = 'text', ?string $mediaUrl = null, ?string $providerId = null): WhatsappMessage
    {
        $msg = WhatsappMessage::create([
            'conversation_id' => $conv->id,
            'lead_id' => $conv->lead_id,
            'contact_phone' => $conv->contact_phone,
            'direction' => 'inbound',
            'message_type' => $type,
            'body' => $body,
            'media_url' => $mediaUrl,
            'sender_name' => $conv->contact_name,
            'status' => 'read',
            'provider_id' => $providerId,
            'sent_at' => now(),
        ]);

        $conv->update([
            'unread_count' => $conv->unread_count + 1,
            'last_message_preview' => $this->preview($body),
            'last_message_at' => now(),
            'last_inbound_at' => now(),
            'status' => 'open',
        ]);

        if ($conv->lead) {
            $this->activity->log($conv->lead, 'whatsapp', 'WhatsApp received', $body);
            $this->activity->comm($conv->lead_id, 'whatsapp', 'inbound', 'read');
        }

        return $msg;
    }

    /**
     * @param  array{type?:string, body?:string, template?:string, media_url?:string, buttons?:array}  $data
     */
    public function reply(WhatsappConversation $conv, array $data, ?User $agent = null): WhatsappMessage
    {
        $type = $data['type'] ?? 'text';
        $template = $type === 'template' ? ($data['template'] ?? null) : null;

        // Only templates are allowed outside the 24-hour customer-service window.
        if ($type !== 'template' && ! $conv->withinWindow()) {
            throw new \DomainException('Outside the 24-hour WhatsApp window — send an approved template instead.');
        }

        if ($conv->lead && ($conv->lead->do_not_contact || $conv->lead->whatsapp_opt_out)) {
            throw new \DomainException('Contact has opted out / is do-not-contact.');
        }

        $phone = (string) $conv->contact_phone;
        $mediaUrl = $data['media_url'] ?? null;
        $buttons = $data['buttons'] ?? null;
        $body = $data['body'] ?? '';
        $variables = array_values($data['variables'] ?? []);

        if ($type === 'template') {
            $tpl = \App\Models\WhatsappTemplate::where('name', $template)->first();
            $body = $tpl && $tpl->body ? $this->fillVariables($tpl->body, $variables) : ($body ?: "[Template: {$template}]");
            $res = $this->driver->sendTemplate($phone, (string) $template, $variables, $tpl->language ?? 'en_US');
        } else {
            $res = match ($type) {
                'image', 'document', 'video' => $this->driver->sendMedia($phone, $type, (string) $mediaUrl, $body ?: null),
                'interactive' => $this->driver->sendInteractive($phone, $body, $buttons ?: []),
                default => $this->driver->send($phone, $body),
            };
        }

        $meta = [];
        if ($buttons) {
            $meta['buttons'] = $buttons;
        }
        if ($type === 'template' && $variables) {
            $meta['variables'] = $variables;
        }

        $msg = WhatsappMessage::create([
            'conversation_id' => $conv->id,
            'lead_id' => $conv->lead_id,
            'contact_phone' => $conv->contact_phone,
            'direction' => 'outbound',
            'message_type' => $type,
            'template' => $template,
            'body' => $body,
            'media_url' => $mediaUrl,
            'meta' => $meta ?: null,
            'sender_name' => $agent?->name ?? 'Agent',
            'status' => $res['status'],
            'provider_id' => $res['provider_id'],
            'sent_at' => now(),
        ]);

        $conv->update([
            'unread_count' => 0,
            'last_message_preview' => $this->preview($body ?: '['.$type.']'),
            'last_message_at' => now(),
        ]);

        if ($conv->lead) {
            $this->activity->log($conv->lead, 'whatsapp', 'WhatsApp sent', $body, ['template' => $template, 'type' => $type]);
            $this->activity->comm($conv->lead_id, 'whatsapp', 'outbound', $res['status']);
        }

        return $msg;
    }

    public function markRead(WhatsappConversation $conv): void
    {
        $conv->update(['unread_count' => 0]);
        $last = $conv->messages()->where('direction', 'inbound')->latest('id')->first();
        if ($last && $last->provider_id) {
            $this->driver->markRead($last->provider_id);
        }
    }

    /** Fire the first matching active auto-reply for an inbound message. */
    public function runAutoReplies(WhatsappConversation $conv, string $inbound): ?WhatsappMessage
    {
        $text = strtolower(trim($inbound));
        if ($text === '' || strtoupper(trim($inbound)) === 'STOP') {
            return null;
        }
        foreach (WhatsappAutoReply::where('active', true)->orderBy('id')->get() as $rule) {
            $kw = strtolower(trim($rule->keyword));
            $hit = match ($rule->match_type) {
                'exact' => $text === $kw,
                'starts' => str_starts_with($text, $kw),
                default => str_contains($text, $kw),
            };
            if ($hit) {
                $rule->increment('hits');

                try {
                    return $this->reply($conv, [
                        'type' => $rule->reply_template ? 'template' : 'text',
                        'body' => $rule->reply_body,
                        'template' => $rule->reply_template,
                    ]);
                } catch (\DomainException $e) {
                    // opted-out / do-not-contact / outside window — skip auto-reply silently
                    return null;
                }
            }
        }

        return null;
    }

    private function preview(string $body): string
    {
        return \Illuminate\Support\Str::limit($body, 60);
    }
}
