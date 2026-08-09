<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\PaymentMilestone;
use App\Services\PaymentScheduleService;
use Illuminate\Http\Request;

class PaymentScheduleController extends Controller
{
    public function __construct(private PaymentScheduleService $service) {}

    public function index(Booking $booking)
    {
        $this->service->syncStatuses($booking);
        return response()->json([
            'milestones' => PaymentMilestone::where('booking_id', $booking->id)->orderBy('seq')->get(),
            'collected' => $this->service->collectedSum($booking),
            'deal_value' => (int) $booking->deal_value,
        ]);
    }

    public function generate(Booking $booking)
    {
        $this->service->generateSchedule($booking);
        return response()->json(['milestones' => PaymentMilestone::where('booking_id', $booking->id)->orderBy('seq')->get()]);
    }

    public function pay(Request $request, PaymentMilestone $milestone)
    {
        $data = $request->validate([
            'amount' => 'nullable|integer|min:1',
            'method' => 'nullable|in:online,razorpay,cheque,neft,upi,cash',
            'reference' => 'nullable|string',
        ]);
        return response()->json(['milestone' => $this->service->recordMilestonePayment($milestone, $data)]);
    }

    public function collections()
    {
        return response()->json($this->service->collectionsDashboard());
    }
}
