<?php

namespace App\Integrations\Telephony;

use Illuminate\Support\Str;

class MockDriver implements Contract
{
    public function call(string $agentPhone, string $customerPhone): array
    {
        return [
            'call_id' => 'mock_call_'.Str::random(10),
            'status' => 'ringing',
        ];
    }
}
