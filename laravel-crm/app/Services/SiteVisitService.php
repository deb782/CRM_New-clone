<?php

namespace App\Services;

use App\Models\Lead;
use App\Models\Plot;
use App\Models\SiteVisit;
use App\Models\Task;
use Carbon\Carbon;
use Illuminate\Support\Facades\Auth;

class SiteVisitService
{
    public function __construct(
        private LeadService $leads,
        private ActivityService $activity,
        private EmailService $email,
        private WhatsAppService $whatsapp,
        private FlowEngine $flow,
        private EngagementService $engagement,
    ) {}

    /** Schedule a site visit (I1.1). Confirmation sent via email + WhatsApp; reminders scheduled. */
    public function schedule(Lead $lead, array $data): SiteVisit
    {
        $visit = SiteVisit::create([
            'lead_id' => $lead->id,
            'project_id' => $data['project_id'] ?? $lead->project_id,
            'plot_id' => $data['plot_id'] ?? null,
            'assigned_to' => $data['assigned_to'] ?? $lead->owner_id ?? Auth::id(),
            'scheduled_at' => Carbon::parse($data['scheduled_at']),
            'duration_min' => $data['duration_min'] ?? 60,
            'meeting_point' => $data['meeting_point'] ?? null,
            'status' => 'scheduled',
            'confirmation_status' => 'pending',
        ]);

        $mode = ($data['mode'] ?? 'site_visit') === 'google_meet' ? 'google_meet' : 'site_visit';

        // BDE conversion: fire the customer booking confirmation, hand the lead to a BDM,
        // then open the BDM Opportunity pipeline (separate status group).
        $this->flow->applyStatus($lead, 'CONVERTED_OPPORTUNITY', false, Auth::id(), 'Site visit booked');
        $bdm = $this->handToBdm($lead, $visit);
        $lead->refresh();
        $this->flow->applyStatus($lead, 'OPP_NOT_CONTACTED', false, Auth::id(), 'Entered BDM Opportunity pipeline');
        $lead->refresh();

        // BDM slot-confirmation task (goes to the BDM now owning the lead).
        $when = $visit->scheduled_at->format('D, d M Y · h:i A');
        $modeLabel = $mode === 'google_meet' ? 'Google Meet' : 'site visit';
        Task::create([
            'lead_id' => $lead->id,
            'assigned_to' => $lead->owner_id ?? $visit->assigned_to,
            'title' => 'Confirm '.$modeLabel.' slot with '.$lead->name.' ('.$when.')',
            'type' => 'call',
            'due_at' => now()->addHours(4),
            'priority' => 'high',
            'meta' => ['site_visit_id' => $visit->id, 'bdm_handover' => true],
        ]);

        // Original site-visit execution task (kept for the visit day).
        Task::create([
            'lead_id' => $lead->id,
            'assigned_to' => $visit->assigned_to,
            'title' => 'Conduct '.$modeLabel.': '.$lead->name,
            'type' => 'follow_up',
            'due_at' => $visit->scheduled_at,
            'priority' => 'high',
            'meta' => ['site_visit_id' => $visit->id],
        ]);

        if ($lead->email) {
            $this->email->send($lead, 'Your '.$modeLabel.' is confirmed', "Hi {$lead->name},\n\nWe've scheduled your {$modeLabel} for {$when}.\nMeeting point: ".($visit->meeting_point ?: 'Sales office')."\n\nSee you there!");
        }
        $this->activity->log($lead, 'system', ucfirst($modeLabel).' scheduled', $when);

        // NOTE: the nurture loop does NOT start here — it begins only when the BDM confirms the
        // visit via a logged call (see SiteVisitService::confirm), per the operating flow.

        return $visit->fresh(['project', 'plot', 'assignee']);
    }

