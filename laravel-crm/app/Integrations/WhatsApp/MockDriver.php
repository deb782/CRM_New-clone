<?php

namespace App\Integrations\WhatsApp;

use Illuminate\Support\Str;

class MockDriver implements Contract
{
    public function send(string $phone, string $body, ?string $template = null): array
    {
        // Stores nothing external; returns a deterministic mock provider id.
        return [
            'provider_id' => 'mock_wa_'.Str::random(12),
            'status' => 'sent',
        ];
    }

    public function markRead(string $messageId): void
    {
        // no-op in mock
    }
}
