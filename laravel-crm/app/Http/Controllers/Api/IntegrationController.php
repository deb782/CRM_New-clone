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
}
