<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;

class AuthAuditLog extends Model
{
    public $timestamps = false;

    protected $fillable = ['user_id', 'email', 'event', 'ip_address', 'user_agent', 'meta', 'created_at'];

    protected $casts = ['meta' => 'array', 'created_at' => 'datetime'];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    /** Record an auth/session event with IP + device. */
    public static function record(string $event, ?User $user, ?Request $request = null, ?string $email = null, array $meta = []): void
    {
        static::create([
            'user_id' => $user?->id,
            'email' => $email ?: $user?->email,
            'event' => $event,
            'ip_address' => $request?->ip(),
            'user_agent' => $request ? substr((string) $request->userAgent(), 0, 500) : null,
            'meta' => $meta ?: null,
            'created_at' => now(),
        ]);
    }
}
