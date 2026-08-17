<?php

use App\Http\Middleware\CheckPermission;
use App\Http\Middleware\ForcePasswordChange;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        $middleware->prependToGroup('api', \App\Http\Middleware\ForceJsonAccept::class);
        $middleware->alias([
            'permission' => CheckPermission::class,
            'force_pw' => ForcePasswordChange::class,
            'form-cors' => \App\Http\Middleware\PublicFormCors::class,
            'session_ttl' => \App\Http\Middleware\SlidingSession::class,
            'cp.auth' => \App\Http\Middleware\CpAuth::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        // Any /api/* request must always get JSON (never an HTML redirect to a
        // non-existent "login" route), so unauthenticated/expired sessions get a clean 401.
        $exceptions->shouldRenderJsonWhen(function (Request $request, Throwable $e) {
            return $request->is('api/*') || $request->expectsJson();
        });
        $exceptions->render(function (Throwable $e, Request $request) {
            if ($request->is('api/*')) {
                if ($e instanceof \Illuminate\Validation\ValidationException) {
                    return response()->json(['message' => 'The given data was invalid.', 'errors' => $e->errors()], 422);
                }
                if ($e instanceof \Illuminate\Auth\AuthenticationException) {
                    return response()->json(['message' => 'Unauthenticated.'], 401);
                }
                if ($e instanceof \Symfony\Component\HttpKernel\Exception\HttpExceptionInterface) {
                    return response()->json(['message' => $e->getMessage() ?: 'Error'], $e->getStatusCode());
                }
                return response()->json(['message' => $e->getMessage() ?: 'Server Error'], 500);
            }
        });
    })->create();
