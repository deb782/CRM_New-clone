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
                'allowed_next' => $s->allowed_next ?? [],
                'gate_fields' => $s->gate_fields ?? [],
                'sla_minutes' => $s->sla_minutes,
                'is_terminal' => $s->is_terminal,
                'disposition' => $s->disposition,
            ];
        }

        return response()->json(['stages' => array_values($stages)]);
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
