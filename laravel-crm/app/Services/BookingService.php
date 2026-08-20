<?php

namespace App\Services;

use App\Models\Booking;
use App\Models\CostSheet;
use App\Models\Lead;
use App\Models\Plot;
use App\Models\Task;
use App\Models\User;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;

class BookingService
{
    public function __construct(
        private LeadService $leads,
        private ActivityService $activity,
        private EmailService $email,
        private WhatsAppService $whatsapp,
        private SequenceService $sequences,
        private RazorpayService $razorpay,
        private PostSalesService $postSales,
        private PaymentService $payments,
    ) {}

    /** Deal Won -> booking initiation + booking form + post-sales handover + record lock (M1.1, M1.2, M1.4). */
    public function markWon(Lead $lead, array $data): Booking
    {
        $this->leads->transition($lead, 'won', 'deal won', true);

        $plot = null;
        if (! empty($data['plot_id'])) {
            $plot = Plot::find($data['plot_id']);
        } else {
            $plot = Plot::where('held_by_lead_id', $lead->id)->first();
        }

        $sheet = CostSheet::where('lead_id', $lead->id)
            ->orderByRaw("FIELD(discount_status,'approved','none','pending','rejected')")
            ->latest()->first();
        $dealValue = (int) ($data['deal_value'] ?? ($sheet->total ?? ($plot->price ?? 0)));
        $tokenAmount = (int) ($data['token_amount'] ?? round($dealValue * 0.10));

        $token = Str::random(24);
        $ref = 'BKG-'.now()->format('Ymd').'-'.strtoupper(Str::random(4));
        $appUrl = rtrim(config('app.url'), '/');

        $booking = Booking::create([
            'lead_id' => $lead->id,
            'project_id' => $plot?->project_id ?? $lead->project_id,
            'plot_id' => $plot?->id,
            'cost_sheet_id' => $sheet?->id,
            'created_by' => Auth::id(),
            'booking_ref' => $ref,
            'form_token' => $token,
            'status' => 'form_sent',
            'deal_value' => $dealValue,
            'token_amount' => $tokenAmount,
            'token_status' => 'pending',
            'payment_link' => $appUrl.'/pay/'.$token, // replaced with gateway link below
            'form_sent_at' => now(),
        ]);

        // Razorpay payment link for token/EOI (live when keys present, else mock)
        $pl = $this->razorpay->createPaymentLink($booking, $tokenAmount, 'Token / EOI');
        $booking->update(['payment_link' => $pl['url'], 'meta' => ['razorpay_plink' => $pl['id'], 'gateway' => $pl['provider']]]);

        // Channel-partner commission (P/Channel Partner)
        if ($lead->channel_partner_id) {
            $partner = \App\Models\ChannelPartner::find($lead->channel_partner_id);
            if ($partner) {
                $booking->update([
                    'channel_partner_id' => $partner->id,
                    'commission_pct' => $partner->commission_rate,
                    'commission_amount' => (int) round($dealValue * (float) $partner->commission_rate / 100),
                    'commission_status' => 'pending',
                ]);
            }
        }

        if ($plot && ! in_array($plot->status, ['sold'])) {
            $plot->update(['status' => 'booked', 'held_by_lead_id' => $lead->id, 'hold_expires_at' => null]);
        }

        // Auto-send booking form (M1.2)
        $formUrl = $appUrl.'/booking/'.$token;
        $this->whatsapp->sendAuto($lead, "Congratulations {$lead->name}! Please complete your booking form: {$formUrl}\nToken amount: ₹".\App\Support\Money::group($tokenAmount), 'booking_form', [$lead->name, $formUrl, \App\Support\Money::group($tokenAmount)]);
        if ($lead->email) {
            $this->email->send($lead, "Booking initiated · {$ref}", "Hi {$lead->name},\n\nWelcome aboard! Complete your booking form here: {$formUrl}\nToken/EOI amount: ₹".\App\Support\Money::group($tokenAmount)."\nPayment link: {$booking->payment_link}");
        }

        // Post-sales handover + record lock (M1.4)
        $lead->forceFill(['locked' => true, 'locked_at' => now()])->save();
        $postSales = User::whereHas('role', fn ($q) => $q->where('slug', 'crm_head'))->where('is_active', true)->value('id');
        Task::create([
            'lead_id' => $lead->id,
            'assigned_to' => $postSales ?: $lead->owner_id,
            'title' => "Post-sales onboarding & document collection: {$lead->name}",
            'type' => 'follow_up',
            'due_at' => now()->addDay(),
            'priority' => 'high',
            'meta' => ['booking_id' => $booking->id],
        ]);

        $this->activity->log($lead, 'system', 'Deal WON — booking initiated & handed to post-sales', "Ref {$ref} · record locked");
        return $booking->fresh(['plot', 'project']);
    }

