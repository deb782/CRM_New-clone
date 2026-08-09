<?php

namespace App\Integrations\Telephony;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class ExotelDriver implements Contract
{
    public function call(string $agentPhone, string $customerPhone): array
    {
        $sid = config('integrations.telephony.exotel.sid');
        $token = config('integrations.telephony.exotel.token');
        $callerId = config('integrations.telephony.exotel.caller_id');
        if (! $sid || ! $token) {
            Log::warning('Exotel credentials missing.');
            return ['call_id' => null, 'status' => 'failed'];
        }

        try {
            $res = Http::withBasicAuth($sid, $token)
                ->asForm()
                ->post("https://api.exotel.com/v1/Accounts/{$sid}/Calls/connect.json", [
                    'From' => $agentPhone,
                    'To' => $customerPhone,
                    'CallerId' => $callerId,
                ]);
            return [
                'call_id' => data_get($res->json(), 'Call.Sid'),
                'status' => $res->successful() ? 'ringing' : 'failed',
            ];
        } catch (\Throwable $e) {
            Log::error('Exotel call failed: '.$e->getMessage());
            return ['call_id' => null, 'status' => 'failed'];
        }
    }
}
