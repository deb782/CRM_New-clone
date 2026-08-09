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

    /**
     * Send an approved template with body variables ({{1}}, {{2}}, ...).
     *
     * @param  array<int, string>  $variables
     * @return array{provider_id:?string, status:string}
     */
    public function sendTemplate(string $phone, string $name, array $variables = [], string $language = 'en_US'): array;

    /**
     * Send a media message (image|document|video) via a public link.
     *
     * @return array{provider_id:?string, status:string}
     */
    public function sendMedia(string $phone, string $type, string $link, ?string $caption = null): array;

    /**
     * Send an interactive message with up to 3 quick-reply buttons.
     *
     * @param  array<int, array{id?:string, title:string}>  $buttons
     * @return array{provider_id:?string, status:string}
     */
    public function sendInteractive(string $phone, string $body, array $buttons): array;

    /** Mark an inbound message as read on the provider (best-effort). */
    public function markRead(string $messageId): void;

    /**
     * Fetch approved templates from the provider.
     *
     * @return array<int, array{name:string, language:string, category:string, body:?string, status:string}>
     */
    public function fetchTemplates(): array;
}
