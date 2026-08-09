<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Lead;
use App\Models\Sequence;
use App\Services\SequenceService;
use Illuminate\Http\Request;

class SequenceController extends Controller
{
    public function index()
    {
        return response()->json(['data' => Sequence::with('steps')->get()]);
    }

    public function enroll(Request $request, Lead $lead, SequenceService $sequences)
    {
        $enrollment = $sequences->enroll($lead, $request->input('temperature'));
        return response()->json(['enrollment' => $enrollment]);
    }

    public function pause(Request $request, Lead $lead, SequenceService $sequences)
    {
        $sequences->pause($lead, $request->input('reason', 'manual'));
        return response()->json(['message' => 'paused']);
    }
}
