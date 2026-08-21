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
            'confirm_visit' => 'nullable|boolean',      // BDM confirms the booked site visit (ends Pre-Sales, starts Sales)
            'advance_to' => 'nullable|string',           // optional journey status to move to after the call
        ]);
        $call = $this->telephony->logCall($lead, $data);
        $summary = $data['notes'] ?? null;

        if (($data['outcome'] ?? null) === 'connected') {
            // BDM confirms the site visit → Sales journey + nurture loop start.
            if (! empty($data['confirm_visit'])) {
                $visit = \App\Models\SiteVisit::where('lead_id', $lead->id)
                    ->whereIn('status', ['scheduled', 'rescheduled', 'confirmed'])
                    ->orderByDesc('scheduled_at')->first();
                if ($visit) {
                    app(\App\Services\SiteVisitService::class)->confirm($visit);
                }
            }
            // CRM's first call on a Won lead → Post-Sales journey starts.
            if ($lead->locked && $request->user()->hasPermission('postsales.manage')) {
                $this->activity->log($lead, 'system', 'Post-Sales journey started', $summary ?: 'Customer onboarding call logged');
            }
            // A logged call with a summary can advance the journey stage.
            if (! empty($data['advance_to'])) {
                $res = app(\App\Services\FlowEngine::class)->applyStatus($lead, $data['advance_to'], true, null, $summary ?: 'Advanced via logged call');
                if (! ($res['ok'] ?? true)) {
                    return response()->json(['message' => $res['message'] ?? 'Transition not allowed'], 422);
                }
            }
        }

        return response()->json(['call' => $call, 'lead' => $lead->fresh()]);
    }

    public function addNote(Request $request, Lead $lead)
    {
        $data = $request->validate(['body' => 'required|string']);
        $activity = $this->activity->log($lead, 'note', 'Note added', $data['body']);
        return response()->json(['activity' => $activity->load('user')]);
    }
}
