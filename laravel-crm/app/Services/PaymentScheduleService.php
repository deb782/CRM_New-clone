<?php

namespace App\Services;

use App\Models\Booking;
use App\Models\Payment;
use App\Models\PaymentMilestone;
use Carbon\Carbon;

class PaymentScheduleService
{
    private array $defaultPlan = [
        ['label' => 'On Booking', 'pct' => 10],
        ['label' => 'On Agreement', 'pct' => 15],
        ['label' => 'Construction Stage 1', 'pct' => 25],
        ['label' => 'Construction Stage 2', 'pct' => 25],
        ['label' => 'On Possession', 'pct' => 25],
    ];

    public function __construct(
        private ActivityService $activity,
        private WhatsAppService $whatsapp,
        private EmailService $email,
        private PaymentService $payments,
    ) {}

    /** Derive a milestone schedule from the booking's payment plan (P). Idempotent. */
    public function generateSchedule(Booking $booking): void
    {
        if (PaymentMilestone::where('booking_id', $booking->id)->exists()) {
            $this->syncStatuses($booking);
            return;
        }
        $booking->loadMissing('costSheet.paymentPlan');
        $plan = $booking->costSheet?->paymentPlan?->milestones ?: $this->defaultPlan;
        $dealValue = (int) $booking->deal_value;
        $interval = (int) config('integrations.payments.milestone_interval_days', 30);
        $start = $booking->token_paid_at ? Carbon::parse($booking->token_paid_at) : now();

        foreach ($plan as $seq => $m) {
            $pct = (float) ($m['pct'] ?? 0);
            $days = isset($m['days']) ? (int) $m['days'] : $seq * $interval;
            PaymentMilestone::create([
                'booking_id' => $booking->id,
                'lead_id' => $booking->lead_id,
                'cost_sheet_id' => $booking->cost_sheet_id,
                'seq' => $seq,
                'label' => $m['label'] ?? ('Milestone '.($seq + 1)),
                'pct' => $pct,
                'amount' => (int) round($dealValue * $pct / 100),
                'due_at' => (clone $start)->addDays($days),
                'status' => 'pending',
                'reminders_sent' => [],
            ]);
        }
        if ($booking->lead) {
            $this->activity->log($booking->lead, 'system', 'Payment schedule generated ('.count($plan).' milestones)');
        }
        $this->syncStatuses($booking);
    }

    public function collectedSum(Booking $booking): int
    {
        return (int) Payment::where('booking_id', $booking->id)
            ->whereIn('status', ['received', 'verified', 'reconciled'])
            ->sum('amount');
    }

    /** Allocate collected payments across milestones in order + refresh statuses (P). */
    public function syncStatuses(Booking $booking): void
    {
        $remaining = $this->collectedSum($booking);
        $milestones = PaymentMilestone::where('booking_id', $booking->id)->orderBy('seq')->get();
        foreach ($milestones as $m) {
            $alloc = min($remaining, (int) $m->amount);
            $remaining -= $alloc;
            $m->paid_amount = $alloc;
            if ($alloc >= $m->amount && $m->amount > 0) {
                $m->status = 'paid';
                $m->paid_at = $m->paid_at ?: now();
            } elseif ($alloc > 0) {
                $m->status = 'partial';
            } elseif ($m->due_at && $m->due_at->isPast()) {
                $m->status = 'overdue';
            } elseif ($m->due_at && now()->diffInDays($m->due_at, false) <= 7) {
                $m->status = 'due';
            } else {
                $m->status = 'pending';
            }
            $m->save();
        }
        $this->checkAllotment($booking);
    }

    /** O — auto-issue allotment letter once collection crosses the trigger (default 10%). */
    public function checkAllotment(Booking $booking): void
    {
        $trigger = (float) config('integrations.payments.allotment_trigger_pct', 10);
        $dealValue = max(1, (int) $booking->deal_value);
        $pctCollected = $this->collectedSum($booking) / $dealValue * 100;
        if ($pctCollected >= $trigger) {
            app(PostSalesService::class)->generateAllotment($booking);
        }
    }

    /** Record a payment against a specific milestone (P). */
    public function recordMilestonePayment(PaymentMilestone $milestone, array $data): PaymentMilestone
    {
        $booking = $milestone->booking;
        $this->payments->record($booking, [
            'type' => 'milestone',
            'amount' => (int) ($data['amount'] ?? $milestone->outstanding()),
            'method' => $data['method'] ?? 'neft',
            'reference' => $data['reference'] ?? null,
            'gateway' => 'manual',
            'meta' => ['milestone_id' => $milestone->id, 'milestone_label' => $milestone->label],
        ]);
        $this->syncStatuses($booking->fresh());
        return $milestone->fresh();
    }

    /** Collections dashboard: collected vs outstanding + aging buckets (P). */
    public function collectionsDashboard(): array
    {
        $milestones = PaymentMilestone::with('booking:id,booking_ref')->get();
        $collected = (int) Payment::whereIn('status', ['received', 'verified', 'reconciled'])->sum('amount');
        $scheduled = (int) $milestones->sum('amount');
        $paid = (int) $milestones->sum('paid_amount');
        $outstanding = max(0, $scheduled - $paid);

        $buckets = ['current' => 0, '0_30' => 0, '31_60' => 0, '61_90' => 0, '90_plus' => 0];
        $overdueList = [];
        foreach ($milestones as $m) {
            $out = $m->outstanding();
            if ($out <= 0) {
                continue;
            }
            if (! $m->due_at || $m->due_at->isFuture()) {
                $buckets['current'] += $out;
                continue;
            }
            $days = (int) $m->due_at->diffInDays(now());
            if ($days <= 30) $buckets['0_30'] += $out;
            elseif ($days <= 60) $buckets['31_60'] += $out;
            elseif ($days <= 90) $buckets['61_90'] += $out;
            else $buckets['90_plus'] += $out;
            $overdueList[] = [
                'id' => $m->id, 'booking_ref' => $m->booking?->booking_ref, 'label' => $m->label,
                'outstanding' => $out, 'days_overdue' => $days, 'due_at' => $m->due_at,
            ];
        }

        return [
            'collected' => $collected,
            'scheduled' => $scheduled,
            'outstanding' => $outstanding,
            'aging' => $buckets,
            'overdue_milestones' => $overdueList,
        ];
    }
}
