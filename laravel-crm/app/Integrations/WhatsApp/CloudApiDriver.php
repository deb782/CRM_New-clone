<?php

namespace App\Integrations\WhatsApp;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class CloudApiDriver implements Contract
{
    private function endpoint(): ?string
    {
        $base = rtrim((string) config('integrations.whatsapp.cloud.base_url', 'https://graph.facebook.com'), '/');
        $version = config('integrations.whatsapp.cloud.version', 'v20.0');
        $phoneId = config('integrations.whatsapp.cloud.phone_id');

        return $phoneId ? "{$base}/{$version}/{$phoneId}/messages" : null;
    }

    public function send(string $phone, string $body, ?string $template = null): array
    {
        $token = config('integrations.whatsapp.cloud.token');
        $url = $this->endpoint();
        if (! $token || ! $url) {
            Log::warning('WhatsApp Cloud API credentials missing.');

            return ['provider_id' => null, 'status' => 'failed'];
        }

        $payload = $template
            ? [
                'messaging_product' => 'whatsapp',
                'to' => $phone,
                'type' => 'template',
                'template' => ['name' => $template, 'language' => ['code' => 'en_US']],
            ]
            : [
                'messaging_product' => 'whatsapp',
                'to' => $phone,
                'type' => 'text',
                'text' => ['body' => $body],
            ];

        try {
            $res = Http::withToken($token)->post($url, $payload);

            return [
                'provider_id' => data_get($res->json(), 'messages.0.id'),
                'status' => $res->successful() ? 'sent' : 'failed',
            ];
        } catch (\Throwable $e) {
            Log::error('Cloud API send failed: '.$e->getMessage());

            return ['provider_id' => null, 'status' => 'failed'];
        }
    }

    public function markRead(string $messageId): void
    {
        $token = config('integrations.whatsapp.cloud.token');
        $url = $this->endpoint();
        if (! $token || ! $url) {
            return;
        }
        try {
            Http::withToken($token)->post($url, [
                'messaging_product' => 'whatsapp',
                'status' => 'read',
                'message_id' => $messageId,
            ]);
        } catch (\Throwable $e) {
            Log::warning('Cloud API markRead failed: '.$e->getMessage());
        }
    }
}
