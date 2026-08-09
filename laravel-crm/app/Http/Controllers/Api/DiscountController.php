<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\DiscountApproval;
use App\Services\CostSheetService;
use Illuminate\Http\Request;

class DiscountController extends Controller
{
    public function __construct(private CostSheetService $service) {}

    public function index(Request $request)
    {
        $q = DiscountApproval::with(['lead', 'requester', 'costSheet']);
        $q->where('status', $request->query('status', 'pending'));
        return response()->json(['data' => $q->latest()->get()]);
    }

    public function decide(Request $request, DiscountApproval $approval)
    {
        $data = $request->validate([
            'decision' => 'required|in:approved,rejected,counter',
            'note' => 'nullable|string',
            'counter_pct' => 'nullable|numeric|min:0|max:100',
        ]);
        return response()->json(['approval' => $this->service->decide($approval, $data['decision'], $data['note'] ?? null, $data['counter_pct'] ?? null)]);
    }
}
