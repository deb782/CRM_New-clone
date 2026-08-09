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
            'payment_link' => $appUrl.'/pay/'.$token, // mock; Razorpay slots in later
            'form_sent_at' => now(),
        ]);

        if ($plot && ! in_array($plot->status, ['sold'])) {
            $plot->update(['status' => 'booked', 'held_by_lead_id' => $lead->id, 'hold_expires_at' => null]);
        }

        // Auto-send booking form (M1.2)
        $formUrl = $appUrl.'/booking/'.$token;
        $this->whatsapp->send($lead, "Congratulations {$lead->name}! Please complete your booking form: {$formUrl}\nToken amount: ₹".number_format($tokenAmount));
        if ($lead->email) {
            $this->email->send($lead, "Booking initiated · {$ref}", "Hi {$lead->name},\n\nWelcome aboard! Complete your booking form here: {$formUrl}\nToken/EOI amount: ₹".number_format($tokenAmount)."\nPayment link: {$booking->payment_link}");
        }

        // Post-sales handover + record lock (M1.4)
        $lead->forceFill(['locked' => true, 'locked_at' => now()])->save();
        $postSales = User::whereHas('role', fn ($q) => $q->where('slug', 'post_sales'))->where('is_active', true)->value('id');
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
        $booking->status = $booking->token_status === 'paid' ? 'confirmed' : 'verified';
        $booking->save();
        $this->activity->log($booking->lead, 'system', 'Booking form verified'.($booking->status === 'confirmed' ? ' — booking confirmed' : ''));
        return $booking->fresh();
    }

    /** Mock token/EOI payment (Razorpay integration replaces this later). */
    public function payToken(Booking $booking): Booking
    {
        $booking->token_status = 'paid';
        $booking->token_paid_at = now();
        $booking->payment_ref = 'MOCK-'.strtoupper(Str::random(10));
        if ($booking->verified_at) {
            $booking->status = 'confirmed';
        }
        $booking->save();
        $this->activity->log($booking->lead, 'system', 'Token/EOI payment received (mock)', '₹'.number_format($booking->token_amount));
        return $booking->fresh();
    }
}
