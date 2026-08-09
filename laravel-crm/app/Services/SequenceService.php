<?php

namespace App\Services;

use App\Models\Lead;
use App\Models\Sequence;
use App\Models\SequenceEnrollment;

class SequenceService
{
    public function __construct(
        private EmailService $email,
        private WhatsAppService $whatsapp,
        private ActivityService $activity,
    ) {}

    /** Enroll a lead into the sequence matching its temperature (E1.3). */
    public function enroll(Lead $lead, ?string $temperature = null): ?SequenceEnrollment
    {
        if ($lead->do_not_contact || $lead->is_invalid) {
            return null;
        }
        $temperature = $temperature ?: $lead->temperature;

        $sequence = Sequence::where('active', true)->where('temperature', $temperature)->first();
        if (! $sequence) {
            return null;
        }

        // Avoid duplicate active enrollment in the same sequence
        $existing = SequenceEnrollment::where('lead_id', $lead->id)
            ->where('sequence_id', $sequence->id)
            ->where('status', 'active')->first();
        if ($existing) {
            return $existing;
        }

        // Pause other active enrollments (single active cadence)
        SequenceEnrollment::where('lead_id', $lead->id)->where('status', 'active')
            ->update(['status' => 'paused', 'paused_reason' => 'switched cadence']);

        $enrollment = SequenceEnrollment::create([
            'lead_id' => $lead->id,
            'sequence_id' => $sequence->id,
            'current_step' => 0,
            'status' => 'active',
            'enrolled_at' => now(),
            'next_run_at' => now(),
        ]);

        $this->activity->log($lead, 'system', "Enrolled in nurturing sequence: {$sequence->name}");

        return $enrollment;
    }

    /** Pause all active sequences for a lead (E: auto-pause rules). */
    public function pause(Lead $lead, string $reason): void
    {
        SequenceEnrollment::where('lead_id', $lead->id)->where('status', 'active')
            ->update(['status' => 'paused', 'paused_reason' => $reason]);
        $this->activity->log($lead, 'system', 'Nurturing paused', $reason);
    }

    /** Process all due sequence steps (called by scheduler crm:automation). */
    public function processDue(): int
    {
        $processed = 0;
        $due = SequenceEnrollment::where('status', 'active')
            ->whereNotNull('next_run_at')
            ->where('next_run_at', '<=', now())
            ->with('sequence.steps', 'lead')
            ->get();

        foreach ($due as $enrollment) {
            $lead = $enrollment->lead;
            if (! $lead || $lead->do_not_contact) {
                $enrollment->update(['status' => 'completed']);
                continue;
            }

            $steps = $enrollment->sequence->steps;
            $next = $steps->firstWhere('step_no', $enrollment->current_step + 1);

            if (! $next) {
                $enrollment->update(['status' => 'completed']);
                continue;
            }

            $subject = $next->subject ?? 'Update on your property enquiry';
            $body = $this->render($next->body ?? '', $lead);

            if ($next->channel === 'email') {
                $this->email->send($lead, $subject, $body);
            } elseif ($next->channel === 'whatsapp') {
                $this->whatsapp->send($lead, $body);
            } else {
                $res = app(\App\Integrations\Sms\Contract::class)->send((string) $lead->phone, $body);
                $this->activity->log($lead, 'system', "Sequence SMS touchpoint #{$next->step_no} ({$res['status']})", $body);
                $this->activity->comm($lead->id, 'sms', 'outbound', $res['status']);
            }

            $enrollment->current_step = $next->step_no;

            $following = $steps->firstWhere('step_no', $next->step_no + 1);
            if ($following) {
                $enrollment->next_run_at = now()->addHours(max(1, (int) $following->offset_hours));
            } else {
                $enrollment->status = 'completed';
                $enrollment->next_run_at = null;
            }
            $enrollment->save();
            $processed++;
        }

        return $processed;
    }

    protected function render(string $body, Lead $lead): string
    {
        return strtr($body, [
            '{{name}}' => $lead->name,
            '{{project}}' => optional($lead->project)->name ?? 'our projects',
        ]);
    }
}
