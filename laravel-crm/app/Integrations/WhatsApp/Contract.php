<?php

namespace App\Integrations\WhatsApp;

interface Contract
{
    /**
     * Send a text (or simple named-template) message.
     *
     * @return array{provider_id:?string, status:string}
     */
    public function send(string $phone, string $body, ?string $template = null): array;

    /** Mark an inbound message as read on the provider (best-effort). */
    public function markRead(string $messageId): void;
}
