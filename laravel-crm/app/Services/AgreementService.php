<?php

namespace App\Services;

use App\Models\Agreement;
use App\Models\Booking;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;

class AgreementService
{
    public function __construct(
        private ActivityService $activity,
        private EmailService $email,
        private WhatsAppService $whatsapp,
    ) {}

    /** O — generate a RERA-style Agreement for Sale (AFS). Idempotent per booking. */
    public function generateAfs(Booking $booking): Agreement
    {
        $existing = Agreement::where('booking_id', $booking->id)->where('type', 'afs')->first();
        if ($existing) {
            return $existing;
        }
        $booking->loadMissing(['lead', 'plot', 'project', 'costSheet']);
        $lead = $booking->lead;
        $serial = $this->serial();
        $total = $booking->costSheet?->total ?? $booking->deal_value;

        $body = "AGREEMENT FOR SALE (RERA)\n"
            ."Ref: {$serial}    Booking: {$booking->booking_ref}\n\n"
            ."This Agreement for Sale is made between the Promoter and the Allottee "
            .($lead ? $lead->name : '')." for the sale of "
            .($booking->plot ? "Unit {$booking->plot->number}" : 'the said unit')
            .($booking->project ? " in the project \"{$booking->project->name}\"" : '').".\n\n"
            ."1. Total Consideration: ₹".\App\Support\Money::group($total)."\n"
            ."2. Payment Plan: as per the agreed milestone schedule.\n"
            ."3. Possession & Construction: as per RERA-registered timelines.\n"
            ."4. Defect Liability, Common Areas, and Conveyance: as per the Real Estate (Regulation and Development) Act, 2016.\n\n"
            ."The Allottee is entitled to a 5-day review period before execution.\n";

        $agreement = Agreement::create([
            'booking_id' => $booking->id,
            'lead_id' => $booking->lead_id,
            'type' => 'afs',
            'serial_no' => $serial,
            'body' => $body,
            'status' => 'draft',
            'created_by' => Auth::id(),
        ]);
        if ($lead) {
            $this->activity->log($lead, 'system', 'Agreement for Sale drafted', $serial);
        }
        return $agreement->fresh();
    }

    /** O — send for (mock) e-signature; opens the 5-day legal review window. */
    public function sendForSign(Agreement $agreement): Agreement
    {
        $reviewDays = (int) config('integrations.payments.afs_review_days', 5);
        $driver = config('integrations.esign.driver', 'mock');
        $agreement->update([
            'status' => 'sent_for_sign',
            'esign_provider' => $driver,
            'esign_ref' => strtoupper($driver).'-'.Str::random(12),
            'sent_for_sign_at' => now(),
            'review_until' => now()->addDays($reviewDays),
        ]);
        $lead = $agreement->lead;
        if ($lead) {
            $this->whatsapp->send($lead, "Your Agreement for Sale {$agreement->serial_no} is ready for e-signature. You have a {$reviewDays}-day review period.");
            if ($lead->email) {
                $this->email->send($lead, "Agreement for Sale · {$agreement->serial_no}", $agreement->body);
            }
            $this->activity->log($lead, 'system', 'AFS sent for e-signature', $agreement->esign_ref);
        }
        return $agreement->fresh();
    }

    /** O — mark the (mock) e-signature complete. */
    public function markSigned(Agreement $agreement): Agreement
    {
        $agreement->update(['status' => 'signed', 'signed_at' => now()]);
        if ($agreement->lead) {
            $this->activity->log($agreement->lead, 'system', 'AFS e-signed', $agreement->serial_no);
        }
        return $agreement->fresh();
    }

    public function uploadSigned(Agreement $agreement, string $path): Agreement
    {
        $agreement->update(['signed_file_path' => $path, 'status' => 'signed', 'signed_at' => $agreement->signed_at ?: now()]);
        return $agreement->fresh();
    }

    /** O — track registration at the sub-registrar office. */
    public function register(Agreement $agreement, string $registrationNo): Agreement
    {
        $agreement->update([
            'status' => 'registered',
            'registration_no' => $registrationNo,
            'registered_at' => now(),
        ]);
        if ($agreement->lead) {
            $this->activity->log($agreement->lead, 'system', 'AFS registered', $registrationNo);
        }
        return $agreement->fresh();
    }

    private function serial(): string
    {
        $year = now()->format('Y');
        $count = Agreement::where('type', 'afs')->whereYear('created_at', $year)->count() + 1;
        return sprintf('AFS-%s-%04d', $year, $count);
    }
}
