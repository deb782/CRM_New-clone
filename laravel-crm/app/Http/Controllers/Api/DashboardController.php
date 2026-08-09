<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AutomationLog;
use App\Models\Lead;
use App\Models\Task;

class DashboardController extends Controller
{
    public function stats()
    {
        $funnel = Lead::selectRaw('status, COUNT(*) as c')->groupBy('status')->pluck('c', 'status');
        $temperature = Lead::selectRaw('temperature, COUNT(*) as c')->groupBy('temperature')->pluck('c', 'temperature');
        $bySource = Lead::selectRaw('source, COUNT(*) as c')->groupBy('source')->pluck('c', 'source');

        return response()->json([
            'total_leads' => Lead::count(),
            'new_today' => Lead::whereDate('created_at', today())->count(),
            'hot_leads' => Lead::where('temperature', 'hot')->count(),
            'unverified' => Lead::where('contact_verified', false)->where('is_invalid', false)->count(),
            'open_tasks' => Task::where('status', 'open')->count(),
            'overdue_tasks' => Task::where('status', 'open')->where('due_at', '<', now())->count(),
            'funnel' => $funnel,
            'temperature' => $temperature,
            'by_source' => $bySource,
            'automation_failures' => AutomationLog::where('status', 'failed')->count(),
            'recent_leads' => Lead::with('owner')->latest()->limit(8)->get(),
        ]);
    }
}
