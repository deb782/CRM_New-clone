<?php

namespace App\Http\Middleware;

use App\Models\AuthAuditLog;
use Closure;
use Illuminate\Http\Request;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * Sliding-window session TTL for Sanctum bearer tokens.
 * Sanctum already rejects tokens whose expires_at is in the past (idle timeout).
 * This middleware (a) blocks disabled accounts and (b) slides the expiry window
 * forward on each authenticated request so the session lives for `token_ttl`
 * minutes of INACTIVITY.
 */
class SlidingSession
{
    public function handle(Request $request, Closure $next)
    {
        $user = $request->user();
        // Staff routes are User-only. A ChannelPartner (or any non-User) token must never pass here.
        if ($user && ! $user instanceof \App\Models\User) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }
        if ($user) {
            if (! $user->is_active) {
                $user->tokens()->delete();
                AuthAuditLog::record('account_disabled', $user, $request);
                return response()->json(['message' => 'Your account has been disabled.'], 401);
            }
            $token = $user->currentAccessToken();
            if ($token instanceof PersonalAccessToken) {
                $ttl = (int) config('sanctum.token_ttl', 60);
                $token->forceFill(['expires_at' => now()->addMinutes($ttl)])->save();
            }
        }

        return $next($request);
    }
}
