<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Expense;
use App\Models\Project;
use App\Models\RevenueTarget;
use App\Support\ProjectScope;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class FinanceController extends Controller
{
    private array $receivedStatuses = ['received', 'verified', 'reconciled'];

    /**
     * Per-project revenue roll-up derived from existing bookings/payments,
     * with approved-expense costs and target-vs-variance for the chosen period.
     */
    public function overview(Request $request)
    {
        $user = $request->user();
        $scopeIds = ProjectScope::ids($user);
        $period = $request->query('period', now()->format('Y-m')); // YYYY-MM
        $periodType = $request->query('period_type', 'month');

        $projectsQ = Project::query();
        if ($scopeIds !== null) {
            $projectsQ->whereIn('id', $scopeIds);
        }
        $projects = $projectsQ->orderBy('name')->get();
        $projectIds = $projects->pluck('id')->all();

        // Booked (accrued) value from non-cancelled bookings.
        $booked = DB::table('bookings')
            ->whereIn('project_id', $projectIds)
            ->where('status', '!=', 'cancelled')
            ->groupBy('project_id')
            ->select('project_id', DB::raw('SUM(deal_value) as v'), DB::raw('COUNT(*) as c'))
            ->pluck('v', 'project_id');
        $bookedCount = DB::table('bookings')
            ->whereIn('project_id', $projectIds)
            ->where('status', '!=', 'cancelled')
            ->groupBy('project_id')
            ->select('project_id', DB::raw('COUNT(*) as c'))
            ->pluck('c', 'project_id');

        // Received (all-time) from payments joined to their booking's project.
        $received = DB::table('payments')
            ->join('bookings', 'payments.booking_id', '=', 'bookings.id')
            ->whereIn('bookings.project_id', $projectIds)
            ->whereIn('payments.status', $this->receivedStatuses)
            ->groupBy('bookings.project_id')
            ->select('bookings.project_id', DB::raw('SUM(payments.amount) as v'))
            ->pluck('v', 'bookings.project_id');

        // Received within the selected period (for target-vs-variance).
        $periodReceived = DB::table('payments')
            ->join('bookings', 'payments.booking_id', '=', 'bookings.id')
            ->whereIn('bookings.project_id', $projectIds)
            ->whereIn('payments.status', $this->receivedStatuses)
            ->where(function ($q) use ($period, $periodType) {
                if ($periodType === 'quarter') {
                    [$y, $qn] = array_pad(explode('-Q', $period), 2, null);
                    $months = $this->quarterMonths((int) $qn);
                    $q->whereYear('payments.received_at', (int) $y)
                        ->whereIn(DB::raw('MONTH(payments.received_at)'), $months);
                } else {
                    $q->whereRaw("DATE_FORMAT(payments.received_at, '%Y-%m') = ?", [$period]);
                }
            })
            ->groupBy('bookings.project_id')
            ->select('bookings.project_id', DB::raw('SUM(payments.amount) as v'))
            ->pluck('v', 'bookings.project_id');

        // Approved-expense cost per project (all-time).
        $expenses = DB::table('expenses')
            ->whereIn('project_id', $projectIds)
            ->where('status', 'approved')
            ->groupBy('project_id')
            ->select('project_id', DB::raw('SUM(amount) as v'))
            ->pluck('v', 'project_id');

        $targets = RevenueTarget::whereIn('project_id', $projectIds)
            ->where('period_type', $periodType)
            ->where('period', $period)
            ->pluck('amount', 'project_id');

        $rows = $projects->map(function (Project $p) use ($booked, $bookedCount, $received, $periodReceived, $expenses, $targets) {
            $acc = (int) ($booked[$p->id] ?? 0);
            $rec = (int) ($received[$p->id] ?? 0);
            $tgt = (int) ($targets[$p->id] ?? 0);
            $pRec = (int) ($periodReceived[$p->id] ?? 0);
            return [
                'project_id' => $p->id,
                'project' => $p->name,
                'code' => $p->code,
                'bookings' => (int) ($bookedCount[$p->id] ?? 0),
                'accrued' => $acc,
                'received' => $rec,
                'receivable' => max(0, $acc - $rec),
                'expenses' => (int) ($expenses[$p->id] ?? 0),
                'net' => $rec - (int) ($expenses[$p->id] ?? 0),
                'target' => $tgt,
                'period_received' => $pRec,
                'variance' => $pRec - $tgt,
            ];
        });

        return response()->json([
            'period' => $period,
            'period_type' => $periodType,
            'rows' => $rows,
            'totals' => [
                'accrued' => $rows->sum('accrued'),
                'received' => $rows->sum('received'),
                'receivable' => $rows->sum('receivable'),
                'expenses' => $rows->sum('expenses'),
                'net' => $rows->sum('net'),
                'target' => $rows->sum('target'),
                'period_received' => $rows->sum('period_received'),
                'variance' => $rows->sum('variance'),
            ],
        ]);
    }

    public function targets(Request $request)
    {
        $q = RevenueTarget::with('project:id,name,code');
        ProjectScope::apply($q, $request->user());
        if ($project = $request->query('project_id')) {
            $q->where('project_id', $project);
        }
        return response()->json(['data' => $q->orderByDesc('period')->get()]);
    }

    public function saveTarget(Request $request)
    {
        $data = $request->validate([
            'project_id' => 'required|exists:projects,id',
            'period_type' => 'required|in:month,quarter',
            'period' => 'required|string|max:10',
            'amount' => 'required|integer|min:0',
        ]);
        $target = RevenueTarget::updateOrCreate(
            ['project_id' => $data['project_id'], 'period_type' => $data['period_type'], 'period' => $data['period']],
            ['amount' => $data['amount']]
        );
        return response()->json(['target' => $target], 201);
    }

    private function quarterMonths(int $q): array
    {
        return match ($q) {
            1 => [1, 2, 3],
            2 => [4, 5, 6],
            3 => [7, 8, 9],
            4 => [10, 11, 12],
            default => [1, 2, 3],
        };
    }
}
