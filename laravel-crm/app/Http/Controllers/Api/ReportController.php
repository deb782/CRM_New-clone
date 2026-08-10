<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\Lead;
use App\Models\Payment;
use App\Models\SiteVisit;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ReportController extends Controller
{
    /** A — Sales performance. */
    public function sales(Request $request)
    {
        $total = Lead::count();
        $won = Lead::where('status', 'won')->count();
        $funnel = Lead::select('status', DB::raw('count(*) as c'))->groupBy('status')->pluck('c', 'status');
        $bySource = Lead::select('source', DB::raw('count(*) as c'))->groupBy('source')->orderByDesc('c')->get();
        $byTemp = Lead::select('temperature', DB::raw('count(*) as c'))->groupBy('temperature')->pluck('c', 'temperature');
        $byOwner = Lead::select('owner_id', DB::raw('count(*) as leads'),
                DB::raw("sum(case when status='won' then 1 else 0 end) as won"))
            ->whereNotNull('owner_id')->groupBy('owner_id')->get();
        $names = User::whereIn('id', $byOwner->pluck('owner_id'))->pluck('name', 'id');
        $reps = $byOwner->map(fn ($r) => [
            'name' => $names[$r->owner_id] ?? 'Unassigned',
            'leads' => (int) $r->leads,
            'won' => (int) $r->won,
            'rate' => $r->leads ? round($r->won / $r->leads * 100, 1) : 0,
        ])->sortByDesc('leads')->values();
        $ageing = [
            '0-7d' => Lead::where('created_at', '>=', now()->subDays(7))->count(),
            '8-30d' => Lead::whereBetween('created_at', [now()->subDays(30), now()->subDays(7)])->count(),
            '31-90d' => Lead::whereBetween('created_at', [now()->subDays(90), now()->subDays(30)])->count(),
            '90d+' => Lead::where('created_at', '<', now()->subDays(90))->count(),
        ];
        $data = [
            'total_leads' => $total,
            'won' => $won,
            'conversion_rate' => $total ? round($won / $total * 100, 1) : 0,
            'funnel' => $funnel,
            'by_source' => $bySource,
            'by_temperature' => $byTemp,
            'by_rep' => $reps,
            'ageing' => $ageing,
        ];
        if ($request->query('format') === 'csv') {
            return $this->csv('sales-performance', ['Rep', 'Leads', 'Won', 'Conversion %'],
                $reps->map(fn ($r) => [$r['name'], $r['leads'], $r['won'], $r['rate']]));
        }
        return response()->json($data);
    }

    /** L/N/P — Financial. */
    public function financial(Request $request)
    {
        $collected = (int) Payment::whereIn('status', ['received', 'verified', 'reconciled'])->sum('amount');
        $byStatus = Payment::select('status', DB::raw('count(*) as c'), DB::raw('coalesce(sum(amount),0) as total'))
            ->groupBy('status')->get();
        $byType = Payment::select('type', DB::raw('coalesce(sum(amount),0) as total'), DB::raw('count(*) as c'))
            ->groupBy('type')->get();
        $bookingsByStatus = Booking::select('status', DB::raw('count(*) as c'), DB::raw('coalesce(sum(deal_value),0) as value'))
            ->groupBy('status')->get();
        $dealValue = (int) Booking::sum('deal_value');
        $tokenCollected = (int) Payment::whereIn('type', ['token', 'eoi'])->whereIn('status', ['received', 'verified', 'reconciled'])->sum('amount');
        $data = [
            'collected' => $collected,
            'deal_value' => $dealValue,
            'token_collected' => $tokenCollected,
            'outstanding' => max($dealValue - $collected, 0),
            'payments_by_status' => $byStatus,
            'payments_by_type' => $byType,
            'bookings_by_status' => $bookingsByStatus,
        ];
        if ($request->query('format') === 'csv') {
            return $this->csv('financial', ['Payment Status', 'Count', 'Total (INR)'],
                $byStatus->map(fn ($r) => [$r->status, $r->c, $r->total]));
        }
        return response()->json($data);
    }

    /** I/J/H — Activity & SLA. */
    public function activity(Request $request)
    {
        $visits = SiteVisit::select('status', DB::raw('count(*) as c'))->groupBy('status')->pluck('c', 'status');
        $byOwner = Lead::select('owner_id',
                DB::raw('count(*) as leads'),
                DB::raw("sum(case when last_contacted_at is not null then 1 else 0 end) as contacted"))
            ->whereNotNull('owner_id')->groupBy('owner_id')->get();
        $names = User::whereIn('id', $byOwner->pluck('owner_id'))->pluck('name', 'id');
        $reps = $byOwner->map(fn ($r) => [
            'name' => $names[$r->owner_id] ?? 'Unassigned',
            'leads' => (int) $r->leads,
            'contacted' => (int) $r->contacted,
            'pending' => (int) $r->leads - (int) $r->contacted,
        ])->sortByDesc('leads')->values();
        $tasksOpen = 0; $tasksOverdue = 0;
        try {
            $tasksOpen = DB::table('tasks')->whereNull('completed_at')->count();
            $tasksOverdue = DB::table('tasks')->whereNull('completed_at')->where('due_at', '<', now())->count();
        } catch (\Throwable $e) { /* columns may differ */ }
        $data = [
            'site_visits' => $visits,
            'tasks_open' => $tasksOpen,
            'tasks_overdue' => $tasksOverdue,
            'by_rep' => $reps,
        ];
        if ($request->query('format') === 'csv') {
            return $this->csv('activity-sla', ['Rep', 'Leads', 'Contacted', 'Pending'],
                $reps->map(fn ($r) => [$r['name'], $r['leads'], $r['contacted'], $r['pending']]));
        }
        return response()->json($data);
    }

    private function csv(string $name, array $header, $rows)
    {
        $out = fopen('php://temp', 'r+');
        fputcsv($out, $header);
        foreach ($rows as $row) {
            fputcsv($out, is_array($row) ? $row : (array) $row);
        }
        rewind($out);
        $csv = stream_get_contents($out);
        fclose($out);
        return response($csv, 200, [
            'Content-Type' => 'text/csv',
            'Content-Disposition' => 'attachment; filename="agrocorp-'.$name.'-'.now()->format('Ymd').'.csv"',
        ]);
    }
}
