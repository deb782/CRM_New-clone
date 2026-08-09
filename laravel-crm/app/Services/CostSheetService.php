<?php

namespace App\Services;

use App\Models\CostSheet;
use App\Models\DiscountApproval;
use App\Models\Lead;
use App\Models\PaymentPlan;
use App\Models\Plot;
use App\Models\Proposal;
use App\Models\Task;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;

class CostSheetService
{
    public function __construct(
        private ActivityService $activity,
        private EmailService $email,
        private WhatsAppService $whatsapp,
    ) {}

    /** Compute charges + discount band, persist, and trigger approval workflow (L1.1, L1.3). */
    public function create(Lead $lead, array $data): CostSheet
    {
        $base = (int) ($data['base_price'] ?? 0);
        if (! $base && ! empty($data['plot_id'])) {
            $base = (int) (Plot::find($data['plot_id'])?->price ?? 0);
        }

        $gstRate = isset($data['gst_rate']) ? (float) $data['gst_rate'] : 5.0;
        $gst = (int) round($base * $gstRate / 100);
        $registration = (int) ($data['registration_charges'] ?? round($base * 0.01));
        $maintenance = (int) ($data['maintenance_charges'] ?? 0);
        $other = (int) ($data['other_charges'] ?? 0);

        $discountPct = (float) ($data['discount_pct'] ?? 0);
        $discountAmt = $discountPct > 0 ? (int) round($base * $discountPct / 100) : (int) ($data['discount_amount'] ?? 0);
        if ($discountAmt > 0 && $discountPct == 0 && $base > 0) {
            $discountPct = round($discountAmt / $base * 100, 2);
        }

        [$band, $status] = $this->band($discountPct);

        $subtotal = $base + $gst + $registration + $maintenance + $other;
        $total = max(0, $subtotal - $discountAmt);

        $sheet = CostSheet::create([
            'lead_id' => $lead->id,
            'project_id' => $data['project_id'] ?? $lead->project_id,
            'plot_id' => $data['plot_id'] ?? null,
            'payment_plan_id' => $data['payment_plan_id'] ?? null,
            'created_by' => Auth::id(),
            'base_price' => $base,
            'gst_rate' => $gstRate,
            'gst_amount' => $gst,
            'registration_charges' => $registration,
            'maintenance_charges' => $maintenance,
            'other_charges' => $other,
            'other_label' => $data['other_label'] ?? null,
            'discount_pct' => $discountPct,
            'discount_amount' => $discountAmt,
            'discount_reason' => $data['discount_reason'] ?? null,
            'discount_band' => $band,
            'discount_status' => $status,
            'subtotal' => $subtotal,
            'total' => $total,
            'status' => 'draft',
        ]);

        // Discount > 5% requires manager approval (L1.3 / R4.1)
        if (in_array($band, ['over_5', 'over_10'])) {
            DiscountApproval::create([
                'cost_sheet_id' => $sheet->id,
                'lead_id' => $lead->id,
                'requested_by' => Auth::id(),
                'discount_pct' => $discountPct,
                'discount_amount' => $discountAmt,
                'band' => $band,
                'reason' => $data['discount_reason'] ?? null,
                'status' => 'pending',
            ]);
            Task::create([
                'lead_id' => $lead->id,
                'assigned_to' => $lead->owner_id,
                'title' => "Approve discount {$discountPct}% for {$lead->name}",
                'type' => 'escalation',
                'due_at' => now()->addHours(8),
                'priority' => 'high',
                'escalated' => true,
                'meta' => ['cost_sheet_id' => $sheet->id],
            ]);
            $this->activity->log($lead, 'system', "Discount {$discountPct}% requested — pending manager approval");
        } else {
            $this->activity->log($lead, 'note', "Cost sheet created · total ₹".number_format($total));
        }

        return $sheet->fresh(['plot', 'paymentPlan', 'approvals']);
    }

    private function band(float $pct): array
    {
        if ($pct <= 0) return ['none', 'none'];
        if ($pct <= 5) return ['within_5', 'approved']; // auto-approved
        if ($pct <= 10) return ['over_5', 'pending'];
        return ['over_10', 'pending'];
    }

