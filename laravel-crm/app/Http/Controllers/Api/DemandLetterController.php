<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\DemandLetter;
use App\Models\PaymentMilestone;
use App\Services\DemandLetterService;
use Illuminate\Http\Request;

class DemandLetterController extends Controller
{
    public function __construct(private DemandLetterService $service) {}

    public function index(Request $request)
    {
        $q = DemandLetter::with(['booking:id,booking_ref', 'lead:id,name', 'milestone:id,label']);
        if ($status = $request->query('status')) {
            $q->where('status', $status);
        }
        if ($bookingId = $request->query('booking_id')) {
            $q->where('booking_id', $bookingId);
        }
        return response()->json($q->latest()->paginate((int) $request->query('per_page', 50)));
    }

    public function generate(PaymentMilestone $milestone)
    {
        $letter = $this->service->generateForMilestone($milestone);
        if (! $letter) {
            return response()->json(['message' => 'Milestone is not overdue or already paid'], 422);
        }
        return response()->json(['demand_letter' => $letter], 201);
    }

    public function deliver(Request $request, DemandLetter $demandLetter)
    {
        $data = $request->validate([
            'via' => 'required|string',
            'registered_post_ref' => 'nullable|string',
        ]);
        return response()->json(['demand_letter' => $this->service->deliver($demandLetter, $data['via'], $data['registered_post_ref'] ?? null)]);
    }

    public function escalate(DemandLetter $demandLetter)
    {
        return response()->json(['demand_letter' => $this->service->escalate($demandLetter)]);
    }
}
