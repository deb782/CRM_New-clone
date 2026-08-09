<?php

namespace App\Integrations\WhatsApp;

use Illuminate\Support\Str;

class MockDriver implements Contract
{
    private function ok(): array
    {
        return ['provider_id' => 'mock_wa_'.Str::random(12), 'status' => 'sent'];
    }

    public function send(string $phone, string $body, ?string $template = null): array
    {
        return $this->ok();
    }

    public function sendTemplate(string $phone, string $name, array $variables = [], string $language = 'en_US'): array
    {
        return $this->ok();
    }

    public function sendMedia(string $phone, string $type, string $link, ?string $caption = null): array
    {
        return $this->ok();
    }

    public function sendInteractive(string $phone, string $body, array $buttons): array
    {
        return $this->ok();
    }

    public function markRead(string $messageId): void
    {
        // no-op in mock
    }

    public function fetchTemplates(): array
    {
        // Sample approved templates so the template picker is usable without live Meta.
        return [
            ['name' => 'welcome_message', 'language' => 'en_US', 'category' => 'UTILITY', 'status' => 'APPROVED', 'body' => 'Hi {{1}}, welcome! Our team will assist you with your property search.'],
            ['name' => 'site_visit_reminder', 'language' => 'en_US', 'category' => 'UTILITY', 'status' => 'APPROVED', 'body' => 'Reminder: your site visit is scheduled for {{1}}. Reply to reschedule.'],
            ['name' => 'price_list', 'language' => 'en_US', 'category' => 'MARKETING', 'status' => 'APPROVED', 'body' => 'Here is the latest price list for {{1}}. Let us know if you have questions.'],
            ['name' => 'payment_due', 'language' => 'en_US', 'category' => 'UTILITY', 'status' => 'APPROVED', 'body' => 'Gentle reminder: a payment of {{1}} is due on {{2}}.'],
            ['name' => 'followup', 'language' => 'en_US', 'category' => 'UTILITY', 'status' => 'APPROVED', 'body' => 'Just following up — are you still interested in {{1}}?'],
        ];
    }
}
