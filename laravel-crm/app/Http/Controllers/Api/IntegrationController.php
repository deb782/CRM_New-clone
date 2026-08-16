<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Integration;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Symfony\Component\Mailer\Transport\Smtp\EsmtpTransport;

class IntegrationController extends Controller
{
    private function registry(): array
    {
        return config('integration_hub', []);
    }

    public function index()
    {
        $defs = $this->registry();
        $stored = Integration::all()->keyBy('key');
        $out = [];
        foreach ($defs as $key => $def) {
            $row = $stored->get($key);
            $config = $row?->config ?? [];
            $fields = array_map(function ($f) use ($config) {
                $val = $config[$f['key']] ?? ($f['default'] ?? null);
                $secret = ! empty($f['secret']);
                return array_merge($f, [
                    'has_value' => filled($config[$f['key']] ?? null),
                    'value' => $secret ? (filled($config[$f['key']] ?? null) ? '••••'.substr((string) $config[$f['key']], -4) : '') : ($val ?? ''),
                ]);
            }, $def['fields']);
            $configured = collect($def['fields'])->where('required', true)->every(fn ($f) => filled($config[$f['key']] ?? null));
            $out[] = [
                'key' => $key,
                'name' => $def['name'],
                'category' => $def['category'],
                'icon' => $def['icon'],
                'icon_style' => $def['icon_style'] ?? 'solid',
                'accent' => $def['accent'] ?? '#111111',
                'description' => $def['description'],
                'docs' => $def['docs'] ?? null,
                'fields' => $fields,
                'enabled' => (bool) ($row?->enabled),
                'configured' => $configured,
                'status' => $row?->status,
                'last_error' => $row?->last_error,
                'last_tested_at' => optional($row?->last_tested_at)->toIso8601String(),
            ];
        }

        return response()->json(['data' => $out]);
    }

    public function update(Request $request, string $key)
    {
        $def = config("integration_hub.$key");
        abort_unless($def, 404);
        $row = Integration::firstOrNew(['key' => $key]);
        $config = $row->config ?? [];
        foreach ($def['fields'] as $f) {
            if (! $request->has($f['key'])) {
                continue;
            }
            $v = $request->input($f['key']);
            // Keep existing secret if the field was left blank (masked, unchanged).
            if (! empty($f['secret']) && ($v === null || $v === '')) {
                continue;
            }
            $config[$f['key']] = is_string($v) ? trim($v) : $v;
        }
        $row->config = $config;
        $row->status = null; // require a fresh test after edits
        $row->save();

        return response()->json(['ok' => true]);
    }

    public function toggle(Request $request, string $key)
    {
        $def = config("integration_hub.$key");
        abort_unless($def, 404);
        $row = Integration::firstOrNew(['key' => $key]);
        $enabled = $request->boolean('enabled');
        if ($enabled) {
            $config = $row->config ?? [];
            foreach ($def['fields'] as $f) {
                if (! empty($f['required']) && empty($config[$f['key']])) {
                    return response()->json(['message' => 'Configure the required fields before enabling.'], 422);
                }
            }
        }
        $row->enabled = $enabled;
        $row->save();

        return response()->json(['enabled' => $row->enabled]);
    }

    public function test(string $key)
    {
        $def = config("integration_hub.$key");
        abort_unless($def, 404);
        $row = Integration::firstOrNew(['key' => $key]);
        $config = $row->config ?? [];
        try {
            $msg = match ($key) {
                'meta_whatsapp' => $this->testMeta($config),
                'google_email' => $this->testSmtp($config),
                'mcube' => $this->testMcube($config),
                'meta_lead_ads' => $this->testMetaLeads($config),
                default => 'No connection test available for this integration.',
            };
            $row->status = 'connected';
            $row->last_error = null;
            $row->last_tested_at = now();
            $row->save();

            return response()->json(['ok' => true, 'message' => $msg]);
        } catch (\Throwable $e) {
            $row->status = 'error';
            $row->last_error = substr($e->getMessage(), 0, 300);
            $row->last_tested_at = now();
            $row->save();

            return response()->json(['ok' => false, 'message' => $e->getMessage()], 422);
        }
    }

