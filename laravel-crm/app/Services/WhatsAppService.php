<?php

namespace App\Services;

use App\Integrations\WhatsApp\Contract;
use App\Models\Lead;
use App\Models\WhatsappMessage;

class WhatsAppService
{
    public function __construct(private Contract $driver, private ActivityService $activity) {}

    public function send(Lead $lead, string $body, ?string $template = null): WhatsappMessage
    {
        // Consent guards (R1.3, R8.2)
        if ($lead->do_not_contact || $lead->whatsapp_opt_out) {
            $msg = WhatsappMessage::create([
                'lead_id' => $lead->id,
                'contact_phone' => $lead->phone,
                'direction' => 'outbound',
                'template' => $template,
                'body' => $body,
                'status' => 'failed',
            ]);
            $this->activity->log($lead, 'whatsapp', 'WhatsApp blocked (opt-out / do-not-contact)', $body);
            return $msg;
        }

        $res = $this->driver->send((string) $lead->phone, $body, $template);

        $msg = WhatsappMessage::create([
            'lead_id' => $lead->id,
            'contact_phone' => $lead->phone,
            'direction' => 'outbound',
            'template' => $template,
            'body' => $body,
            'status' => $res['status'],
            'provider_id' => $res['provider_id'],
            'sent_at' => now(),
        ]);

        $this->activity->log($lead, 'whatsapp', 'WhatsApp sent', $body, ['template' => $template]);
        $this->activity->comm($lead->id, 'whatsapp', 'outbound', $res['status']);

        return $msg;
    }

    /** Import an inbound message (C1.3 / webhook). */
    public function import(Lead $lead, string $body, ?string $providerId = null): WhatsappMessage
    {
        $msg = WhatsappMessage::create([
            'lead_id' => $lead->id,
            'contact_phone' => $lead->phone,
            'direction' => 'inbound',
            'body' => $body,
            'status' => 'read',
            'provider_id' => $providerId,
            'sent_at' => now(),
        ]);
        $this->activity->log($lead, 'whatsapp', 'WhatsApp received', $body);
        $this->activity->comm($lead->id, 'whatsapp', 'inbound', 'read');
        return $msg;
    }
}
