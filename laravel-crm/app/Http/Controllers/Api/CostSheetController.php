<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CostSheet;
use App\Models\Lead;
use App\Models\Proposal;
use App\Services\CostSheetService;
use Illuminate\Http\Request;

class CostSheetController extends Controller
{
    public function __construct(private CostSheetService $service) {}

    public function index(Lead $lead)
    {
        return response()->json([
            'cost_sheets' => $lead->costSheets()->with(['plot', 'paymentPlan', 'approvals.requester'])->latest()->get(),
            'proposals' => Proposal::where('lead_id', $lead->id)->latest()->get(),
        ]);
    }

    public function store(Request $request, Lead $lead)
    {
        $data = $request->validate([
            'base_price' => 'nullable|integer|min:0',
            'plot_id' => 'nullable|exists:plots,id',
            'project_id' => 'nullable|exists:projects,id',
            'gst_rate' => 'nullable|numeric',
            'registration_charges' => 'nullable|integer|min:0',
            'maintenance_charges' => 'nullable|integer|min:0',
            'other_charges' => 'nullable|integer|min:0',
            'other_label' => 'nullable|string',
            'discount_pct' => 'nullable|numeric|min:0|max:100',
            'discount_amount' => 'nullable|integer|min:0',
            'discount_reason' => 'nullable|string',
            'payment_plan_id' => 'nullable|exists:payment_plans,id',
        ]);
        return response()->json(['cost_sheet' => $this->service->create($lead, $data)], 201);
    }

    public function show(CostSheet $costSheet)
    {
        return response()->json(['cost_sheet' => $costSheet->load(['plot', 'paymentPlan', 'approvals.requester', 'lead'])]);
    }

    public function selectPlan(Request $request, CostSheet $costSheet)
    {
        $data = $request->validate(['payment_plan_id' => 'required|exists:payment_plans,id']);
        return response()->json(['cost_sheet' => $this->service->selectPlan($costSheet, $data['payment_plan_id'])]);
    }

    public function share(CostSheet $costSheet)
    {
        return response()->json(['cost_sheet' => $this->service->share($costSheet)]);
    }

    public function generateProposal(CostSheet $costSheet)
    {
        return response()->json(['proposal' => $this->service->generateProposal($costSheet)], 201);
    }

    public function sendProposal(Proposal $proposal)
    {
        return response()->json(['proposal' => $this->service->sendProposal($proposal)]);
    }

    public function consent(Request $request, Proposal $proposal)
    {
        $data = $request->validate(['name' => 'required|string']);
        return response()->json(['proposal' => $this->service->captureConsent($proposal, $data['name'])]);
    }
}
