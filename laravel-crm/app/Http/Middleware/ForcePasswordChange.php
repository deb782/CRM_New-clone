<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class ForcePasswordChange
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        if ($user && $user->must_change_password) {
            return response()->json([
                'message' => 'You must change your password before continuing.',
                'code' => 'password_change_required',
            ], 409);
        }

        return $next($request);
    }
}
