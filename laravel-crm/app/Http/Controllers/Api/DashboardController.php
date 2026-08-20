<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Activity;
use App\Models\Agreement;
use App\Models\Booking;
use App\Models\CostSheet;
use App\Models\DemandLetter;
use App\Models\DiscountApproval;
use App\Models\DocumentChecklistItem;
use App\Models\Lead;
use App\Models\Payment;
use App\Models\PaymentMilestone;
use App\Models\SiteVisit;
use App\Models\Task;
use App\Models\User;
use App\Services\LeadSummaryService;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class DashboardController extends Controller
{
    protected array $stageOrder = [
        'new_lead', 'contacted', 'interested', 'opportunity',
        'site_visit_scheduled', 'site_visit_completed', 'negotiation', 'won',
    ];

    protected array $terminal = ['won', 'lost', 'not_interested', 'no_response'];

    public function stats(Request $request)
    {
        $user = $request->user();
        $dept = $user->role?->department;
        $slug = $user->role?->slug;

        if ($slug === 'admin' || $dept === 'admin') {
            return response()->json($this->adminPayload());
        }
        if ($dept === 'sales') {
            return response()->json($this->salesPayload($user));
        }
        if ($dept === 'accounts') {
            return response()->json($this->accountsPayload());
        }
        if ($dept === 'legal') {
            return response()->json($this->legalPayload());
        }
        if ($dept === 'crm') {
            return response()->json($this->crmPayload());
        }

        return response()->json($this->adminPayload());
    }

    /** On-demand AI summaries for the sales user's top prospects. */
    public function summaries(Request $request, LeadSummaryService $svc)
    {
        $ids = $this->ownerScope($request->user());
        $leads = $this->prospectQuery($ids)->get();

        return response()->json(['summaries' => $svc->generate($leads->all())]);
    }

    // ---------------- Admin (company-wide overview) ----------------
    protected function adminPayload(): array
    {
        $funnel = Lead::selectRaw('status, COUNT(*) as c')->groupBy('status')->pluck('c', 'status');

        return [
            'view' => 'admin',
            'total_leads' => Lead::count(),
            'new_today' => Lead::whereDate('created_at', today())->count(),
            'won_today' => Lead::where('status', 'won')->whereDate('updated_at', today())->count(),
            'hot_leads' => Lead::where('temperature', 'hot')->count(),
            'unverified' => Lead::where('contact_verified', false)->where('is_invalid', false)->count(),
            'open_tasks' => Task::where('status', 'open')->count(),
            'overdue_tasks' => Task::where('status', 'open')->where('due_at', '<', now())->count(),
            'funnel' => $funnel,
            'temperature' => Lead::selectRaw('temperature, COUNT(*) as c')->groupBy('temperature')->pluck('c', 'temperature'),
            'by_source' => Lead::selectRaw('source, COUNT(*) as c')->groupBy('source')->pluck('c', 'source'),
            'automation_failures' => \App\Models\AutomationLog::where('status', 'failed')->count(),
            'recent_leads' => Lead::with('owner')->latest()->limit(8)->get(),
        ];
    }

    // ---------------- Sales (scoped to own / team book) ----------------
    protected function ownerScope(User $user): array
    {
        $tier = $user->role?->tier;
        if ($tier === 'exec') {
            return [$user->id];
        }
        $ids = User::whereHas('role', fn ($q) => $q->where('department', 'sales'))->pluck('id')->all();

        return $ids ?: [$user->id];
    }

    protected function salesPayload(User $user): array
    {
        $ids = $this->ownerScope($user);
        $isTeam = count($ids) > 1 || $user->role?->tier !== 'exec';

        $base = fn () => Lead::whereIn('owner_id', $ids);
        $funnel = (clone $base())->selectRaw('status, COUNT(*) as c')->groupBy('status')->pluck('c', 'status');
        $total = (clone $base())->count();
        $won = (int) ($funnel['won'] ?? 0);

        return [
            'view' => 'sales',
            'scope' => $isTeam ? 'team' : 'you',
            'total_leads' => $total,
            'new_today' => (clone $base())->whereDate('created_at', today())->count(),
            'won_today' => (clone $base())->where('status', 'won')->whereDate('updated_at', today())->count(),
            'new_week' => (clone $base())->where('created_at', '>=', now()->subDays(7))->count(),
            'hot_leads' => (clone $base())->where('temperature', 'hot')->count(),
            'unverified' => (clone $base())->where('contact_verified', false)->where('is_invalid', false)->count(),
            'open_tasks' => Task::whereIn('assigned_to', $ids)->where('status', 'open')->count(),
            'overdue_tasks' => Task::whereIn('assigned_to', $ids)->where('status', 'open')->where('due_at', '<', now())->count(),
            'conversions' => $won,
            'conversion_rate' => $total ? round($won / $total * 100, 1) : 0,
            'funnel' => $funnel,
            'temperature' => (clone $base())->selectRaw('temperature, COUNT(*) as c')->groupBy('temperature')->pluck('c', 'temperature'),
            'by_source' => (clone $base())->selectRaw('source, COUNT(*) as c')->groupBy('source')->pluck('c', 'source'),
            'leads_over_time' => $this->leadsOverTime(14, $ids),
            'journey_map' => $this->journeyMap($funnel),
            'top_prospects' => $this->topProspects($ids),
            'agenda' => $this->agenda($ids),
            'recent_activity' => $this->recentActivity($ids),
        ];
    }

    protected function prospectQuery(array $ownerIds)
    {
        return Lead::query()
            ->whereIn('owner_id', $ownerIds)
            ->whereNotIn('status', $this->terminal)
            ->where('is_invalid', false)
            ->orderByDesc('score')
            ->orderByDesc('last_contacted_at')
            ->limit(5);
    }

    protected function topProspects(array $ownerIds): array
    {
        $svc = app(LeadSummaryService::class);

        return $this->prospectQuery($ownerIds)->with('owner')->get()->map(fn (Lead $l) => [
            'id' => $l->id,
            'name' => $l->name,
            'score' => (int) $l->score,
            'temperature' => $l->temperature,
            'status' => $l->status,
            'property_type' => $l->property_type,
            'owner' => optional($l->owner)->name,
            'last_contacted_at' => $l->last_contacted_at,
            'summary' => $svc->cached($l),
        ])->all();
    }

    protected function leadsOverTime(int $days, ?array $ownerIds = null): array
    {
        $q = Lead::where('created_at', '>=', now()->subDays($days - 1)->startOfDay());
        if ($ownerIds) {
            $q->whereIn('owner_id', $ownerIds);
        }
        $rows = $q->selectRaw('DATE(created_at) as d, COUNT(*) as c')->groupBy('d')->pluck('c', 'd');

        $out = [];
        for ($i = $days - 1; $i >= 0; $i--) {
            $day = now()->subDays($i)->format('Y-m-d');
            $out[] = ['date' => $day, 'count' => (int) ($rows[$day] ?? 0)];
        }

        return $out;
    }

    protected function journeyMap($funnel): array
    {
        $stations = [];
        foreach ($this->stageOrder as $key) {
            $stations[] = [
                'key' => $key,
                'name' => ucwords(str_replace('_', ' ', $key)),
                'count' => (int) ($funnel[$key] ?? 0),
            ];
        }

        return [
            'stations' => $stations,
            'lost' => (int) (($funnel['lost'] ?? 0) + ($funnel['not_interested'] ?? 0) + ($funnel['no_response'] ?? 0)),
        ];
    }

    protected function agenda(array $ownerIds): array
    {
        $to = now()->addDays(21)->endOfDay();
        $from = now()->subDays(30);

        $tasks = Task::with('lead')
            ->whereIn('assigned_to', $ownerIds)
            ->where('status', 'open')
            ->whereNotNull('due_at')
            ->whereBetween('due_at', [$from, $to])
            ->orderBy('due_at')->limit(60)->get()
            ->map(fn (Task $t) => [
                'kind' => 'task', 'id' => $t->id, 'title' => $t->title, 'at' => $t->due_at,
                'date' => optional($t->due_at)->format('Y-m-d'), 'lead_id' => $t->lead_id,
                'lead_name' => optional($t->lead)->name, 'status' => $t->status,
                'priority' => $t->priority, 'overdue' => $t->due_at && $t->due_at->isPast(),
            ]);

        $visits = SiteVisit::with('lead')
            ->whereIn('assigned_to', $ownerIds)
            ->whereBetween('scheduled_at', [$from, $to])
            ->whereNotIn('status', ['cancelled', 'completed'])
            ->orderBy('scheduled_at')->limit(60)->get()
            ->map(fn (SiteVisit $v) => [
                'kind' => 'visit', 'id' => $v->id,
                'title' => 'Site visit'.(optional($v->lead)->name ? ' — '.$v->lead->name : ''),
                'at' => $v->scheduled_at, 'date' => optional($v->scheduled_at)->format('Y-m-d'),
                'lead_id' => $v->lead_id, 'lead_name' => optional($v->lead)->name,
                'status' => $v->status, 'overdue' => $v->scheduled_at && $v->scheduled_at->isPast(),
            ]);

        return $tasks->concat($visits)
            ->filter(fn ($i) => $i['at'] !== null)
            ->sortBy(fn ($i) => Carbon::parse($i['at'])->timestamp)
            ->values()->all();
    }

    protected function recentActivity(?array $ownerIds = null): array
    {
        $q = Activity::with('user')->latest();
        if ($ownerIds) {
            $q->whereIn('user_id', $ownerIds);
        }

        return $q->limit(8)->get()->map(fn (Activity $a) => [
            'id' => $a->id, 'type' => $a->type, 'title' => $a->title,
            'body' => $a->body, 'user' => optional($a->user)->name, 'at' => $a->created_at,
        ])->all();
    }

    protected function inr($n): string
    {
        return \App\Support\Money::inr($n);
    }

    // ---------------- Accounts (collections) ----------------
    protected function accountsPayload(): array
    {
        $due = PaymentMilestone::where('status', '!=', 'paid')->selectRaw('COALESCE(SUM(amount - paid_amount),0) as s')->value('s');
        $overdue = PaymentMilestone::where('status', '!=', 'paid')->where('due_at', '<', now())->selectRaw('COALESCE(SUM(amount - paid_amount),0) as s')->value('s');
        $received = Payment::whereIn('status', ['paid', 'received'])->whereMonth('received_at', now()->month)->whereYear('received_at', now()->year)->sum('amount');
        $gst = CostSheet::whereMonth('created_at', now()->month)->whereYear('created_at', now()->year)->sum('gst_amount');

        $rows = PaymentMilestone::with('lead')->where('status', '!=', 'paid')->whereNotNull('due_at')
            ->orderBy('due_at')->limit(12)->get()->map(fn ($m) => [
                'lead_id' => $m->lead_id,
                'cells' => [
                    optional($m->lead)->name ?: '—',
                    $m->label ?: 'Milestone',
                    $this->inr($m->amount - $m->paid_amount),
                    optional($m->due_at)->format('d M Y') ?: '—',
                    $m->due_at && $m->due_at->isPast() ? 'Overdue' : ucfirst($m->status ?: 'due'),
                ],
            ])->all();

        $receipts = Payment::with('lead')->whereIn('status', ['paid', 'received'])
            ->orderByDesc('received_at')->limit(10)->get()->map(fn ($p) => [
                'lead_id' => $p->lead_id,
                'cells' => [
                    $p->receipt_no ?: '—',
                    optional($p->lead)->name ?: '—',
                    $this->inr($p->amount),
                    ucfirst((string) $p->type),
                    optional($p->received_at)->format('d M Y') ?: '—',
                ],
            ])->all();

        return [
            'view' => 'functional',
            'dept' => 'accounts',
            'heading' => 'Accounts & Finance',
            'sub' => 'Payments received, collections due and GST billed across active bookings',
            'kpis' => [
                ['label' => 'Received This Month', 'value' => $this->inr($received), 'sub' => 'collected', 'tone' => 'up'],
                ['label' => 'Collections Due', 'value' => $this->inr($due), 'sub' => 'outstanding', 'tone' => ''],
                ['label' => 'Overdue', 'value' => $this->inr($overdue), 'sub' => 'past due date', 'tone' => 'down'],
                ['label' => 'GST Billed (MTD)', 'value' => $this->inr($gst), 'sub' => 'this month', 'tone' => ''],
            ],
            'panels' => [
                [
                    'type' => 'table', 'title' => 'Recent Receipts', 'testid' => 'acc-receipts',
                    'columns' => ['Receipt No', 'Customer', 'Amount', 'Type', 'Date'],
                    'rows' => $receipts,
                ],
                [
                    'type' => 'table', 'title' => 'Upcoming & Overdue Payments', 'testid' => 'acc-payments',
                    'columns' => ['Customer', 'Milestone', 'Amount Due', 'Due Date', 'Status'],
                    'rows' => $rows,
                ],
            ],
            'extra' => [
                'discount_pending' => DiscountApproval::where('status', 'pending')->count(),
            ],
        ];
    }

    // ---------------- Legal (agreements & documents) ----------------
    protected function legalPayload(): array
    {
        $pendingAgr = Agreement::whereNotIn('status', ['signed', 'registered'])->count();
        $docsPending = DocumentChecklistItem::whereNotIn('status', ['verified', 'received'])->count();
        $registered = Agreement::where('status', 'registered')->count();

        $rows = Agreement::with('lead')->whereNotIn('status', ['registered'])
            ->orderByDesc('created_at')->limit(12)->get()->map(fn ($a) => [
                'lead_id' => $a->lead_id,
                'cells' => [
                    optional($a->lead)->name ?: '—',
                    strtoupper($a->type ?: 'Agreement'),
                    $a->serial_no ?: '—',
                    ucfirst(str_replace('_', ' ', $a->status ?: 'draft')),
                    optional($a->sent_for_sign_at)->format('d M Y') ?: '—',
                ],
            ])->all();

        return [
            'view' => 'functional',
            'dept' => 'legal',
            'heading' => 'Legal & Documentation',
            'sub' => 'Agreements to process and documents pending verification',
            'kpis' => [
                ['label' => 'Agreements Pending', 'value' => (string) $pendingAgr, 'sub' => 'to sign / register', 'tone' => 'down'],
                ['label' => 'Documents Pending', 'value' => (string) $docsPending, 'sub' => 'awaiting verification', 'tone' => ''],
                ['label' => 'Registered', 'value' => (string) $registered, 'sub' => 'completed', 'tone' => 'up'],
                ['label' => 'Booking Files', 'value' => (string) Booking::whereNotNull('verified_at')->count(), 'sub' => 'verified bookings', 'tone' => ''],
            ],
            'panels' => [[
                'type' => 'table', 'title' => 'Agreements In Progress', 'testid' => 'legal-agreements',
                'columns' => ['Customer', 'Type', 'Serial No', 'Status', 'Sent For Sign'],
                'rows' => $rows,
            ]],
        ];
    }

    // ---------------- CRM (post-sales / customer) ----------------
    protected function crmPayload(): array
    {
        $activeBookings = Booking::whereNotNull('verified_at')->whereNull('cancelled_at')->count();
        $docsPending = DocumentChecklistItem::whereNotIn('status', ['verified', 'received'])->count();
        $upcomingVisits = SiteVisit::where('scheduled_at', '>=', now())->whereNotIn('status', ['cancelled', 'completed'])->count();
        $openTasks = Task::where('status', 'open')->count();

        $rows = Booking::with('lead')->orderByDesc('created_at')->limit(12)->get()->map(fn ($b) => [
            'lead_id' => $b->lead_id,
            'cells' => [
                $b->booking_ref ?: ('#'.$b->id),
                optional($b->lead)->name ?: '—',
                $this->inr($b->deal_value),
                ucfirst(str_replace('_', ' ', $b->status ?: 'draft')),
                optional($b->created_at)->format('d M Y'),
            ],
        ])->all();

        return [
            'view' => 'functional',
            'dept' => 'crm',
            'heading' => 'Customer Success',
            'sub' => 'Bookings, documentation and customer follow-ups',
            'kpis' => [
                ['label' => 'Active Bookings', 'value' => (string) $activeBookings, 'sub' => 'live customers', 'tone' => 'up'],
                ['label' => 'Docs Pending', 'value' => (string) $docsPending, 'sub' => 'to collect', 'tone' => ''],
                ['label' => 'Upcoming Visits', 'value' => (string) $upcomingVisits, 'sub' => 'scheduled', 'tone' => ''],
                ['label' => 'Open Tasks', 'value' => (string) $openTasks, 'sub' => 'across team', 'tone' => ''],
            ],
            'panels' => [[
                'type' => 'table', 'title' => 'Recent Bookings', 'testid' => 'crm-bookings',
                'columns' => ['Ref', 'Customer', 'Deal Value', 'Status', 'Created'],
                'rows' => $rows,
            ]],
        ];
    }
}
