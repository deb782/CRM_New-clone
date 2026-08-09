<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PaymentPlan;
use Illuminate\Http\Request;

class PaymentPlanController extends Controller
{
    public function index()
    {
        return response()->json(['data' => PaymentPlan::where('active', true)->get()]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => 'required|string',
            'code' => 'nullable|string',
            'description' => 'nullable|string',
            'milestones' => 'required|array|min:1',
            'milestones.*.label' => 'required|string',
            'milestones.*.pct' => 'required|numeric',
        ]);
        return response()->json(['plan' => PaymentPlan::create($data)], 201);
    }

    public function update(Request $request, PaymentPlan $paymentPlan)
    {
        $paymentPlan->update($request->only(['name', 'code', 'description', 'milestones', 'active']));
        return response()->json(['plan' => $paymentPlan->fresh()]);
    }

    public function destroy(PaymentPlan $paymentPlan)
    {
        $paymentPlan->delete();
        return response()->json(['message' => 'deleted']);
    }
}
