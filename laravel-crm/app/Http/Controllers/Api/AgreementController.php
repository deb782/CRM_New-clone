<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Agreement;
use App\Models\Booking;
use App\Services\AgreementService;
use Illuminate\Http\Request;

class AgreementController extends Controller
{
    public function __construct(private AgreementService $service) {}

    public function index(Booking $booking)
    {
        return response()->json(['agreements' => Agreement::where('booking_id', $booking->id)->latest()->get()]);
    }

    public function generate(Booking $booking)
    {
        return response()->json(['agreement' => $this->service->generateAfs($booking)], 201);
    }

    public function sendForSign(Agreement $agreement)
    {
        return response()->json(['agreement' => $this->service->sendForSign($agreement)]);
    }

    public function sign(Agreement $agreement)
    {
        return response()->json(['agreement' => $this->service->markSigned($agreement)]);
    }

    public function uploadSigned(Request $request, Agreement $agreement)
    {
        $data = $request->validate(['file_path' => 'required|string']);
        return response()->json(['agreement' => $this->service->uploadSigned($agreement, $data['file_path'])]);
    }

    public function register(Request $request, Agreement $agreement)
    {
        $data = $request->validate(['registration_no' => 'required|string']);
        return response()->json(['agreement' => $this->service->register($agreement, $data['registration_no'])]);
    }
}
