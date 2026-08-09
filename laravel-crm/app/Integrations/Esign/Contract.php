<?php

namespace App\Integrations\Esign;

interface Contract
{
    /** Create an e-sign request for a document. @return array{envelope_id:string, sign_url:string, status:string} */
    public function createEnvelope(string $documentName, array $signer, string $content): array;

    /** Check status of an envelope. @return array{status:string} */
    public function status(string $envelopeId): array;
}
