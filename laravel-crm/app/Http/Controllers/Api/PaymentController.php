<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\Payment;
use App\Services\PaymentService;
use Illuminate\Http\Request;

class PaymentController extends Controller
{
    public function __construct(private PaymentService $service) {}

    public function index(Request $request)
    {
        $q = Payment::with(['booking:id,booking_ref', 'lead:id,name']);
        if ($status = $request->query('status')) {
            $q->where('status', $status);
        }
        if ($bookingId = $request->query('booking_id')) {
            $q->where('booking_id', $bookingId);
        }
        return response()->json($q->latest()->paginate((int) $request->query('per_page', 50)));
    }

    /** Accounts reconciliation dashboard summary (N). */
    public function reconciliation()
    {
        $rows = Payment::selectRaw('status, count(*) as count, coalesce(sum(amount),0) as total')
            ->groupBy('status')->get();
        $summary = [];
        foreach (['received', 'verified', 'reconciled', 'discrepancy', 'failed'] as $s) {
            $r = $rows->firstWhere('status', $s);
            $summary[$s] = ['count' => (int) ($r->count ?? 0), 'total' => (int) ($r->total ?? 0)];
        }
        $discrepancies = Payment::with(['booking:id,booking_ref', 'lead:id,name'])
            ->where('status', 'discrepancy')->latest()->limit(50)->get();
        return response()->json([
            'summary' => $summary,
            'collected' => (int) Payment::whereIn('status', ['received', 'verified', 'reconciled'])->sum('amount'),
            'discrepancies' => $discrepancies,
        ]);
    }

    public function store(Request $request, Booking $booking)
    {
        $data = $request->validate([
            'type' => 'nullable|in:token,eoi,milestone,registration,other',
            'amount' => 'nullable|integer|min:0',
            'method' => 'nullable|in:online,razorpay,cheque,neft,upi,cash',
            'reference' => 'nullable|string',
            'gateway' => 'nullable|string',
            'gateway_ref' => 'nullable|string',
        ]);
        return response()->json(['payment' => $this->service->record($booking, $data)], 201);
    }

    public function verify(Payment $payment)
    {
        return response()->json(['payment' => $this->service->verify($payment)]);
    }

    public function reconcile(Request $request, Payment $payment)
    {
        $data = $request->validate([
            'result' => 'required|in:matched,discrepancy',
            'note' => 'nullable|string',
        ]);
        return response()->json(['payment' => $this->service->reconcile($payment, $data['result'], $data['note'] ?? null)]);
    }

    public function markFailed(Request $request, Payment $payment)
    {
        $data = $request->validate(['reason' => 'nullable|string']);
        return response()->json(['payment' => $this->service->markFailed($payment, $data['reason'] ?? null)]);
    }

    /** Branded PDF acknowledgement / receipt (durably stored). */
    public function receipt(Payment $payment, \App\Services\ReceiptService $receipts)
    {
        $bytes = $receipts->pdf($payment);
        $isPdf = strncmp($bytes, '%PDF', 4) === 0;
        return response($bytes, 200, [
            'Content-Type' => $isPdf ? 'application/pdf' : 'text/html',
            'Content-Disposition' => 'inline; filename="'.$payment->receipt_no.'.pdf"',
        ]);
    }
}
