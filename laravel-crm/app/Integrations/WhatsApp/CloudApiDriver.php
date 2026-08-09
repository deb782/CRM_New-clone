<?php

namespace App\Integrations\WhatsApp;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class CloudApiDriver implements Contract
{
    public function send(string $phone, string $body, ?string $template = null): array
    {
        $token = config('integrations.whatsapp.cloud.token');
        $phoneId = config('integrations.whatsapp.cloud.phone_id');
        if (! $token || ! $phoneId) {
            Log::warning('WhatsApp Cloud API credentials missing.');
            return ['provider_id' => null, 'status' => 'failed'];
        }

        try {
            $res = Http::withToken($token)->post("https://graph.facebook.com/v20.0/{$phoneId}/messages", [
                'messaging_product' => 'whatsapp',
                'to' => $phone,
                'type' => 'text',
                'text' => ['body' => $body],
            ]);
            return [
                'provider_id' => data_get($res->json(), 'messages.0.id'),
                'status' => $res->successful() ? 'sent' : 'failed',
            ];
        } catch (\Throwable $e) {
            Log::error('Cloud API send failed: '.$e->getMessage());
            return ['provider_id' => null, 'status' => 'failed'];
        }
    }
}
