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

    /**
     * Send an interactive message with up to 3 quick-reply buttons.
     * $buttons: array of ['id'=>string,'title'=>string]. Falls back to text if unsupported.
     */
    public function sendInteractive(Lead $lead, string $body, array $buttons, ?string $template = null): WhatsappMessage
    {
        if ($lead->do_not_contact || $lead->whatsapp_opt_out) {
            return WhatsappMessage::create([
                'lead_id' => $lead->id, 'contact_phone' => $lead->phone, 'direction' => 'outbound',
                'template' => $template, 'body' => $body, 'status' => 'failed',
            ]);
        }
        $btns = array_slice(array_map(fn ($b) => [
            'id' => (string) ($b['id'] ?? ''), 'title' => mb_substr((string) ($b['title'] ?? ''), 0, 20),
        ], $buttons), 0, 3);

        try {
            $res = $this->driver->sendInteractive((string) $lead->phone, $body, $btns);
        } catch (\Throwable $e) {
            // Graceful text fallback so the journey never stalls.
            $res = $this->driver->send((string) $lead->phone, $body . "\n" . implode("\n", array_map(fn ($b) => '• ' . $b['title'], $btns)), $template);
        }

        $msg = WhatsappMessage::create([
            'lead_id' => $lead->id, 'contact_phone' => $lead->phone, 'direction' => 'outbound',
            'template' => $template, 'body' => $body, 'status' => $res['status'],
            'provider_id' => $res['provider_id'] ?? null, 'sent_at' => now(),
        ]);
        $this->activity->log($lead, 'whatsapp', 'WhatsApp sent', $body, ['template' => $template, 'buttons' => array_column($btns, 'title')]);
        $this->activity->comm($lead->id, 'whatsapp', 'outbound', $res['status']);
        return $msg;
    }
    /**
     * Send an approved named template (works outside the 24-hour window on the live Cloud API).
     * Falls back to a plain text send if the driver/template errors so the journey never stalls.
     *
     * @param  array<int, string>  $variables  positional body variables ({{1}}, {{2}}, ...)
     */
    public function sendTemplate(Lead $lead, string $name, array $variables = [], ?string $tag = null): WhatsappMessage
    {
        if ($lead->do_not_contact || $lead->whatsapp_opt_out) {
            return WhatsappMessage::create([
                'lead_id' => $lead->id, 'contact_phone' => $lead->phone, 'direction' => 'outbound',
                'template' => $name, 'body' => '[template] '.$name, 'status' => 'failed',
            ]);
        }

        try {
            $res = $this->driver->sendTemplate((string) $lead->phone, $name, $variables);
        } catch (\Throwable $e) {
            $res = $this->driver->send((string) $lead->phone, ($variables[0] ?? 'Hi').' — '.$name, $name);
        }

        $msg = WhatsappMessage::create([
            'lead_id' => $lead->id, 'contact_phone' => $lead->phone, 'direction' => 'outbound',
            'template' => $name, 'body' => '[template] '.$name.($variables ? ' ('.implode(', ', $variables).')' : ''),
            'status' => $res['status'], 'provider_id' => $res['provider_id'] ?? null, 'sent_at' => now(),
        ]);
        $this->activity->log($lead, 'whatsapp', 'WhatsApp template sent', $name, ['template' => $name, 'variables' => $variables]);
        $this->activity->comm($lead->id, 'whatsapp', 'outbound', $res['status']);

        return $msg;
    }

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
