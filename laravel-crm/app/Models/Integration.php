<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Integration extends Model
{
    protected $fillable = ['key', 'enabled', 'config', 'status', 'last_error', 'last_tested_at'];

    protected $casts = [
        'enabled' => 'boolean',
        'config' => 'encrypted:array',
        'last_tested_at' => 'datetime',
    ];

    /** Decrypted config for an enabled integration, or null if not enabled/configured. */
    public static function liveConfig(string $key): ?array
    {
        $row = static::where('key', $key)->where('enabled', true)->first();

        return $row ? ($row->config ?? []) : null;
    }
}
