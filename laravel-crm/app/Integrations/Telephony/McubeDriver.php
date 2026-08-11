<?php

namespace App\Integrations\Telephony;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class McubeDriver implements Contract
{
    public function call(string $agentPhone, string $customerPhone): array
    {
        $base = rtrim((string) config('integrations.telephony.mcube.base_url'), '/');
        $token = config('integrations.telephony.mcube.auth_token');
        $callerId = config('integrations.telephony.mcube.caller_id');
        if (! $base || ! $token) {
            Log::warning('Mcube credentials missing.');

            return ['call_id' => null, 'status' => 'failed'];
        }

        try {
            $res = Http::withHeaders(['HTTP_AUTHORIZATION' => $token])
                ->asForm()
                ->post($base, array_filter([
                    'exenumber'  => $agentPhone,
                    'custnumber' => $customerPhone,
                    'callerid'   => $callerId,
                ]));

            $json = $res->json() ?: [];

            return [
                'call_id' => data_get($json, 'callid') ?? data_get($json, 'call_id'),
                'status'  => $res->successful() ? 'ringing' : 'failed',
            ];
        } catch (\Throwable $e) {
            Log::error('Mcube call failed: '.$e->getMessage());

            return ['call_id' => null, 'status' => 'failed'];
        }
    }
}