    /** Manager decision on a discount request (L1.3). */
    public function decide(DiscountApproval $approval, string $decision, ?string $note, ?float $counterPct): DiscountApproval
    {
        $sheet = $approval->costSheet;
        $approval->status = $decision; // approved|rejected|counter
        $approval->decision_note = $note;
        $approval->counter_pct = $counterPct;
        $approval->decided_by = Auth::id();
        $approval->decided_at = now();
        $approval->save();

        if ($decision === 'approved') {
            $sheet->update(['discount_status' => 'approved', 'approved_by' => Auth::id()]);
            if ($sheet->lead && $sheet->lead->email) {
                $this->email->send($sheet->lead, 'Your special offer is approved', "Good news! A discount of {$sheet->discount_pct}% has been approved on your selected unit.");
            }
        } elseif ($decision === 'counter' && $counterPct !== null) {
            $base = $sheet->base_price;
            $amt = (int) round($base * $counterPct / 100);
            $sheet->update([
                'discount_pct' => $counterPct,
                'discount_amount' => $amt,
                'discount_status' => 'approved',
                'discount_band' => $counterPct <= 5 ? 'within_5' : ($counterPct <= 10 ? 'over_5' : 'over_10'),
                'approved_by' => Auth::id(),
                'total' => max(0, $sheet->subtotal - $amt),
            ]);
        } else {
            $sheet->update(['discount_status' => 'rejected']);
        }

        $this->activity->log($sheet->lead, 'system', "Discount request {$decision}".($note ? ": {$note}" : ''));
        return $approval->fresh();
    }

    public function selectPlan(CostSheet $sheet, int $planId): CostSheet
    {
        $sheet->update(['payment_plan_id' => $planId]);
        return $sheet->fresh('paymentPlan');
    }

    /** Share cost sheet via email + WhatsApp (L1.1). */
    public function share(CostSheet $sheet): CostSheet
    {
        $lead = $sheet->lead;
        $summary = "Base ₹".number_format($sheet->base_price).", GST ₹".number_format($sheet->gst_amount).
            ", Reg ₹".number_format($sheet->registration_charges).
            ($sheet->discount_amount ? ", Discount ₹".number_format($sheet->discount_amount) : '').
            " — Total ₹".number_format($sheet->total);
        $this->whatsapp->send($lead, "Here is your cost sheet: {$summary}");
        if ($lead->email) {
            $this->email->send($lead, 'Your cost sheet', "Hi {$lead->name},\n\n{$summary}\n\nReply to proceed with booking.");
        }
        $sheet->update(['status' => 'shared']);
        $this->activity->log($lead, 'note', 'Cost sheet shared', $summary);
        return $sheet->fresh();
    }

    /** Generate a formal proposal with reference number (L1.4). */
    public function generateProposal(CostSheet $sheet): Proposal
    {
        $lead = $sheet->lead->fresh('project');
        $sheet->loadMissing('plot', 'paymentPlan', 'project');

        if (in_array($sheet->discount_band, ['over_5', 'over_10']) && $sheet->discount_status !== 'approved') {
            abort(422, 'Discount pending manager approval — cannot generate proposal yet.');
        }

        $ref = 'PROP-'.now()->format('Ymd').'-'.strtoupper(Str::random(4));
        $proposal = Proposal::create([
            'lead_id' => $lead->id,
            'cost_sheet_id' => $sheet->id,
            'reference_no' => $ref,
            'snapshot' => [
                'project' => optional($sheet->project)->name,
                'unit' => optional($sheet->plot)->number,
                'unit_type' => optional($sheet->plot)->unit_type,
                'carpet_area' => optional($sheet->plot)->carpet_area,
                'base_price' => $sheet->base_price,
                'gst' => $sheet->gst_amount,
                'registration' => $sheet->registration_charges,
                'maintenance' => $sheet->maintenance_charges,
                'discount' => $sheet->discount_amount,
                'total' => $sheet->total,
            ],
            'payment_plan_snapshot' => $sheet->paymentPlan ? [
                'name' => $sheet->paymentPlan->name,
                'milestones' => $sheet->paymentPlan->milestones,
            ] : null,
            'status' => 'draft',
        ]);

        $this->activity->log($lead, 'note', "Proposal generated · {$ref}");
        return $proposal;
    }

    public function sendProposal(Proposal $proposal): Proposal
    {
        $lead = $proposal->lead;
        $this->whatsapp->send($lead, "Your formal proposal {$proposal->reference_no} is ready. Total ₹".number_format($proposal->snapshot['total'] ?? 0).". Tap to confirm and proceed with booking.");
        if ($lead->email) {
            $this->email->send($lead, "Proposal {$proposal->reference_no}", "Hi {$lead->name},\n\nPlease find your proposal {$proposal->reference_no}. Confirm to proceed with booking.");
        }
        $proposal->update(['status' => 'sent', 'sent_at' => now()]);
        $this->activity->log($lead, 'note', "Proposal {$proposal->reference_no} sent");
        return $proposal->fresh();
    }

    public function captureConsent(Proposal $proposal, string $name): Proposal
    {
        $proposal->update(['consent_captured' => true, 'consent_name' => $name, 'consent_at' => now(), 'status' => 'accepted']);
        $this->activity->log($proposal->lead, 'system', "Proposal {$proposal->reference_no} accepted — consent by {$name}");
        return $proposal->fresh();
    }
}
