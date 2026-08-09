<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Lead;
use App\Services\ActivityService;
use App\Services\EmailService;
use App\Services\TelephonyService;
use App\Services\WhatsAppService;
use Illuminate\Http\Request;

class CommunicationController extends Controller
{
    public function __construct(
        private WhatsAppService $whatsapp,
        private EmailService $email,
        private TelephonyService $telephony,
        private ActivityService $activity,
    ) {}

    public function sendWhatsapp(Request $request, Lead $lead)
    {
        $data = $request->validate(['body' => 'required|string', 'template' => 'nullable|string']);
        $msg = $this->whatsapp->send($lead, $data['body'], $data['template'] ?? null);
        return response()->json(['message' => $msg]);
    }

    public function sendEmail(Request $request, Lead $lead)
    {
        $data = $request->validate(['subject' => 'required|string', 'body' => 'required|string']);
        $email = $this->email->send($lead, $data['subject'], $data['body']);
        return response()->json(['email' => $email]);
    }

    public function clickToCall(Lead $lead)
    {
        return response()->json($this->telephony->clickToCall($lead));
    }

    public function logCall(Request $request, Lead $lead)
    {
        $data = $request->validate([
            'outcome' => 'required|in:connected,no_answer,switched_off,wrong_number,busy',
            'duration' => 'nullable|integer',
            'notes' => 'nullable|string',
            'recording_url' => 'nullable|string',
            'direction' => 'nullable|in:inbound,outbound',
        ]);
        $call = $this->telephony->logCall($lead, $data);
        return response()->json(['call' => $call, 'lead' => $lead->fresh()]);
    }

    public function addNote(Request $request, Lead $lead)
    {
        $data = $request->validate(['body' => 'required|string']);
        $activity = $this->activity->log($lead, 'note', 'Note added', $data['body']);
        return response()->json(['activity' => $activity->load('user')]);
    }
}
