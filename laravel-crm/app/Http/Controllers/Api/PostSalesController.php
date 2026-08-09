<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\DocumentChecklistItem;
use App\Models\Letter;
use App\Services\PostSalesService;
use Illuminate\Http\Request;

class PostSalesController extends Controller
{
    public function __construct(private PostSalesService $service) {}

    /** Documents + letters for a booking. */
    public function show(Booking $booking)
    {
        // Ensure a checklist exists for any confirmed booking a user opens.
        if ($booking->status === 'confirmed') {
            $this->service->seedChecklist($booking);
        }
        return response()->json([
            'booking' => $booking->only(['id', 'booking_ref', 'status', 'token_status']),
            'documents' => DocumentChecklistItem::where('booking_id', $booking->id)->orderBy('category')->get(),
            'letters' => Letter::where('booking_id', $booking->id)->latest()->get(),
        ]);
    }

    public function seedChecklist(Booking $booking)
    {
        $this->service->seedChecklist($booking);
        return response()->json(['documents' => DocumentChecklistItem::where('booking_id', $booking->id)->get()]);
    }

    public function updateDoc(Request $request, DocumentChecklistItem $item)
    {
        $data = $request->validate([
            'status' => 'nullable|in:pending,received,verified,rejected',
            'notes' => 'nullable|string',
            'file_path' => 'nullable|string',
        ]);
        return response()->json(['document' => $this->service->updateDocItem($item, $data)]);
    }

    public function welcome(Booking $booking)
    {
        return response()->json(['letter' => $this->service->generateWelcome($booking->load(['lead', 'plot', 'project']))]);
    }
}
