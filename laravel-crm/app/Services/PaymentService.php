<?php

namespace App\Services;

use App\Models\Booking;
use App\Models\Payment;
use Illuminate\Support\Facades\Auth;

class PaymentService
{
    public function __construct(
        private ActivityService $activity,
        private PostSalesService $postSales,
        private NotificationService $notify,
        private WhatsAppService $whatsapp,
    ) {}

    /** Record a payment against a booking and issue a serial receipt (N). */
    public function record(Booking $booking, array $data): Payment
    {
        $type = $data['type'] ?? 'token';
        $amount = (int) ($data['amount'] ?? ($type === 'token' ? $booking->token_amount : 0));

        $payment = Payment::create([
            'booking_id' => $booking->id,
            'lead_id' => $booking->lead_id,
            'type' => $type,
            'amount' => $amount,
            'method' => $data['method'] ?? 'online',
            'reference' => $data['reference'] ?? null,
            'gateway' => $data['gateway'] ?? 'manual',
            'gateway_ref' => $data['gateway_ref'] ?? null,
            'status' => 'received',
            'received_at' => now(),
            'receipt_no' => $this->receiptNo(),
            'receipt_issued_at' => now(),
            'meta' => $data['meta'] ?? null,
        ]);

        // Token/EOI payment marks the booking token as paid
        if (in_array($type, ['token', 'eoi'])) {
            $booking->update([
                'token_status' => 'paid',
                'token_paid_at' => now(),
                'payment_ref' => $payment->gateway_ref ?: $payment->receipt_no,
            ]);
            $this->postSales->confirmBooking($booking->fresh());
        }

        if ($booking->lead) {
            $this->activity->log($booking->lead, 'system', 'Payment received · '.$payment->receipt_no,
                '₹'.number_format($amount).' ('.$type.' · '.$payment->method.')');
            $this->whatsapp->sendAuto($booking->lead, "Hi {$booking->lead->name}, we've received your payment of ₹".number_format($amount).". Receipt: {$payment->receipt_no}. Thank you!", 'payment_received', [$booking->lead->name, number_format($amount), $payment->receipt_no]);
            $this->notify->notify($booking->lead->owner_id, 'payment',
                'Payment received · ₹'.number_format($amount),
                $booking->lead->name.' · '.$payment->receipt_no, '#/collections');
        }
        $this->notify->notifyPermission('accounts.manage', 'payment',
            'New payment to verify · ₹'.number_format($amount),
            ($booking->lead->name ?? 'Customer').' · '.$payment->receipt_no, '#/collections');
        return $payment->fresh();
    }

    /** Accounts verification of a received payment (N). */
    public function verify(Payment $payment): Payment
    {
        $payment->update([
            'status' => 'verified',
            'verified_at' => now(),
            'verified_by' => Auth::id(),
        ]);
        if ($payment->lead) {
            $this->activity->log($payment->lead, 'system', 'Payment verified by accounts · '.$payment->receipt_no);
        }
        return $payment->fresh();
    }

    /** Reconcile a payment against bank statement: matched -> reconciled, else discrepancy (N). */
    public function reconcile(Payment $payment, string $result, ?string $note = null): Payment
    {
        $status = $result === 'matched' ? 'reconciled' : 'discrepancy';
        $payment->update([
            'status' => $status,
            'reconciled_at' => now(),
            'reconciled_by' => Auth::id(),
            'reconcile_note' => $note,
        ]);
        if ($payment->lead) {
            $this->activity->log($payment->lead, 'system', 'Payment '.$status.' · '.$payment->receipt_no, $note);
        }
        return $payment->fresh();
    }

    /** R — mark a payment failed/bounced (e.g. cheque bounce) and reverse milestone allocation. */
    public function markFailed(Payment $payment, ?string $reason = null): Payment
    {
        $payment->update(['status' => 'failed', 'failure_reason' => $reason]);
        if ($payment->booking) {
            app(PaymentScheduleService::class)->syncStatuses($payment->booking);
        }
        if ($payment->lead) {
            $this->activity->log($payment->lead, 'system', 'Payment failed/bounced · '.$payment->receipt_no, $reason);
        }
        return $payment->fresh();
    }

    public function receiptNo(): string
    {
        $year = now()->format('Y');
        $count = Payment::whereYear('created_at', $year)->count() + 1;
        return sprintf('RCPT-%s-%05d', $year, $count);
    }
}