    /** Transfer the lead from a BDE to a Business Development Manager on conversion. */
    private function handToBdm(Lead $lead, SiteVisit $visit): ?\App\Models\User
    {
        $currentRole = $lead->owner?->role?->slug;
        if ($currentRole === 'sales_bdm') {
            return $lead->owner; // already with a BDM
        }
        $bdm = \App\Models\User::where('is_active', true)
            ->whereHas('role', fn ($q) => $q->where('slug', 'sales_bdm'))
            ->get()
            ->sortBy(fn ($u) => Lead::where('owner_id', $u->id)->whereNotIn('status', ['won', 'lost', 'not_interested'])->count())
            ->first();
        if ($bdm && $lead->owner_id !== $bdm->id) {
            $lead->forceFill(['owner_id' => $bdm->id])->save();
            $this->activity->log($lead, 'system', 'Lead transferred to BDM', $bdm->name);
            $when = optional($visit->scheduled_at)->format('d M Y') ?: 'soon';
            app(\App\Services\NotificationService::class)->notify(
                $bdm->id, 'lead', 'Site visit booked — ' . $lead->name,
                'A site visit is scheduled for ' . $when . '. Confirm it with the lead.',
                '/leads/' . $lead->id,
                ['lead_id' => $lead->id, 'name' => $lead->name, 'phone' => $lead->phone, 'popup' => true, 'kind' => 'site_visit']
            );
        }

        return $bdm ?? $lead->owner;
    }

    public function confirm(SiteVisit $visit): SiteVisit
    {
        $visit->update(['confirmation_status' => 'confirmed', 'status' => 'confirmed']);
        $lead = $visit->lead;
        $this->activity->log($lead, 'system', 'Site visit confirmed', 'Pre-Sales complete → Sales journey started');
        // Sales journey begins now: start the 3-day nurture loop (stops 3 days before the visit).
        $this->engagement->start($lead, $visit->scheduled_at, $visit->id, 'site_visit');

        return $visit;
    }

    /** Reschedule with escalation tracking (I / R3.2). */
    public function reschedule(SiteVisit $visit, array $data): SiteVisit
    {
        $count = $visit->reschedule_count + 1;
        $visit->update([
            'scheduled_at' => Carbon::parse($data['scheduled_at']),
            'reschedule_count' => $count,
            'reschedule_reason' => $data['reason'] ?? null,
            'status' => 'rescheduled',
            'confirmation_status' => 'pending',
            'reminders_sent' => null,
        ]);
        $this->activity->log($visit->lead, 'system', "Site visit rescheduled (#{$count})", $data['reason'] ?? null);
        // Restart the every-2-day engagement nudge loop against the new date.
        $this->engagement->start($visit->lead, $visit->scheduled_at, $visit->id, $data['mode'] ?? 'site_visit');

        if ($count >= 3) {
            Task::create([
                'lead_id' => $visit->lead_id,
                'assigned_to' => $visit->lead->owner_id,
                'title' => 'Assess lead seriousness — frequent reschedules',
                'type' => 'escalation',
                'due_at' => now()->addHours(4),
                'priority' => 'high',
                'escalated' => true,
            ]);
        }
        if ($count >= 4) {
            $this->leads->transition($visit->lead, 'no_response', 'not serious - frequent reschedule', true);
        }
        return $visit->fresh();
    }

    public function checkIn(SiteVisit $visit, ?string $geo = null): SiteVisit
    {
        $visit->update(['checkin_at' => now(), 'checkin_geo' => $geo, 'status' => 'confirmed']);
        $this->activity->log($visit->lead, 'system', 'Rep checked in at site', $geo);
        return $visit;
    }

    public function checkOut(SiteVisit $visit): SiteVisit
    {
        $visit->update(['checkout_at' => now()]);
        $this->activity->log($visit->lead, 'system', 'Rep checked out');
        return $visit;
    }

