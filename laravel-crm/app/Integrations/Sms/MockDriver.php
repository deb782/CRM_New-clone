<?php

namespace App\Integrations\Sms;

use Illuminate\Support\Str;

class MockDriver implements Contract
{
    public function send(string $phone, string $body): array
    {
        return ['id' => 'mock_sms_'.Str::random(10), 'status' => 'sent'];
    }
}
