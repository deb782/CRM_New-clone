<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class CheckPermission
{
    public function handle(Request $request, Closure $next, string $permission): Response
    {
        $user = $request->user();
        // Isolate staff routes: a non-User (e.g. ChannelPartner) token can never pass permission checks.
        if (! $user instanceof \App\Models\User) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }
        // Support any-of semantics with a pipe: permission:a|b
        $allowed = collect(explode('|', $permission))->contains(fn ($p) => $user->hasPermission($p));
        if (! $allowed) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }
        return $next($request);
    }
}
