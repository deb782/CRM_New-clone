<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Lead;
use App\Models\LeadStatus;
use App\Models\SiteVisit;
use App\Models\Task;
use App\Models\User;
use App\Models\VisitEngagement;
use Illuminate\Http\Request;

/**
 * Data feeds for the three role command-center dashboards:
 *   /dashboards/bde   — Pre-Sales "Focus Stream"
 *   /dashboards/bdm   — Sales "Opportunity Canvas"
 *   /dashboards/admin — Sales-Admin "Command Matrix"
 */
class SalesDashboardController extends Controller
{
    public function show(Request $request, string $role)
    {
        return match ($role) {
            'bde' => response()->json($this->bde($request)),
            'bdm' => response()->json($this->bdm($request)),
            'admin' => response()->json($this->admin($request)),
            default => response()->json(['message' => 'Unknown dashboard.'], 404),
        };
    }

    // ---------------- BDE ----------------
    private function bde(Request $request): array
    {
        $userId = (int) ($request->query('user_id') ?: $request->user()->id);
        $bdeCodes = LeadStatus::where('status_group', 'bde')->pluck('display_name', 'code');
        $today = now()->startOfDay();

        $openTasks = Task::whereNull('completed_at')
            ->where('assigned_to', $userId)
            ->with('lead:id,name,phone,status_code,temperature,score,source')
            ->orderByRaw('due_at IS NULL, due_at ASC')
            ->limit(40)->get();

        $stack = $openTasks->map(function ($t) use ($bdeCodes) {
            $mins = $t->due_at ? now()->diffInMinutes($t->due_at, false) : null;
            return [
                'id' => $t->id,
                'title' => $t->title,
                'type' => $t->type,
                'priority' => $t->priority,
                'due_at' => $t->due_at?->toIso8601String(),
                'minutes_to_due' => $mins,
                'bucket' => $mins === null ? 'green' : ($mins < 0 ? 'breached' : ($mins < 60 ? 'red' : ($mins < 240 ? 'amber' : 'green'))),
                'lead' => $t->lead ? [
                    'id' => $t->lead->id,
                    'name' => $t->lead->name,
                    'phone' => $t->lead->phone,
                    'status_code' => $t->lead->status_code,
                    'status_label' => $bdeCodes[$t->lead->status_code] ?? $t->lead->status_code,
                    'temperature' => $t->lead->temperature,
                    'score' => $t->lead->score,
                    'source' => $t->lead->source,
                ] : null,
            ];
        })->values();

        $owned = Lead::where('owner_id', $userId)->whereIn('status_code', $bdeCodes->keys());
        $cadence = (clone $owned)->selectRaw('status_code, count(*) c')->groupBy('status_code')->pluck('c', 'status_code');

        return [
            'stats' => [
                'calls_due_today' => (clone $openTasks->toBase())->filter(fn ($t) => $t->due_at && $t->due_at->lt($today->copy()->addDay()))->count(),
                'open_tasks' => $openTasks->count(),
                'contacted_today' => Lead::where('owner_id', $userId)->where('status_code', 'CONTACTED')->where('updated_at', '>=', $today)->count(),
                'followups_pending' => (clone $owned)->whereIn('status_code', ['FOLLOWUP_1', 'FOLLOWUP_2', 'FOLLOWUP_3'])->count(),
                'converted_month' => Lead::where('owner_id', $userId)->where('status_code', 'CONVERTED_OPPORTUNITY')->where('updated_at', '>=', now()->startOfMonth())->count(),
            ],
            'work_stack' => $stack,
            'cadence' => $this->laneCadence('bde', $cadence),
        ];
    }

    // ---------------- BDM ----------------
    private function bdm(Request $request): array
    {
        $userId = (int) ($request->query('user_id') ?: $request->user()->id);
        $isAll = $request->boolean('all');
        $oppCodes = LeadStatus::where('status_group', 'bdm')->pluck('display_name', 'code');

        $leadQ = Lead::whereIn('status_code', $oppCodes->keys());
        if (! $isAll) {
            $leadQ->where('owner_id', $userId);
        }
        $pipeline = (clone $leadQ)->selectRaw('status_code, count(*) c')->groupBy('status_code')->pluck('c', 'status_code');

        $visitQ = SiteVisit::whereIn('status', ['scheduled', 'confirmed', 'rescheduled'])
            ->where('scheduled_at', '>=', now())
            ->with('lead:id,name,phone,status_code,owner_id');
        if (! $isAll) {
            $visitQ->where('assigned_to', $userId);
        }
        $upcoming = $visitQ->orderBy('scheduled_at')->limit(30)->get()->map(fn ($v) => [
            'id' => $v->id,
            'scheduled_at' => $v->scheduled_at?->toIso8601String(),
            'status' => $v->status,
            'lead' => $v->lead ? ['id' => $v->lead->id, 'name' => $v->lead->name, 'phone' => $v->lead->phone, 'status_code' => $v->lead->status_code] : null,
        ])->values();

        $engQ = VisitEngagement::where('active', true)->with('lead:id,name');
        if (! $isAll) {
            $engQ->whereHas('lead', fn ($q) => $q->where('owner_id', $userId));
        }
        $engagements = $engQ->orderBy('next_send_at')->limit(30)->get()->map(fn ($e) => [
            'lead' => $e->lead ? ['id' => $e->lead->id, 'name' => $e->lead->name] : null,
            'mode' => $e->mode,
            'sends_done' => $e->sends_done,
            'total_sends' => $e->total_sends,
            'next_send_at' => $e->next_send_at?->toIso8601String(),
            'appointment_at' => $e->appointment_at?->toIso8601String(),
        ])->values();

        $wonQ = Lead::where('status_code', 'OPP_WON')->where('updated_at', '>=', now()->startOfMonth());
        $lostQ = Lead::whereIn('status_code', ['OPP_LOST', 'OPP_POST_SV_LOST'])->where('updated_at', '>=', now()->startOfMonth());
        if (! $isAll) {
            $wonQ->where('owner_id', $userId);
            $lostQ->where('owner_id', $userId);
        }

        return [
            'stats' => [
                'active_opportunities' => (clone $leadQ)->whereNotIn('status_code', ['OPP_WON', 'OPP_LOST', 'OPP_POST_SV_LOST'])->count(),
                'upcoming_visits' => $upcoming->count(),
                'active_nudges' => $engagements->count(),
                'won_month' => $wonQ->count(),
                'lost_month' => $lostQ->count(),
            ],
            'pipeline' => $this->laneCadence('bdm', $pipeline),
            'upcoming' => $upcoming,
            'engagements' => $engagements,
            'calendar' => $this->calendarFull($userId, $isAll),
        ];
    }

