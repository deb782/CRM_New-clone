<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Lead;
use App\Models\LeadStatus;
use App\Services\FlowEngine;
use Illuminate\Http\Request;

class JourneyController extends Controller
{
    /** Full status catalog grouped by macro stage — powers the builder + status pills. */
    public function statuses()
    {
        $all = LeadStatus::orderBy('stage_key')->orderBy('sort')->get();
        $stages = [];
        foreach ($all as $s) {
            $stages[$s->stage_key]['key'] = $s->stage_key;
            $stages[$s->stage_key]['name'] = $s->stage_name;
            $stages[$s->stage_key]['sla_minutes'] = $s->lane_sla_minutes;
            $stages[$s->stage_key]['statuses'][] = [
                'code' => $s->code,
                'display_name' => $s->display_name,
                'color' => $s->color,
                'wa_message' => $s->wa_message,
                'wa_enabled' => (bool) $s->wa_enabled,
                'wa_buttons' => $s->wa_buttons ?? [],
                'allowed_next' => $s->allowed_next ?? [],
                'gate_fields' => $s->gate_fields ?? [],
                'sla_minutes' => $s->sla_minutes,
                'is_terminal' => $s->is_terminal,
                'disposition' => $s->disposition,
            ];
        }

        return response()->json(['stages' => array_values($stages)]);
    }

    /** Update the customer WhatsApp message / colour for a status (Journey messages editor). */
    public function updateStatus(Request $request, string $code)
    {
        $status = LeadStatus::where('code', $code)->firstOrFail();
        $data = $request->validate([
            'wa_message' => 'nullable|string|max:1000',
            'wa_enabled' => 'boolean',
            'color' => 'nullable|string|max:12',
            'wa_buttons' => 'nullable|array|max:3',
            'wa_buttons.*.label' => 'required|string|max:20',
            'wa_buttons.*.next_code' => 'required|string|exists:lead_statuses,code',
        ]);
        $status->fill($data)->save();
        return response()->json(['status' => $status]);
    }

    /** Send a status's WhatsApp message to one lead now (test / manual broadcast). */
    public function testMessage(Request $request, string $code, \App\Services\WhatsAppService $wa)
    {
        $status = LeadStatus::where('code', $code)->firstOrFail();
        $data = $request->validate(['lead_id' => 'required|exists:leads,id']);
        $lead = Lead::findOrFail($data['lead_id']);
        if (blank($status->wa_message)) {
            return response()->json(['message' => 'No WhatsApp message configured for this status.'], 422);
        }
        $body = str_replace(['{name}', '{first_name}'], [$lead->name ?: 'there', explode(' ', trim((string) $lead->name))[0] ?: 'there'], $status->wa_message);
        $buttons = collect($status->wa_buttons ?? [])
            ->filter(fn ($b) => filled($b['label'] ?? null) && filled($b['next_code'] ?? null))
            ->map(fn ($b) => ['id' => 'jrny_' . $b['next_code'], 'title' => $b['label']])->values()->all();
        $msg = ! empty($buttons)
            ? $wa->sendInteractive($lead, $body, $buttons, 'journey:' . $status->code)
            : $wa->send($lead, $body, 'journey:' . $status->code);
        return response()->json(['ok' => true, 'status' => $msg->status, 'body' => $body, 'buttons' => array_column($buttons, 'title')]);
    }

    /** Move a lead to a new status, enforcing allow-listed transitions + mandatory gates. */
    public function transition(Request $request, Lead $lead, FlowEngine $engine)
    {
        $data = $request->validate([
            'code' => 'required|string',
            'reason' => 'nullable|string|max:300',
        ]);
        $res = $engine->applyStatus($lead, $data['code'], true, $request->user()?->id, $data['reason'] ?? null);
        if (! $res['ok']) {
            return response()->json(['message' => $res['message'], 'gate' => $res['gate'] ?? null], 422);
        }

        return response()->json(['ok' => true, 'message' => $res['message'], 'lead' => $lead->fresh()]);
    }
}
