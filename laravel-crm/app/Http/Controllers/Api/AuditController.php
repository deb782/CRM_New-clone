<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\AutomationLog;
use App\Models\CommunicationLog;
use App\Models\Lead;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AuditController extends Controller
{
    /** T1 — full audit trail with filters. */
    public function index(Request $request)
    {
        $q = AuditLog::with('user:id,name')->latest();
        if ($type = $request->query('auditable_type')) {
            $q->where('auditable_type', 'like', '%'.$type.'%');
        }
        if ($id = $request->query('auditable_id')) {
            $q->where('auditable_id', $id);
        }
        if ($action = $request->query('action')) {
            $q->where('action', $action);
        }
        if ($user = $request->query('user_id')) {
            $q->where('user_id', $user);
        }
        if ($from = $request->query('from')) {
            $q->where('created_at', '>=', $from);
        }
        if ($to = $request->query('to')) {
            $q->where('created_at', '<=', $to);
        }
        return response()->json($q->paginate((int) $request->query('per_page', 50)));
    }

    /** T2 — system / integration health dashboard. */
    public function health()
    {
        $comm = CommunicationLog::select('status', DB::raw('count(*) as c'))->groupBy('status')->pluck('c', 'status');
        $commByChannel = CommunicationLog::select('channel', DB::raw('count(*) as c'))->groupBy('channel')->pluck('c', 'channel');
        $auto = AutomationLog::select('status', DB::raw('count(*) as c'))->groupBy('status')->pluck('c', 'status');

        $recentErrors = AutomationLog::where('status', 'failed')->with('rule:id,name')->latest()->limit(20)->get()
            ->map(fn ($l) => [
                'id' => $l->id, 'kind' => 'automation', 'event' => $l->event, 'action' => $l->action,
                'message' => $l->message, 'at' => $l->created_at, 'rule' => $l->rule?->name,
            ])->values();

        $integrations = [
            ['name' => 'WhatsApp', 'driver' => config('integrations.whatsapp.driver'), 'live' => config('integrations.whatsapp.driver') !== 'mock'],
            ['name' => 'Telephony', 'driver' => config('integrations.telephony.driver'), 'live' => config('integrations.telephony.driver') !== 'mock'],
            ['name' => 'Email', 'driver' => config('mail.default'), 'live' => config('mail.default') !== 'log'],
            ['name' => 'SMS', 'driver' => config('integrations.sms.driver'), 'live' => config('integrations.sms.driver') !== 'mock'],
            ['name' => 'Razorpay', 'driver' => config('integrations.razorpay.key_id') ? 'live' : 'mock', 'live' => (bool) config('integrations.razorpay.key_id')],
            ['name' => 'E-Sign', 'driver' => config('integrations.esign.driver'), 'live' => config('integrations.esign.driver') !== 'mock'],
        ];

        return response()->json([
            'communications' => [
                'total' => (int) $comm->sum(),
                'failed' => (int) ($comm['failed'] ?? 0),
                'by_status' => $comm,
                'by_channel' => $commByChannel,
            ],
            'automation' => [
                'total' => (int) $auto->sum(),
                'success' => (int) ($auto['success'] ?? 0),
                'failed' => (int) ($auto['failed'] ?? 0),
            ],
            'integrations' => $integrations,
            'recent_errors' => $recentErrors,
        ]);
    }

    /** T3 — live search performance probe (acceptance: < 2s). */
    public function performance(Request $request)
    {
        $term = $request->query('q', 'a');
        $total = Lead::count();

        $start = microtime(true);
        $results = Lead::query()
            ->where(function ($w) use ($term) {
                $w->where('name', 'like', "%{$term}%")
                    ->orWhere('email', 'like', "%{$term}%")
                    ->orWhere('phone', 'like', "%{$term}%");
            })
            ->orderByDesc('score')
            ->limit(25)->get(['id', 'name']);
        $ms = round((microtime(true) - $start) * 1000, 1);

        return response()->json([
            'total_leads' => $total,
            'search_term' => $term,
            'result_count' => $results->count(),
            'elapsed_ms' => $ms,
            'target_ms' => 2000,
            'within_target' => $ms < 2000,
        ]);
    }
}