    private function testMeta(array $c): string
    {
        $token = $c['access_token'] ?? '';
        $pid = $c['phone_number_id'] ?? '';
        if (! $token || ! $pid) {
            throw new \RuntimeException('Access Token and Phone Number ID are required.');
        }
        $r = Http::timeout(12)->get("https://graph.facebook.com/v21.0/{$pid}", ['access_token' => $token]);
        if ($r->failed()) {
            throw new \RuntimeException('Meta rejected the credentials: '.($r->json('error.message') ?? ('HTTP '.$r->status())));
        }

        return 'Connected to '.($r->json('display_phone_number') ?? ('phone '.$pid)).'.';
    }

    private function testSmtp(array $c): string
    {
        $host = $c['host'] ?? 'smtp.gmail.com';
        $port = (int) ($c['port'] ?? 587);
        if (empty($c['username']) || empty($c['app_password'])) {
            throw new \RuntimeException('Mailbox and App Password are required.');
        }
        $transport = new EsmtpTransport($host, $port, $port === 465);
        $transport->setUsername($c['username']);
        $transport->setPassword($c['app_password']);
        $transport->start();
        $transport->stop();

        return 'SMTP authenticated as '.$c['username'].'.';
    }

    /** Embedded Signup: receive the authorization code and provision Page tokens. */
    public function metaOauth(Request $request, \App\Services\MetaLeadService $meta)
    {
        $data = $request->validate(['code' => 'required|string']);
        try {
            $pages = $meta->connectWithCode($data['code']);
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        } catch (\Throwable $e) {
            return response()->json(['message' => 'Facebook connection failed: '.$e->getMessage()], 422);
        }
        return response()->json(['pages' => $pages, 'message' => 'Connected '.count($pages).' page(s)']);
    }

    /** WhatsApp Embedded Signup: exchange the signup code, register the phone, subscribe the WABA. */
    public function whatsappOauth(Request $request)
    {
        $data = $request->validate([
            'code' => 'required|string|max:4096',
            'phone_number_id' => 'required|string|regex:/^\d+$/',
            'waba_id' => 'required|string|regex:/^\d+$/',
        ]);
        $row = Integration::firstOrNew(['key' => 'meta_whatsapp']);
        $c = $row->config ?? [];
        $appId = $c['app_id'] ?? null;
        $secret = $c['app_secret'] ?? null;
        if (! $appId || ! $secret) {
            return response()->json(['message' => 'Save your Meta App ID and App Secret first.'], 422);
        }
        $version = $c['graph_version'] ?: 'v21.0';
        $base = "https://graph.facebook.com/{$version}";

        try {
            $token = Http::timeout(20)->get("{$base}/oauth/access_token", [
                'client_id' => $appId, 'client_secret' => $secret, 'code' => $data['code'],
            ])->throw()->json('access_token');
            if (! $token) {
                return response()->json(['message' => 'Meta did not return an access token.'], 422);
            }

            // Register the phone for Cloud API use. Ignore "already registered" style errors.
            try {
                Http::withToken($token)->timeout(20)
                    ->post("{$base}/{$data['phone_number_id']}/register", ['messaging_product' => 'whatsapp'])
                    ->throw();
            } catch (\Throwable $e) {
                \Log::warning('meta_whatsapp register: '.$e->getMessage());
            }

            // Subscribe the app to this WABA so webhooks flow in.
            Http::withToken($token)->timeout(20)
                ->post("{$base}/{$data['waba_id']}/subscribed_apps")
                ->throw();
        } catch (\Throwable $e) {
            return response()->json(['message' => 'WhatsApp connection failed: '.($e->getMessage())], 422);
        }

        $c['access_token'] = $token;
        $c['phone_number_id'] = $data['phone_number_id'];
        $c['waba_id'] = $data['waba_id'];
        $row->config = $c;
        $row->status = 'connected';
        $row->enabled = true;
        $row->last_tested_at = now();
        $row->save();

        return response()->json(['ok' => true, 'message' => 'WhatsApp connected via embedded signup.']);
    }

