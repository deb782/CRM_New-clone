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
        ]);
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
     * @param  array{type?:string, body?:string, template?:string}  $data
     */
    public function reply(WhatsappConversation $conv, array $data, ?User $agent = null): WhatsappMessage
    {
        $type = $data['type'] ?? 'text';
        $template = $type === 'template' ? ($data['template'] ?? null) : null;

        if ($type !== 'template' && ! $conv->withinWindow()) {
            throw new \DomainException('Outside the 24-hour WhatsApp window — send an approved template instead.');
        }

        // Consent guard (mirror WhatsAppService)
        if ($conv->lead && ($conv->lead->do_not_contact || $conv->lead->whatsapp_opt_out)) {
            throw new \DomainException('Contact has opted out / is do-not-contact.');
        }

        $body = $type === 'template' ? ($data['body'] ?? "[Template: {$template}]") : ($data['body'] ?? '');
        $res = $this->driver->send((string) $conv->contact_phone, $body, $template);

        $msg = WhatsappMessage::create([
            'conversation_id' => $conv->id,
            'lead_id' => $conv->lead_id,
            'contact_phone' => $conv->contact_phone,
            'direction' => 'outbound',
            'message_type' => $type,
            'template' => $template,
            'body' => $body,
            'sender_name' => $agent?->name ?? 'Agent',
            'status' => $res['status'],
            'provider_id' => $res['provider_id'],
            'sent_at' => now(),
        ]);

        $conv->update([
            'unread_count' => 0,
            'last_message_preview' => $this->preview($body),
            'last_message_at' => now(),
        ]);

        if ($conv->lead) {
            $this->activity->log($conv->lead, 'whatsapp', 'WhatsApp sent', $body, ['template' => $template]);
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

                return $this->reply($conv, [
                    'type' => $rule->reply_template ? 'template' : 'text',
                    'body' => $rule->reply_body,
                    'template' => $rule->reply_template,
                ]);
            }
        }

        return null;
    }

    private function preview(string $body): string
    {
        return \Illuminate\Support\Str::limit($body, 60);
    }
}
