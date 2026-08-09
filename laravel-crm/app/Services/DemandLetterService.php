<?php

namespace App\Services;

use App\Models\DemandLetter;
use App\Models\PaymentMilestone;
use App\Models\Task;
use App\Models\User;

class DemandLetterService
{
    public function __construct(
        private ActivityService $activity,
        private EmailService $email,
        private WhatsAppService $whatsapp,
    ) {}

    /** Q — generate a serial demand letter for an overdue milestone with late interest. Idempotent. */
    public function generateForMilestone(PaymentMilestone $milestone): ?DemandLetter
    {
        $outstanding = $milestone->outstanding();
        if ($outstanding <= 0 || ! $milestone->due_at || $milestone->due_at->isFuture()) {
            return null;
        }
        if ($milestone->demand_letter_id) {
            return DemandLetter::find($milestone->demand_letter_id);
        }
        $milestone->loadMissing('booking.lead');
        $booking = $milestone->booking;
        $daysOverdue = (int) $milestone->due_at->diffInDays(now());
        $rate = (float) config('integrations.payments.late_interest_annual_pct', 18);
        $interest = (int) round($outstanding * $rate / 100 * $daysOverdue / 365);
        $serial = $this->serial();

        $letter = DemandLetter::create([
            'booking_id' => $booking->id,
            'lead_id' => $booking->lead_id,
            'payment_milestone_id' => $milestone->id,
            'serial_no' => $serial,
            'amount_due' => $outstanding,
            'days_overdue' => $daysOverdue,
            'interest_rate' => $rate,
            'late_interest' => $interest,
            'total_due' => $outstanding + $interest,
            'status' => 'issued',
        ]);
        $milestone->update(['demand_letter_id' => $letter->id]);

        $this->deliver($letter, 'whatsapp+email');
        if ($booking->lead) {
            $this->activity->log($booking->lead, 'system', 'Demand letter issued · '.$serial,
                'Due ₹'.number_format($outstanding).' + interest ₹'.number_format($interest));
        }
        return $letter->fresh();
    }

    public function deliver(DemandLetter $letter, string $via, ?string $registeredPostRef = null): DemandLetter
    {
        $lead = $letter->lead;
        $msg = "Demand Notice {$letter->serial_no}: ₹".number_format($letter->amount_due)
            ." is overdue by {$letter->days_overdue} day(s). With late interest ₹".number_format($letter->late_interest)
            .", total payable is ₹".number_format($letter->total_due).". Please pay at the earliest.";
        if ($lead && str_contains($via, 'whatsapp')) {
            $this->whatsapp->send($lead, $msg);
        }
        if ($lead && $lead->email && str_contains($via, 'email')) {
            $this->email->send($lead, "Demand Notice · {$letter->serial_no}", $msg);
        }
        $letter->update([
            'delivered_via' => $via,
            'delivered_at' => now(),
            'registered_post_ref' => $registeredPostRef ?: $letter->registered_post_ref,
        ]);
        return $letter->fresh();
    }

    /** Q — escalate an unpaid demand to manager / legal. */
    public function escalate(DemandLetter $letter): DemandLetter
    {
        $letter->update(['status' => 'escalated', 'escalated_at' => now()]);
        $manager = User::whereHas('role', fn ($q) => $q->whereIn('slug', ['sales_manager', 'admin']))
            ->where('is_active', true)->value('id');
        Task::create([
            'lead_id' => $letter->lead_id,
            'assigned_to' => $manager,
            'title' => 'Legal escalation: unpaid demand '.$letter->serial_no,
            'type' => 'escalation',
            'due_at' => now()->addDays(2),
            'priority' => 'high',
            'escalated' => true,
            'meta' => ['demand_letter_id' => $letter->id],
        ]);
        if ($letter->lead) {
            $this->activity->log($letter->lead, 'system', 'Demand letter escalated to manager/legal', $letter->serial_no);
        }
        return $letter->fresh();
    }

    private function serial(): string
    {
        $year = now()->format('Y');
        $count = DemandLetter::whereYear('created_at', $year)->count() + 1;
        return sprintf('DMD-%s-%04d', $year, $count);
    }
}