    /** Deal Lost -> loss reason + release inventory + nurturing (M1.5). */
    public function markLost(Lead $lead, array $data): Lead
    {
        $reason = $data['reason'] ?? null;
        $lead->forceFill(['lost_reason' => $reason])->save();
        $this->leads->transition($lead, 'lost', $reason ?: 'deal lost', true);

        // Release any held plot back to inventory
        Plot::where('held_by_lead_id', $lead->id)->where('status', 'held')
            ->update(['status' => 'available', 'held_by_lead_id' => null, 'hold_expires_at' => null]);

        // Long-term re-engagement (Deal Lost nurturing)
        $this->sequences->pause($lead, 'deal lost');
        Task::create([
            'lead_id' => $lead->id,
            'assigned_to' => $lead->owner_id,
            'title' => 'Re-engage lost lead',
            'type' => 'follow_up',
            'due_at' => now()->addDays(30),
            'priority' => 'low',
        ]);
        $this->activity->log($lead, 'system', 'Deal LOST', $reason);
        return $lead->fresh();
    }

    /** R — cancel a confirmed/in-progress booking: release inventory, cancel schedule & dues. */
    public function cancel(Booking $booking, ?string $reason = null): Booking
    {
        $booking->update(['status' => 'cancelled', 'cancelled_at' => now(), 'cancellation_reason' => $reason]);
        if ($booking->plot_id) {
            Plot::where('id', $booking->plot_id)->update(['status' => 'available', 'held_by_lead_id' => null, 'hold_expires_at' => null]);
        }
        \App\Models\PaymentMilestone::where('booking_id', $booking->id)
            ->whereIn('status', ['pending', 'due', 'partial', 'overdue'])
            ->update(['status' => 'cancelled']);
        \App\Models\DemandLetter::where('booking_id', $booking->id)->where('status', 'issued')
            ->update(['status' => 'paid']);
        if ($booking->commission_status !== 'paid') {
            $booking->update(['commission_status' => 'none']);
        }
        if ($booking->lead) {
            $this->activity->log($booking->lead, 'system', 'Booking cancelled', $reason);
        }
        return $booking->fresh();
    }

    public function submitForm(Booking $booking, array $formData): Booking
    {
        $booking->update(['form_data' => $formData, 'status' => 'form_submitted', 'form_submitted_at' => now()]);
        $this->activity->log($booking->lead, 'system', 'Booking form submitted by customer');
        return $booking->fresh();
    }

    public function verify(Booking $booking): Booking
    {
        $booking->verified_at = now();
        $booking->verified_by = Auth::id();
        if ($booking->status !== 'confirmed') {
            $booking->status = 'verified';
        }
        $booking->save();
        $this->activity->log($booking->lead, 'system', 'Booking form verified');
        return $this->postSales->confirmBooking($booking->fresh());
    }

    /** Token/EOI payment -> records a receipt via PaymentService (Razorpay when live, else mock). */
    public function payToken(Booking $booking): Booking
    {
        $this->payments->record($booking, [
            'type' => 'token',
            'amount' => $booking->token_amount,
            'method' => $this->razorpay->enabled() ? 'razorpay' : 'online',
            'gateway' => $this->razorpay->enabled() ? 'razorpay' : 'mock',
        ]);
        return $booking->fresh();
    }
}