    // ---------------- ADMIN ----------------
    private function admin(Request $request): array
    {
        $bde = LeadStatus::where('status_group', 'bde')->pluck('display_name', 'code');
        $bdm = LeadStatus::where('status_group', 'bdm')->pluck('display_name', 'code');

        $bdeCounts = Lead::whereIn('status_code', $bde->keys())->selectRaw('status_code, count(*) c')->groupBy('status_code')->pluck('c', 'status_code');
        $bdmCounts = Lead::whereIn('status_code', $bdm->keys())->selectRaw('status_code, count(*) c')->groupBy('status_code')->pluck('c', 'status_code');

        return [
            'stats' => [
                'total_open' => Lead::whereNotIn('status_code', ['OPP_WON', 'OPP_LOST', 'OPP_POST_SV_LOST', 'JUNK_INVALID', 'UNRESPONSIVE', 'LOST'])->whereNotNull('status_code')->count(),
                'opportunities' => Lead::whereIn('status_code', $bdm->keys())->whereNotIn('status_code', ['OPP_WON', 'OPP_LOST', 'OPP_POST_SV_LOST'])->count(),
                'won_month' => Lead::where('status_code', 'OPP_WON')->where('updated_at', '>=', now()->startOfMonth())->count(),
                'lost_month' => Lead::whereIn('status_code', ['OPP_LOST', 'OPP_POST_SV_LOST'])->where('updated_at', '>=', now()->startOfMonth())->count(),
                'active_nudges' => VisitEngagement::where('active', true)->count(),
                'upcoming_visits' => SiteVisit::whereIn('status', ['scheduled', 'confirmed', 'rescheduled'])->where('scheduled_at', '>=', now())->count(),
            ],
            'funnel_bde' => $this->laneCadence('bde', $bdeCounts),
            'funnel_bdm' => $this->laneCadence('bdm', $bdmCounts),
            'calendar' => $this->calendarVisits(),
        ];
    }

    /** Site visits / meetings for the current month (optionally scoped to one owner). */
    private function calendarVisits(?int $ownerId = null): array
    {
        $q = SiteVisit::whereBetween('scheduled_at', [now()->startOfMonth(), now()->endOfMonth()])->with('lead:id,name');
        if ($ownerId) {
            $q->where('assigned_to', $ownerId);
        }

        return $q->orderBy('scheduled_at')->get()->map(fn ($v) => [
            'date' => $v->scheduled_at?->toDateString(),
            'at' => $v->scheduled_at?->toIso8601String(),
            'title' => 'Site visit · ' . ($v->lead?->name ?? 'Lead'),
            'kind' => 'visit',
            'lead_id' => $v->lead_id,
            'lead_name' => $v->lead?->name,
            'status' => $v->status,
        ])->values()->all();
    }

    /** Everything on a rep's plate this month — visits + tasks. */
    private function calendarFull(int $userId, bool $isAll): array
    {
        $items = $this->calendarVisits($isAll ? null : $userId);
        $tq = Task::whereNull('completed_at')->whereBetween('due_at', [now()->startOfMonth(), now()->endOfMonth()])->with('lead:id,name');
        if (! $isAll) {
            $tq->where('assigned_to', $userId);
        }
        foreach ($tq->orderBy('due_at')->get() as $t) {
            $items[] = [
                'date' => $t->due_at?->toDateString(),
                'at' => $t->due_at?->toIso8601String(),
                'title' => $t->title,
                'kind' => 'task',
                'lead_id' => $t->lead_id,
                'lead_name' => $t->lead?->name,
                'status' => $t->priority,
            ];
        }

        return $items;
    }

    /** Ordered status list for a group, each annotated with its live count + colour. */
    private function laneCadence(string $group, $counts): array
    {
        return LeadStatus::where('status_group', $group)->orderBy('sort')->get()->map(fn ($s) => [
            'code' => $s->code,
            'display_name' => $s->display_name,
            'stage_name' => $s->stage_name,
            'color' => $s->color,
            'count' => (int) ($counts[$s->code] ?? 0),
        ])->values()->all();
    }
}
