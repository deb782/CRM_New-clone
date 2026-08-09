<?php

namespace App\Integrations\Esign;

use Illuminate\Support\Str;

/** Mock AFS e-sign adapter (swappable with a real provider later). */
class MockDriver implements Contract
{
    public function createEnvelope(string $documentName, array $signer, string $content): array
    {
        $id = 'mock_env_'.Str::random(14);
        return [
            'envelope_id' => $id,
            'sign_url' => rtrim(config('app.url'), '/').'/esign/'.$id,
            'status' => 'sent',
        ];
    }

    public function status(string $envelopeId): array
    {
        return ['status' => 'sent'];
    }
}
