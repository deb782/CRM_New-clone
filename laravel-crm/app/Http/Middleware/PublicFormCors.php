<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Open CORS for public form endpoints (schema GET + submit POST + OPTIONS preflight).
 * Allows external websites to embed CRM forms without cross-origin errors.
 */
class PublicFormCors
{
    public function handle(Request $request, Closure $next): Response
    {
        // Preflight short-circuit
        if ($request->getMethod() === 'OPTIONS') {
            return response('', 204, $this->headers());
        }
        /** @var Response $response */
        $response = $next($request);
        foreach ($this->headers() as $k => $v) $response->headers->set($k, $v);
        return $response;
    }

    private function headers(): array
    {
        return [
            'Access-Control-Allow-Origin'      => '*',
            'Access-Control-Allow-Methods'     => 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers'     => 'Content-Type, Accept, Origin, X-Requested-With',
            'Access-Control-Max-Age'           => '86400',
        ];
    }
}
