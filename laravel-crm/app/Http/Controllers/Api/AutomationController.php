<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AutomationLog;
use App\Models\AutomationRule;
use Illuminate\Http\Request;

class AutomationController extends Controller
{
    public function index()
    {
        return response()->json(['data' => AutomationRule::orderBy('event')->get()]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => 'required|string',
            'event' => 'required|string',
            'conditions' => 'nullable|array',
            'actions' => 'required|array',
            'delay_minutes' => 'nullable|integer',
            'active' => 'nullable|boolean',
        ]);
        return response()->json(['rule' => AutomationRule::create($data)], 201);
    }

    public function update(Request $request, AutomationRule $rule)
    {
        $rule->update($request->only(['name', 'event', 'conditions', 'actions', 'delay_minutes', 'active']));
        return response()->json(['rule' => $rule->fresh()]);
    }

    public function destroy(AutomationRule $rule)
    {
        $rule->delete();
        return response()->json(['message' => 'deleted']);
    }

    public function logs(Request $request)
    {
        $q = AutomationLog::with('rule')->latest();
        if ($status = $request->query('status')) {
            $q->where('status', $status);
        }
        if ($leadId = $request->query('lead_id')) {
            $q->where('lead_id', $leadId);
        }
        return response()->json($q->paginate((int) $request->query('per_page', 50)));
    }
}
