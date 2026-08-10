<?php

namespace App\Services;

use App\Models\Integration;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Native Meta (Facebook/Instagram) Lead Ads capture.
 * Receives the Page `leadgen` webhook, retrieves the full lead via the Graph API,
 * and feeds it into the normal lead pipeline (dedupe / scoring / routing).
 * Mock-first: if a webhook payload already carries `field_data`, it is captured
 * directly without calling Meta — so the flow is testable before real credentials.
 */
class MetaLeadService
{
    public function __construct(private LeadService $leads) {}

    private function config(): array
    {
        $row = Integration::where('key', 'meta_lead_ads')->first();
        return $row?->config ?? [];
    }

    /** GET handshake: echo hub.challenge when the verify token matches. */
    public function verify(string $mode, ?string $token, ?string $challenge): ?string
    {
        $expected = $this->config()['verify_token'] ?? env('META_LEADS_VERIFY_TOKEN');
        if ($mode === 'subscribe' && $challenge !== null && $expected && hash_equals((string) $expected, (string) $token)) {
            return $challenge;
        }
        return null;
    }

    /**
     * Handle a POST notification. Returns [captured, duplicates].
     * @throws \RuntimeException on invalid signature.
     */
    public function handle(string $rawBody, ?string $signature, array $payload): array
    {
        $config = $this->config();
        $appSecret = $config['app_secret'] ?? null;

        // Enforce signature only once an App Secret is configured (secure in prod, open for mock tests).
        if ($appSecret) {
            $expected = 'sha256='.hash_hmac('sha256', $rawBody, $appSecret);
            if (! $signature || ! hash_equals($expected, $signature)) {
                throw new \RuntimeException('Invalid X-Hub-Signature-256');
            }
        }

        if (($payload['object'] ?? null) !== 'page') {
            return ['captured' => 0, 'duplicates' => 0];
        }

        $captured = 0; $dupes = 0;
        foreach ($payload['entry'] ?? [] as $entry) {
            foreach ($entry['changes'] ?? [] as $change) {
                if (($change['field'] ?? null) !== 'leadgen') {
                    continue;
                }
                $v = $change['value'] ?? [];
                $fields = null;

                if (! empty($v['field_data']) && is_array($v['field_data'])) {
                    $fields = $v['field_data']; // simulated / mock payload
                } elseif (! empty($v['leadgen_id']) && ! empty($config['page_access_token'])) {
                    $fields = $this->fetchLead($v['leadgen_id'], $config); // real retrieval
                } else {
                    Log::info('meta_lead_ads: skipped (no field_data and no access token/leadgen_id)', $v);
                    continue;
                }

                $data = $this->map($fields, $v);
                if (empty($data['phone']) && empty($data['email'])) {
                    continue;
                }
                $res = $this->leads->capture($data);
                ($res['status'] ?? null) === 'duplicate' ? $dupes++ : $captured++;
            }
        }
        return ['captured' => $captured, 'duplicates' => $dupes];
    }

    /**
     * Embedded Signup / Login for Business: exchange the authorization code for a
     * long-lived token, list Pages, subscribe each to leadgen, and store tokens.
     * @return array list of connected pages [{id,name}]
     */
    public function connectWithCode(string $code): array
    {
        $row = \App\Models\Integration::firstOrNew(['key' => 'meta_lead_ads']);
        $c = $row->config ?? [];
        $appId = $c['app_id'] ?? null;
        $secret = $c['app_secret'] ?? null;
        if (! $appId || ! $secret) {
            throw new \RuntimeException('Save your App ID and App Secret first.');
        }
        $version = $c['graph_version'] ?: 'v21.0';
        $base = "https://graph.facebook.com/{$version}";
        $redirect = rtrim((string) config('app.url'), '/').'/oauth/facebook/callback';

        $short = Http::timeout(20)->get("{$base}/oauth/access_token", [
            'client_id' => $appId, 'client_secret' => $secret,
            'redirect_uri' => $redirect, 'code' => $code,
        ])->throw()->json('access_token');

        $userToken = Http::timeout(20)->get("{$base}/oauth/access_token", [
            'grant_type' => 'fb_exchange_token', 'client_id' => $appId,
            'client_secret' => $secret, 'fb_exchange_token' => $short,
        ])->throw()->json('access_token');

        $pages = Http::timeout(20)->get("{$base}/me/accounts", [
            'fields' => 'id,name,access_token', 'access_token' => $userToken,
        ])->throw()->json('data', []);

        $connected = [];
        foreach ($pages as $pg) {
            if (empty($pg['access_token'])) {
                continue;
            }
            try {
                Http::asForm()->timeout(20)->post("{$base}/{$pg['id']}/subscribed_apps", [
                    'subscribed_fields' => 'leadgen', 'access_token' => $pg['access_token'],
                ])->throw();
            } catch (\Throwable $e) {
                Log::warning('meta_lead_ads subscribe failed for page '.$pg['id'].': '.$e->getMessage());
            }
            $connected[] = ['id' => $pg['id'], 'name' => $pg['name'] ?? null];
        }

        if (! empty($pages)) {
            $c['page_id'] = $pages[0]['id'];
            $c['page_access_token'] = $pages[0]['access_token'];
        }
        $c['pages'] = $connected;
        $row->config = $c;
        $row->status = 'connected';
        $row->enabled = true;
        $row->save();

        return $connected;
    }

    /** GET /{leadgen_id}?fields=... returns field_data[]. */
    private function fetchLead(string $leadgenId, array $config): array
    {
        $version = $config['graph_version'] ?: 'v21.0';
        $r = Http::timeout(15)->retry(2, 800)->acceptJson()
            ->get("https://graph.facebook.com/{$version}/{$leadgenId}", [
                'fields' => 'id,created_time,ad_id,form_id,field_data',
                'access_token' => $config['page_access_token'],
            ]);
        $r->throw();
        return $r->json('field_data', []);
    }

    /** Map Meta field_data[{name,values[]}] + attribution into our lead schema. */
    private function map(array $fieldData, array $meta): array
    {
        $get = function (string ...$names) use ($fieldData) {
            foreach ($fieldData as $f) {
                $n = strtolower($f['name'] ?? '');
                foreach ($names as $want) {
                    if ($n === $want) {
                        return $f['values'][0] ?? null;
                    }
                }
            }
            return null;
        };

        $name = $get('full_name', 'name');
        if (! $name) {
            $first = $get('first_name'); $last = $get('last_name');
            $name = trim(($first ?? '').' '.($last ?? '')) ?: null;
        }

        return array_filter([
            'name' => $name ?: 'Meta Lead',
            'email' => $get('email'),
            'phone' => $get('phone_number', 'phone', 'mobile_number'),
            'city' => $get('city', 'town'),
            'source' => 'Meta Lead Ads',
            'campaign' => $meta['campaign_id'] ?? $meta['ad_id'] ?? null,
            'ad_set' => $meta['form_id'] ?? null,
        ], fn ($v) => $v !== null);
    }
}
