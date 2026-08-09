<?php

namespace App\Integrations\Sms;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/** Generic HTTP SMS gateway (Twilio/MSG91/etc.) driven by env config. */
class HttpGatewayDriver implements Contract
{
    public function send(string $phone, string $body): array
    {
        $cfg = config('integrations.sms.gateway');
        if (empty($cfg['url'])) {
            Log::warning('SMS gateway URL missing.');
            return ['id' => null, 'status' => 'failed'];
        }
        try {
            $res = Http::withHeaders($cfg['headers'] ?? [])->asForm()->post($cfg['url'], [
                ($cfg['to_field'] ?? 'to') => $phone,
                ($cfg['body_field'] ?? 'message') => $body,
                ($cfg['from_field'] ?? 'from') => $cfg['sender'] ?? null,
                'api_key' => $cfg['api_key'] ?? null,
            ]);
            return ['id' => $res->json('id') ?? null, 'status' => $res->successful() ? 'sent' : 'failed'];
        } catch (\Throwable $e) {
            Log::error('SMS gateway send failed: '.$e->getMessage());
            return ['id' => null, 'status' => 'failed'];
        }
    }
}
