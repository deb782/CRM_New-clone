<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Lead;
use App\Models\ScoringRule;
use App\Services\ScoringService;
use Illuminate\Http\Request;

class ScoringController extends Controller
{
    public function index()
    {
        return response()->json(['data' => ScoringRule::orderBy('category')->get()]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'category' => 'required|in:engagement,qualification,responsiveness,recency,source',
            'factor' => 'required|string',
            'field' => 'required|string',
            'operator' => 'required|string',
            'value' => 'nullable|string',
            'points' => 'required|integer',
            'active' => 'nullable|boolean',
        ]);
        return response()->json(['rule' => ScoringRule::create($data)], 201);
    }

    public function update(Request $request, ScoringRule $rule)
    {
        $rule->update($request->only(['category', 'factor', 'field', 'operator', 'value', 'points', 'active']));
        return response()->json(['rule' => $rule->fresh()]);
    }

    public function destroy(ScoringRule $rule)
    {
        $rule->delete();
        return response()->json(['message' => 'deleted']);
    }

    public function recalculateAll(ScoringService $scoring)
    {
        $count = 0;
        Lead::where('is_invalid', false)->chunk(200, function ($leads) use ($scoring, &$count) {
            foreach ($leads as $lead) {
                $scoring->apply($lead);
                $count++;
            }
        });
        return response()->json(['recalculated' => $count]);
    }
}
