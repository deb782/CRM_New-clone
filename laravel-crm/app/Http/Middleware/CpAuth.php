<?php

namespace App\Http\Middleware;

use App\Models\ChannelPartner;
use Closure;
use Illuminate\Http\Request;
use Laravel\Sanctum\PersonalAccessToken;
use Symfony\Component\HttpFoundation\Response;

/**
 * Separate bearer-token auth for Channel Partners — fully isolated from staff auth:sanctum.
 * A partner token's tokenable is a ChannelPartner; anything else is rejected.
 */
class CpAuth
{
    public function handle(Request $request, Closure $next): Response
    {
        $bearer = $request->bearerToken();
        if (! $bearer) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        $token = PersonalAccessToken::findToken($bearer);
        if (! $token || ! ($token->tokenable instanceof ChannelPartner)) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        $partner = $token->tokenable;
        if ($partner->status !== 'approved') {
            return response()->json(['message' => 'Your account is ' . $partner->status . '. Please contact support.'], 403);
        }

        $token->forceFill(['last_used_at' => now()])->save();
        $request->attributes->set('cp', $partner);

        return $next($request);
    }
}
