<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

/**
 * Durable object storage via the Emergent storage proxy.
 * Uploads/serves files so media & generated PDFs survive container resets.
 */
class ObjectStorage
{
    private string $base;
    private string $app = 'agrocorp-crm';

    public function __construct()
    {
        $proxy = rtrim((string) (env('INTEGRATION_PROXY_URL') ?: 'https://integrations.emergentagent.com'), '/');
        $this->base = $proxy.'/objstore/api/v1/storage';
    }

    public function enabled(): bool
    {
        return (bool) env('EMERGENT_LLM_KEY');
    }

    private function key(bool $force = false): string
    {
        if (! $force && ($k = Cache::get('objstore_key'))) {
            return $k;
        }
        $res = Http::timeout(30)->post($this->base.'/init', ['emergent_key' => env('EMERGENT_LLM_KEY')]);
        $res->throw();
        $k = $res->json('storage_key');
        Cache::put('objstore_key', $k, now()->addHours(6));
        return $k;
    }

    /** Upload bytes; returns the canonical storage path. */
    public function put(string $path, string $bytes, string $contentType): string
    {
        $path = ltrim($this->app.'/'.ltrim($path, '/'), '/');
        $res = Http::withHeaders(['X-Storage-Key' => $this->key(), 'Content-Type' => $contentType])
            ->withBody($bytes, $contentType)->timeout(120)->put($this->base.'/objects/'.$path);
        if ($res->status() === 404) {
            // stale key — re-init once and retry
            $res = Http::withHeaders(['X-Storage-Key' => $this->key(true), 'Content-Type' => $contentType])
                ->withBody($bytes, $contentType)->timeout(120)->put($this->base.'/objects/'.$path);
        }
        $res->throw();
        return $res->json('path', $path);
    }

    /** Download bytes; returns [bytes, contentType]. */
    public function get(string $path): array
    {
        $res = Http::withHeaders(['X-Storage-Key' => $this->key()])->timeout(60)->get($this->base.'/objects/'.$path);
        if ($res->status() === 404) {
            $res = Http::withHeaders(['X-Storage-Key' => $this->key(true)])->timeout(60)->get($this->base.'/objects/'.$path);
        }
        $res->throw();
        return [$res->body(), $res->header('Content-Type') ?: 'application/octet-stream'];
    }
}
