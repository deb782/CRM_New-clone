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
        // Support any-of semantics with a pipe: permission:a|b
        $allowed = collect(explode('|', $permission))->contains(fn ($p) => $user && $user->hasPermission($p));
        if (! $user || ! $allowed) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }
        return $next($request);
    }
}
