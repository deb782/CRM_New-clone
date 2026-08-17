<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Lead;
use App\Models\SiteVisit;
use App\Models\Task;
use App\Services\SiteVisitService;
use Carbon\Carbon;
use Illuminate\Http\Request;

class SiteVisitController extends Controller
{
    public function __construct(private SiteVisitService $service) {}

    public function index(Request $request)
    {
        $q = SiteVisit::with(['lead', 'project', 'plot', 'assignee']);
        if ($status = $request->query('status')) {
            $q->where('status', $status);
        }
        if ($request->boolean('upcoming')) {
            $q->where('scheduled_at', '>=', now())->whereIn('status', ['scheduled', 'confirmed', 'rescheduled']);
        }
        if ($owner = $request->query('assigned_to')) {
            $q->where('assigned_to', $owner);
        }
        return response()->json($q->orderBy('scheduled_at')->paginate((int) $request->query('per_page', 50)));
    }

    /** Available 1-hour slots for a date (calendar adapter stub, I1.1). */
    public function slots(Request $request)
    {
        $date = $request->query('date', now()->toDateString());
        $taken = SiteVisit::whereDate('scheduled_at', $date)
            ->whereIn('status', ['scheduled', 'confirmed', 'rescheduled'])
            ->pluck('scheduled_at')->map(fn ($d) => Carbon::parse($d)->format('H:i'))->all();
        $slots = [];
        foreach (range(10, 18) as $h) {
            $t = sprintf('%02d:00', $h);
            $slots[] = ['time' => $t, 'available' => ! in_array($t, $taken, true)];
        }
        return response()->json(['date' => $date, 'slots' => $slots]);
    }

    public function store(Request $request, Lead $lead)
    {
        $data = $request->validate([
            'scheduled_at' => 'required|date',
            'project_id' => 'nullable|exists:projects,id',
            'plot_id' => 'nullable|exists:plots,id',
            'assigned_to' => 'nullable|exists:users,id',
            'duration_min' => 'nullable|integer',
            'meeting_point' => 'nullable|string',
        ]);
        return response()->json(['visit' => $this->service->schedule($lead, $data)], 201);
    }

    public function show(SiteVisit $siteVisit)
    {
        return response()->json(['visit' => $siteVisit->load(['lead', 'project', 'plot', 'assignee'])]);
    }

    public function confirm(SiteVisit $siteVisit)
    {
        return response()->json(['visit' => $this->service->confirm($siteVisit)]);
    }

    public function reschedule(Request $request, SiteVisit $siteVisit)
    {
        $data = $request->validate(['scheduled_at' => 'required|date', 'reason' => 'nullable|string']);
        return response()->json(['visit' => $this->service->reschedule($siteVisit, $data)]);
    }

    /** One-tap confirm of a customer-requested reschedule: move the visit to the proposed slot + close the task. */
    public function confirmReschedule(Task $task)
    {
        $meta = $task->meta ?? [];
        $visit = SiteVisit::where('lead_id', $task->lead_id)->orderByDesc('scheduled_at')->first();
        if (! $visit) {
            return response()->json(['message' => 'No site visit found for this lead.'], 422);
        }
        if (! empty($meta['proposed_at'])) {
            $this->service->reschedule($visit, ['scheduled_at' => $meta['proposed_at'], 'reason' => 'Customer-requested reschedule']);
        }
        $task->update(['completed_at' => now()]);

        return response()->json(['ok' => true, 'visit' => $visit->fresh()]);
    }

    public function checkin(Request $request, SiteVisit $siteVisit)
    {
        return response()->json(['visit' => $this->service->checkIn($siteVisit, $request->input('geo'))]);
    }

    public function checkout(SiteVisit $siteVisit)
    {
        return response()->json(['visit' => $this->service->checkOut($siteVisit)]);
    }

    public function complete(Request $request, SiteVisit $siteVisit)
    {
        $data = $request->validate([
            'outcome' => 'required|in:interested,considering,not_interested,no_show,reschedule',
            'interest_level' => 'nullable|in:very_high,high,medium,low',
            'buyer_interest_score' => 'nullable|integer|min:1|max:10',
            'properties_viewed' => 'nullable|string',
            'buyer_mood' => 'nullable|string',
            'feedback' => 'nullable|string',
            'concerns' => 'nullable|string',
            'loss_reason' => 'nullable|string',
        ]);
        return response()->json(['visit' => $this->service->complete($siteVisit, $data)]);
    }

    public function cancel(Request $request, SiteVisit $siteVisit)
    {
        return response()->json(['visit' => $this->service->cancel($siteVisit, $request->input('reason'))]);
    }
}