    /** Go-Live "Connect check": confirm WhatsApp is truly live before relying on it. */
    public function whatsappCheck()
    {
        $row = Integration::firstOrNew(['key' => 'meta_whatsapp']);
        $c = $row->config ?? [];
        $checks = [];
        $add = function ($label, $status, $detail) use (&$checks) {
            $checks[] = ['label' => $label, 'status' => $status, 'detail' => $detail];
        };

        $token = $c['access_token'] ?? '';
        $pid = $c['phone_number_id'] ?? '';
        $waba = $c['waba_id'] ?? '';
        $hasCreds = $token && $pid && $waba;
        $add('Credentials saved', $hasCreds ? 'pass' : 'fail',
            $hasCreds ? 'Access token, phone number and WhatsApp Business Account are all set.'
                      : 'Enter your Access Token, Phone Number ID and WhatsApp Business Account ID, then Save.');

        $live = (bool) (config('integrations.whatsapp.cloud.token') && config('integrations.whatsapp.cloud.phone_id'));
        $add('Live mode active', $live ? 'pass' : 'warn',
            $live ? 'The CRM is using the live WhatsApp Cloud API.'
                  : 'Still in sandbox — enable the integration to switch messaging to live.');

        if ($hasCreds) {
            try {
                $version = $c['graph_version'] ?: 'v21.0';
                $r = Http::timeout(12)->get("https://graph.facebook.com/{$version}/{$pid}", [
                    'fields' => 'display_phone_number,verified_name,quality_rating',
                    'access_token' => $token,
                ]);
                if ($r->successful()) {
                    $add('WhatsApp number verified', 'pass',
                        'Connected to '.($r->json('display_phone_number') ?: $pid).' ('.($r->json('verified_name') ?: '—').'). Quality rating: '.($r->json('quality_rating') ?: 'n/a').'.');
                } else {
                    $add('WhatsApp number verified', 'fail', 'Meta rejected the request: '.($r->json('error.message') ?: ('HTTP '.$r->status())));
                }
            } catch (\Throwable $e) {
                $add('WhatsApp number verified', 'fail', 'Could not reach Meta: '.$e->getMessage());
            }
        } else {
            $add('WhatsApp number verified', 'fail', 'Add credentials first.');
        }

        $approved = \App\Models\WhatsappTemplate::where('status', 'APPROVED')->count();
        $add('Approved templates', $approved > 0 ? 'pass' : 'warn',
            $approved > 0 ? ($approved.' approved template(s) ready to send.') : 'No approved templates yet — sync from Meta or create and submit one.');

        $webhook = rtrim((string) config('app.url'), '/').'/api/v1/webhooks/whatsapp';
        $vt = $c['verify_token'] ?? '';
        $add('Webhook callback', $vt ? 'info' : 'warn',
            'In Meta, set the callback URL to '.$webhook.($vt ? ' with your verify token.' : ' — but set a Verify Token here first.'));

        $statuses = array_column($checks, 'status');
        $overall = in_array('fail', $statuses, true) ? 'fail' : (in_array('warn', $statuses, true) ? 'warn' : 'pass');

        return response()->json(['overall' => $overall, 'checks' => $checks, 'webhook' => $webhook]);
    }

    private function testMcube(array $c): string
    {
        $url = $c['base_url'] ?? '';
        if (! $url) {
            throw new \RuntimeException('API Base URL is required.');
        }
        // Reachability probe (Mcube endpoints vary by account); a response = reachable.
        $r = Http::timeout(12)->withToken($c['auth_token'] ?? '')->get($url);

        return 'Endpoint reachable (HTTP '.$r->status().').';
    }

    private function testMetaLeads(array $c): string
    {
        $pid = $c['page_id'] ?? '';
        $token = $c['page_access_token'] ?? '';
        if (! $pid || ! $token) {
            throw new \RuntimeException('Page ID and Page Access Token are required.');
        }
        $version = $c['graph_version'] ?: 'v21.0';
        $r = Http::timeout(12)->get("https://graph.facebook.com/{$version}/{$pid}", [
            'fields' => 'name',
            'access_token' => $token,
        ]);
        if ($r->failed()) {
            throw new \RuntimeException('Meta rejected the credentials: '.($r->json('error.message') ?? ('HTTP '.$r->status())));
        }
        $sub = Http::timeout(12)->get("https://graph.facebook.com/{$version}/{$pid}/subscribed_apps", ['access_token' => $token]);
        $subscribed = collect($sub->json('data', []))->pluck('subscribed_fields')->flatten()->contains('leadgen');

        return 'Connected to Page "'.($r->json('name') ?? $pid).'". '.($subscribed ? 'leadgen webhook subscribed.' : 'Note: Page is not yet subscribed to the leadgen field.');
    }
}
