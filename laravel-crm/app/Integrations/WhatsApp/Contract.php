<?php

namespace App\Integrations\WhatsApp;

interface Contract
{
    /**
     * @return array{provider_id:?string, status:string}
     */
    public function send(string $phone, string $body, ?string $template = null): array;
}
