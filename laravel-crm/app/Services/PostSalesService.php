<?php

namespace App\Services;

use App\Models\Booking;
use App\Models\DocumentChecklistItem;
use App\Models\Letter;
use Illuminate\Support\Facades\Auth;

class PostSalesService
{
    public function __construct(
        private ActivityService $activity,
        private EmailService $email,
        private WhatsAppService $whatsapp,
    ) {}

    /** Default KYC / financial / legal document checklist (N). Idempotent per booking. */
    public array $defaults = [
        ['name' => 'PAN Card', 'category' => 'kyc'],
        ['name' => 'Aadhaar Card', 'category' => 'kyc'],
        ['name' => 'Address Proof', 'category' => 'kyc'],
        ['name' => 'Passport Photograph', 'category' => 'kyc'],
        ['name' => 'Cancelled Cheque', 'category' => 'financial'],
        ['name' => 'Income Proof', 'category' => 'financial'],
        ['name' => 'Signed Booking Application Form', 'category' => 'legal'],
    ];

    public function seedChecklist(Booking $booking): void
    {
        if (DocumentChecklistItem::where('booking_id', $booking->id)->exists()) {
            return;
        }
        foreach ($this->defaults as $d) {
            DocumentChecklistItem::create([
                'booking_id' => $booking->id,
                'lead_id' => $booking->lead_id,
                'name' => $d['name'],
                'category' => $d['category'],
                'required' => true,
                'status' => 'pending',
                'due_at' => now()->addDays(7),
            ]);
        }
        if ($booking->lead) {
            $this->activity->log($booking->lead, 'system', 'Document checklist created ('.count($this->defaults).' items)');
        }
    }

    public function updateDocItem(DocumentChecklistItem $item, array $data): DocumentChecklistItem
    {
        $status = $data['status'] ?? $item->status;
        $item->fill(['status' => $status, 'notes' => $data['notes'] ?? $item->notes]);
        if (! empty($data['file_path'])) {
            $item->file_path = $data['file_path'];
        }
        if ($status === 'received' && ! $item->received_at) {
            $item->received_at = now();
        }
        if ($status === 'verified') {
            $item->verified_at = now();
            $item->verified_by = Auth::id();
            if (! $item->received_at) {
                $item->received_at = now();
            }
        }
        $item->save();
        return $item->fresh();
    }

    /** Welcome letter on booking confirmation (N). Idempotent. */
    public function generateWelcome(Booking $booking): ?Letter
    {
        $existing = Letter::where('booking_id', $booking->id)->where('type', 'welcome')->first();
        if ($existing) {
            return $existing;
        }
        $lead = $booking->lead;
        $serial = $this->serial('welcome');
        $body = "Dear {$lead?->name},\n\n"
            ."Welcome to the family! We are delighted to confirm your booking {$booking->booking_ref}"
            .($booking->plot ? " for unit {$booking->plot->number}" : '')
            .($booking->project ? " at {$booking->project->name}" : '').".\n\n"
            ."A dedicated post-sales relationship manager will guide you through documentation, payments and handover.\n\n"
            ."Warm regards,\nPost-Sales Team";
        $letter = Letter::create([
            'booking_id' => $booking->id,
            'lead_id' => $booking->lead_id,
            'type' => 'welcome',
            'serial_no' => $serial,
            'title' => "Welcome Letter · {$booking->booking_ref}",
            'body' => $body,
            'status' => 'generated',
            'created_by' => Auth::id(),
        ]);

        if ($lead) {
            $this->whatsapp->sendAuto($lead, "Welcome aboard, {$lead->name}! Your booking {$booking->booking_ref} is confirmed. Ref: {$serial}", 'welcome_customer', [$lead->name, $booking->booking_ref]);
            if ($lead->email) {
                $this->email->send($lead, "Welcome · {$booking->booking_ref}", $body);
            }
            $letter->update(['status' => 'sent', 'sent_at' => now(), 'sent_via' => $lead->email ? 'whatsapp+email' : 'whatsapp']);
            $this->activity->log($lead, 'system', 'Welcome letter sent', $serial);
        }
        return $letter->fresh();
    }

    /** O — allotment letter once collection crosses trigger (N/O). Idempotent. */
    public function generateAllotment(Booking $booking): ?Letter
    {
        $existing = Letter::where('booking_id', $booking->id)->where('type', 'allotment')->first();
        if ($existing) {
            return $existing;
        }
        $booking->loadMissing(['lead', 'plot', 'project']);
        $lead = $booking->lead;
        $serial = $this->serial('allotment');
        $body = "Dear {$lead?->name},\n\n"
            ."We are pleased to formally allot "
            .($booking->plot ? "Unit {$booking->plot->number}" : 'the said unit')
            .($booking->project ? " in {$booking->project->name}" : '')
            ." against booking {$booking->booking_ref}, following receipt of the initial payment.\n\n"
            ."The Agreement for Sale will follow for your review and execution.\n\n"
            ."Warm regards,\nSales & Post-Sales Team";
        $letter = Letter::create([
            'booking_id' => $booking->id,
            'lead_id' => $booking->lead_id,
            'type' => 'allotment',
            'serial_no' => $serial,
            'title' => "Allotment Letter · {$booking->booking_ref}",
            'body' => $body,
            'status' => 'generated',
            'created_by' => Auth::id(),
        ]);
        if ($lead) {
            $this->whatsapp->sendAuto($lead, "Congratulations {$lead->name}! Your allotment is confirmed (Ref: {$serial}).", 'allotment_confirmed', [$lead->name, $serial]);
            if ($lead->email) {
                $this->email->send($lead, "Allotment Letter · {$booking->booking_ref}", $body);
            }
            $letter->update(['status' => 'sent', 'sent_at' => now(), 'sent_via' => $lead->email ? 'whatsapp+email' : 'whatsapp']);
            $this->activity->log($lead, 'system', 'Allotment letter sent', $serial);
        }
        return $letter->fresh();
    }

    /** Confirm a booking once token is paid AND form verified; fires welcome + checklist once. */
    public function confirmBooking(Booking $booking): Booking
    {
        if ($booking->token_status === 'paid' && $booking->verified_at && $booking->status !== 'confirmed') {
            $booking->update(['status' => 'confirmed']);
            $this->seedChecklist($booking);
            $this->generateWelcome($booking->fresh(['lead', 'plot', 'project']));
            app(PaymentScheduleService::class)->generateSchedule($booking->fresh());
        }
        return $booking->fresh();
    }

    public function serial(string $type): string
    {
        $prefix = ['welcome' => 'WEL', 'allotment' => 'ALT', 'demand' => 'DMD'][$type] ?? 'LTR';
        $year = now()->format('Y');
        $count = Letter::where('type', $type)->whereYear('created_at', $year)->count() + 1;
        return sprintf('%s-%s-%04d', $prefix, $year, $count);
    }
}
