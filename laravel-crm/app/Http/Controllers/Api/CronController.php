<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\EngagementService;
use Illuminate\Http\Request;

class CronController extends Controller
{
    // Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    public function engagementNudge(Request $request, EngagementService $engagement)
    {
        $secret = (string) env('WEBHOOK_CRON_SECRET', '');
        $header = (string) $request->bearerToken();
        if ($secret === '' || ! hash_equals($secret, $header)) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        // Single-tenant CRM → tiny volume; dispatch inline and return quickly.
        $sent = $engagement->dispatchDue();

        return response()->json(['ok' => true, 'sent' => $sent]);
    }
}
