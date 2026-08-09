<?php

namespace App\Integrations\WhatsApp;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class WatiDriver implements Contract
{
    public function send(string $phone, string $body, ?string $template = null): array
    {
        $base = config('integrations.whatsapp.wati.base_url');
        $token = config('integrations.whatsapp.wati.token');
        if (! $base || ! $token) {
            Log::warning('WATI credentials missing; message not sent.');
            return ['provider_id' => null, 'status' => 'failed'];
        }

        try {
            $res = Http::withToken($token)->post(rtrim($base, '/').'/api/v1/sendSessionMessage/'.$phone, [
                'messageText' => $body,
            ]);
            return [
                'provider_id' => $res->json('id') ?? null,
                'status' => $res->successful() ? 'sent' : 'failed',
            ];
        } catch (\Throwable $e) {
            Log::error('WATI send failed: '.$e->getMessage());

            return ['provider_id' => null, 'status' => 'failed'];
        }
    }

    public function markRead(string $messageId): void
    {
        // WATI marks messages read via its own dashboard; no-op here.
    }

    public function sendMedia(string $phone, string $type, string $link, ?string $caption = null): array
    {
        return $this->send($phone, $caption ?: '['.$type.'] '.$link);
    }

    public function sendInteractive(string $phone, string $body, array $buttons): array
    {
        $labels = implode(' | ', array_map(fn ($b) => $b['title'], $buttons));

        return $this->send($phone, $body.($labels ? "\n[".$labels.']' : ''));
    }

    public function fetchTemplates(): array
    {
        return [];
    }

    public function sendTemplate(string $phone, string $name, array $variables = [], string $language = 'en_US'): array
    {
        return $this->send($phone, '[Template: '.$name.'] '.implode(' ', $variables), $name);
    }
}
