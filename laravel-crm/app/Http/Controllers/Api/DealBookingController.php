<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\Lead;
use App\Services\BookingService;
use Illuminate\Http\Request;

class DealBookingController extends Controller
{
    public function __construct(private BookingService $service) {}

    public function markWon(Request $request, Lead $lead)
    {
        $data = $request->validate([
            'plot_id' => 'nullable|exists:plots,id',
            'deal_value' => 'nullable|integer|min:0',
            'token_amount' => 'nullable|integer|min:0',
        ]);
        return response()->json(['booking' => $this->service->markWon($lead, $data)], 201);
    }

    public function markLost(Request $request, Lead $lead)
    {
        $data = $request->validate(['reason' => 'nullable|string']);
        return response()->json(['lead' => $this->service->markLost($lead, $data)]);
    }

    public function index(Request $request)
    {
        $q = Booking::with(['lead', 'project', 'plot']);
        if ($status = $request->query('status')) {
            $q->where('status', $status);
        }
        return response()->json($q->latest()->paginate((int) $request->query('per_page', 50)));
    }

    public function show(Booking $booking)
    {
        return response()->json(['booking' => $booking->load(['lead', 'project', 'plot', 'costSheet'])]);
    }

    public function verify(Booking $booking)
    {
        return response()->json(['booking' => $this->service->verify($booking)]);
    }

    public function payToken(Booking $booking)
    {
        return response()->json(['booking' => $this->service->payToken($booking)]);
    }

    // ---- Public booking form (token link) ----
    public function publicShow(string $token)
    {
        $b = Booking::where('form_token', $token)->firstOrFail();
        $b->load(['lead:id,name,email,phone', 'project:id,name', 'plot:id,number,unit_type']);
        return response()->json([
            'booking_ref' => $b->booking_ref,
            'status' => $b->status,
            'lead' => $b->lead,
            'project' => $b->project,
            'plot' => $b->plot,
            'token_amount' => $b->token_amount,
            'deal_value' => $b->deal_value,
            'form_data' => $b->form_data,
        ]);
    }

    public function publicSubmit(Request $request, string $token)
    {
        $b = Booking::where('form_token', $token)->firstOrFail();
        $data = $request->validate([
            'applicant_name' => 'required|string',
            'email' => 'nullable|email',
            'phone' => 'nullable|string',
            'address' => 'nullable|string',
            'pan' => 'nullable|string',
            'aadhaar' => 'nullable|string',
            'co_applicant' => 'nullable|string',
            'nominee' => 'nullable|string',
        ]);
        return response()->json(['booking' => $this->service->submitForm($b, $data)]);
    }
}