    /** Complete visit + record outcome + trigger follow-ups / handover (J3–J6). */
    public function complete(SiteVisit $visit, array $data): SiteVisit
    {
        $lead = $visit->lead;
        $visit->fill([
            'status' => ($data['outcome'] ?? null) === 'no_show' ? 'no_show' : 'completed',
            'checkout_at' => $visit->checkout_at ?? now(),
            'properties_viewed' => $data['properties_viewed'] ?? null,
            'buyer_mood' => $data['buyer_mood'] ?? null,
            'buyer_interest_score' => $data['buyer_interest_score'] ?? null,
            'feedback' => $data['feedback'] ?? null,
            'concerns' => $data['concerns'] ?? null,
            'interest_level' => $data['interest_level'] ?? null,
            'outcome' => $data['outcome'] ?? null,
            'loss_reason' => $data['loss_reason'] ?? null,
        ])->save();

        $this->leads->transition($lead, 'site_visit_completed', 'site visit completed', true);
        $this->activity->log($lead, 'note', 'Site visit report submitted', $data['feedback'] ?? null, [
            'outcome' => $data['outcome'] ?? null, 'interest' => $data['interest_level'] ?? null,
        ]);

        switch ($data['outcome'] ?? null) {
            case 'interested':
                // Sales handover (K): move to negotiation, hold plot, 24h SLA task
                if ($visit->plot_id) {
                    $this->holdPlot(Plot::find($visit->plot_id), $lead);
                }
                $this->leads->transition($lead, 'negotiation', 'site visit positive — handover to sales', true);
                Task::create([
                    'lead_id' => $lead->id, 'assigned_to' => $lead->owner_id,
                    'title' => 'Sales: initiate contact within 24h (handover)',
                    'type' => 'follow_up', 'due_at' => now()->addDay(), 'priority' => 'high',
                ]);
                if ($lead->email) {
                    $this->email->send($lead, 'Next steps for your booking', "Hi {$lead->name},\n\nGreat meeting you! Attached are the cost sheet, floor plans and payment options. Our sales team will reach out shortly.");
                }
                break;

            case 'considering':
                Task::create([
                    'lead_id' => $lead->id, 'assigned_to' => $lead->owner_id,
                    'title' => 'Follow-up within 3 days (considering)',
                    'type' => 'follow_up', 'due_at' => now()->addDays(3), 'priority' => 'normal',
                ]);
                if ($lead->email) {
                    $this->email->send($lead, 'A few more reasons to love it', "Hi {$lead->name},\n\nSharing a comparison, testimonials and current offers. Happy to answer any questions.");
                }
                break;

            case 'not_interested':
                $this->leads->transition($lead, 'not_interested', $data['loss_reason'] ?? 'not interested after visit', true);
                break;

            case 'no_show':
                return $this->handleNoShow($visit);
        }

        return $visit->fresh();
    }

    /** No-show handling (J1.6). */
    public function handleNoShow(SiteVisit $visit): SiteVisit
    {
        $lead = $visit->lead;
        $visit->update(['status' => 'no_show', 'outcome' => 'no_show']);
        $this->whatsapp->send($lead, "Sorry we missed you today! Would you like to reschedule your visit? Here are a few slots — just reply.");
        Task::create([
            'lead_id' => $lead->id, 'assigned_to' => $visit->assigned_to,
            'title' => 'Call no-show lead within 2h + offer reschedule',
            'type' => 'callback', 'due_at' => now()->addHours(2), 'priority' => 'high',
        ]);
        if ($lead->temperature === 'hot') {
            Task::create([
                'lead_id' => $lead->id, 'assigned_to' => $lead->owner_id,
                'title' => 'Escalation: HOT lead no-show', 'type' => 'escalation',
                'due_at' => now()->addHour(), 'priority' => 'high', 'escalated' => true,
            ]);
        }
        $this->activity->log($lead, 'system', 'Marked as No-Show — apology + reschedule triggered');
        return $visit->fresh();
    }

    public function cancel(SiteVisit $visit, ?string $reason = null): SiteVisit
    {
        $visit->update(['status' => 'cancelled', 'reschedule_reason' => $reason]);
        $this->activity->log($visit->lead, 'system', 'Site visit cancelled', $reason);
        return $visit;
    }

    public function holdPlot(?Plot $plot, Lead $lead): void
    {
        if (! $plot || $plot->status === 'booked' || $plot->status === 'sold') {
            return;
        }
        $plot->update(['status' => 'held', 'held_by_lead_id' => $lead->id, 'hold_expires_at' => now()->addDays(3)]);
    }
}
