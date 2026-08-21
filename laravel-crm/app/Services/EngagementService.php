<?php

namespace App\Services;

use App\Models\Lead;
use App\Models\VisitEngagement;
use Carbon\Carbon;
use Illuminate\Support\Facades\Log;

/**
 * Auto WhatsApp engagement loop between a booked appointment and its date.
 * Cadence: send today (day 0), then every 2 days, up to (but not including) the appointment date.
 *   10-day appointment  → 5 sends (day 0,2,4,6,8)
 *    6-day appointment  → 3 sends (day 0,2,4)
 * The loop stops when the cycle completes, the appointment is reached, OR the lead's
 * status changes from the baseline captured at start (any change).
 */
class EngagementService
{
    public function __construct(private WhatsAppService $whatsapp) {}

    private const STEP_DAYS = 3;
    private const STOP_BEFORE_DAYS = 3; // nurture stops this many days before the appointment

    /** Begin a nudge loop for a freshly booked appointment. First nudge fires immediately. */
    public function start(Lead $lead, Carbon $appointmentAt, ?int $siteVisitId, string $mode = 'site_visit'): ?VisitEngagement
    {
        // Stop any earlier active loop for this lead (a new booking supersedes it).
        VisitEngagement::where('lead_id', $lead->id)->where('active', true)
            ->update(['active' => false, 'stopped_reason' => 'superseded']);

        $now = now();
        // Nurture runs up to STOP_BEFORE_DAYS before the appointment (the SV reminders take over after that).
        $cutoff = $appointmentAt->copy()->subDays(self::STOP_BEFORE_DAYS);
        if ($cutoff->lessThanOrEqualTo($now)) {
            return null; // appointment too close — reminders handle it
        }

        // Count send offsets 0,3,6,... strictly before the cutoff.
        $total = 0;
        for ($d = 0; $now->copy()->addDays($d)->lessThan($cutoff); $d += self::STEP_DAYS) {
            $total++;
        }
        if ($total < 1) {
            return null;
        }

        $eng = VisitEngagement::create([
            'lead_id' => $lead->id,
            'site_visit_id' => $siteVisitId,
            'mode' => $mode,
            'appointment_at' => $appointmentAt,
            'baseline_status_code' => $lead->status_code,
            'next_send_at' => $now,
            'sends_done' => 0,
            'total_sends' => $total,
            'active' => true,
        ]);

        // Fire the first nudge right away ("start today").
        $this->fireOne($eng);

        return $eng->fresh();
    }

    /** Scheduler entrypoint — send every due nudge and advance/close each loop. */
    public function dispatchDue(): int
    {
        $sent = 0;
        $due = VisitEngagement::where('active', true)
            ->whereNotNull('next_send_at')
            ->where('next_send_at', '<=', now())
            ->get();

        foreach ($due as $eng) {
            if ($this->fireOne($eng)) {
                $sent++;
            }
        }

        return $sent;
    }

    /** Evaluate stop conditions, send one nudge if still valid, then schedule the next. */
    private function fireOne(VisitEngagement $eng): bool
    {
        $lead = $eng->lead;
        if (! $lead) {
            $eng->update(['active' => false, 'stopped_reason' => 'lead_missing']);
            return false;
        }

        // Stop: any status change from the baseline.
        if ($lead->status_code !== $eng->baseline_status_code) {
            $eng->update(['active' => false, 'stopped_reason' => 'status_changed']);
            return false;
        }
        // Stop: appointment reached.
        if (now()->greaterThanOrEqualTo($eng->appointment_at)) {
            $eng->update(['active' => false, 'stopped_reason' => 'appointment_reached']);
            return false;
        }
        // Stop: cycle complete.
        if ($eng->sends_done >= $eng->total_sends) {
            $eng->update(['active' => false, 'stopped_reason' => 'completed']);
            return false;
        }

        try {
            $when = $eng->appointment_at->format('D, d M · h:i A');
            $label = $eng->mode === 'google_meet' ? 'Google Meet' : 'site visit';
            $first = explode(' ', trim((string) $lead->name))[0] ?: 'there';
            $remaining = max(0, $eng->appointment_at->diffInDays(now()));
            $body = "Hi {$first}, a quick reminder about your upcoming {$label} on {$when}"
                . ($remaining > 0 ? " (in {$remaining} day" . ($remaining === 1 ? '' : 's') . ")" : '')
                . ". We're excited to host you! Reply here if you'd like to reschedule or have any questions. 🌱";
            $this->whatsapp->sendAuto($lead, $body, 'appointment_reminder', [$first, $when], 'engagement:' . $eng->id, [['id' => 'resched', 'title' => 'Reschedule']]);
        } catch (\Throwable $e) {
            Log::warning('Engagement nudge send failed for engagement ' . $eng->id . ': ' . $e->getMessage());
            return false;
        }

        $done = $eng->sends_done + 1;
        $next = $eng->created_at->copy()->addDays($done * self::STEP_DAYS);
        $stop = null;
        $active = true;
        if ($done >= $eng->total_sends) {
            $active = false;
            $stop = 'completed';
        } elseif ($next->greaterThanOrEqualTo($eng->appointment_at)) {
            $active = false;
            $stop = 'appointment_reached';
        }
        $eng->update([
            'sends_done' => $done,
            'next_send_at' => $active ? $next : null,
            'active' => $active,
            'stopped_reason' => $stop,
        ]);

        return true;
    }
}
