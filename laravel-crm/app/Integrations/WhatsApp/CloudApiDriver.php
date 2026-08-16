<?php

namespace App\Integrations\WhatsApp;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class CloudApiDriver implements Contract
{
    private function messagesUrl(): ?string
    {
        $base = rtrim((string) config('integrations.whatsapp.cloud.base_url', 'https://graph.facebook.com'), '/');
        $version = config('integrations.whatsapp.cloud.version', 'v20.0');
        $phoneId = config('integrations.whatsapp.cloud.phone_id');

        return $phoneId ? "{$base}/{$version}/{$phoneId}/messages" : null;
    }

    private function post(array $payload): array
    {
        $token = config('integrations.whatsapp.cloud.token');
        $url = $this->messagesUrl();
        if (! $token || ! $url) {
            Log::warning('WhatsApp Cloud API credentials missing.');

            return ['provider_id' => null, 'status' => 'failed'];
        }
        try {
            $res = Http::withToken($token)->post($url, $payload);

            return [
                'provider_id' => data_get($res->json(), 'messages.0.id'),
                'status' => $res->successful() ? 'sent' : 'failed',
            ];
        } catch (\Throwable $e) {
            Log::error('Cloud API send failed: '.$e->getMessage());

            return ['provider_id' => null, 'status' => 'failed'];
        }
    }

    public function send(string $phone, string $body, ?string $template = null): array
    {
        $payload = $template
            ? ['messaging_product' => 'whatsapp', 'to' => $phone, 'type' => 'template', 'template' => ['name' => $template, 'language' => ['code' => 'en_US']]]
            : ['messaging_product' => 'whatsapp', 'to' => $phone, 'type' => 'text', 'text' => ['body' => $body]];

        return $this->post($payload);
    }

    public function sendMedia(string $phone, string $type, string $link, ?string $caption = null): array
    {
        $object = ['link' => $link];
        if ($caption) {
            $object['caption'] = $caption;
        }

        return $this->post([
            'messaging_product' => 'whatsapp',
            'to' => $phone,
            'type' => $type, // image|document|video
            $type => $object,
        ]);
    }

    public function sendInteractive(string $phone, string $body, array $buttons): array
    {
        $btns = [];
        foreach (array_slice($buttons, 0, 3) as $idx => $b) {
            $btns[] = ['type' => 'reply', 'reply' => ['id' => $b['id'] ?? ('btn_'.$idx), 'title' => $b['title']]];
        }

        return $this->post([
            'messaging_product' => 'whatsapp',
            'to' => $phone,
            'type' => 'interactive',
            'interactive' => ['type' => 'button', 'body' => ['text' => $body], 'action' => ['buttons' => $btns]],
        ]);
    }

    public function sendList(string $phone, string $body, string $buttonLabel, array $rows): array
    {
        $secRows = [];
        foreach (array_slice($rows, 0, 10) as $idx => $r) {
            $row = [
                'id' => (string) ($r['id'] ?? ('row_'.$idx)),
                'title' => \Illuminate\Support\Str::limit((string) ($r['title'] ?? 'Option'), 24, ''),
            ];
            if (! empty($r['description'])) {
                $row['description'] = \Illuminate\Support\Str::limit((string) $r['description'], 72, '');
            }
            $secRows[] = $row;
        }

        return $this->post([
            'messaging_product' => 'whatsapp',
            'to' => $phone,
            'type' => 'interactive',
            'interactive' => [
                'type' => 'list',
                'body' => ['text' => $body],
                'action' => [
                    'button' => \Illuminate\Support\Str::limit($buttonLabel ?: 'Choose', 20, ''),
                    'sections' => [['title' => 'Options', 'rows' => $secRows]],
                ],
            ],
        ]);
    }

    public function sendTemplate(string $phone, string $name, array $variables = [], string $language = 'en_US'): array
    {
        $template = ['name' => $name, 'language' => ['code' => $language]];
        if (! empty($variables)) {
            $template['components'] = [[
                'type' => 'body',
                'parameters' => array_map(fn ($v) => ['type' => 'text', 'text' => (string) $v], array_values($variables)),
            ]];
        }

        return $this->post(['messaging_product' => 'whatsapp', 'to' => $phone, 'type' => 'template', 'template' => $template]);
    }

    public function markRead(string $messageId): void
    {
        $token = config('integrations.whatsapp.cloud.token');
        $url = $this->messagesUrl();
        if (! $token || ! $url) {
            return;
        }
        try {
            Http::withToken($token)->post($url, ['messaging_product' => 'whatsapp', 'status' => 'read', 'message_id' => $messageId]);
        } catch (\Throwable $e) {
            Log::warning('Cloud API markRead failed: '.$e->getMessage());
        }
    }

    public function fetchTemplates(): array
    {
        $token = config('integrations.whatsapp.cloud.token');
        $base = rtrim((string) config('integrations.whatsapp.cloud.base_url', 'https://graph.facebook.com'), '/');
        $version = config('integrations.whatsapp.cloud.version', 'v20.0');
        $waba = config('integrations.whatsapp.cloud.waba_id');
        if (! $token || ! $waba) {
            return [];
        }
        try {
            $res = Http::withToken($token)->get("{$base}/{$version}/{$waba}/message_templates", ['limit' => 200]);
            $out = [];
            foreach (data_get($res->json(), 'data', []) as $t) {
                $bodyComp = collect($t['components'] ?? [])->firstWhere('type', 'BODY');
                $out[] = [
                    'name' => $t['name'] ?? '',
                    'language' => $t['language'] ?? 'en_US',
                    'category' => $t['category'] ?? 'UTILITY',
                    'status' => $t['status'] ?? 'APPROVED',
                    'body' => $bodyComp['text'] ?? null,
                ];
            }

            return $out;
        } catch (\Throwable $e) {
            Log::error('Cloud API fetchTemplates failed: '.$e->getMessage());

            return [];
        }
    }
}
