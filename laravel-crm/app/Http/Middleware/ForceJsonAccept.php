<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

/**
 * Ensures every API request is treated as JSON so unauthenticated/expired
 * sessions always receive a 401 JSON response instead of an HTML redirect
 * to a (non-existent) "login" route.
 */
class ForceJsonAccept
{
    public function handle(Request $request, Closure $next)
    {
        $request->headers->set('Accept', 'application/json');

        return $next($request);
    }
}
