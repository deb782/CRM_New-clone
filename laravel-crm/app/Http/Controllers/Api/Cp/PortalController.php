<?php

namespace App\Http\Controllers\Api\Cp;

use App\Http\Controllers\Controller;
use App\Models\CpDocument;
use App\Models\CpLead;
use App\Models\Plot;
use App\Models\Project;
use Illuminate\Http\Request;

class PortalController extends Controller
{
    private function cp(Request $r)
    {
        return $r->attributes->get('cp');
    }

    public function dashboard(Request $request)
    {
        $cp = $this->cp($request);
        $base = CpLead::where('channel_partner_id', $cp->id);
        return response()->json([
            'partner' => ['cp_code' => $cp->cp_code, 'name' => $cp->name, 'kyc_status' => $cp->kyc_status],
            'stats' => [
                'total' => (clone $base)->count(),
                'new' => (clone $base)->where('status', 'new')->count(),
                'qualified' => (clone $base)->where('status', 'qualified')->count(),
                'converted' => (clone $base)->where('status', 'converted')->count(),
                'representatives' => $cp->representatives()->where('status', 'active')->count(),
            ],
            'recent' => (clone $base)->with('representative:id,name')->orderByDesc('created_at')->limit(5)->get(),
        ]);
    }

    // Read-only inventory availability lookup for partners.
    public function inventory(Request $request)
    {
        $q = Plot::query()->with('project:id,name');
        if ($pid = $request->query('project_id')) {
            $q->where('project_id', $pid);
        }
        if ($status = $request->query('status')) {
            $q->where('status', $status);
        }
        if ($search = $request->query('search')) {
            $q->where('number', 'like', '%' . $search . '%');
        }
        $plots = $q->orderBy('number')->limit(300)->get()->map(fn ($p) => [
            'id' => $p->id,
            'project' => $p->project?->name,
            'number' => $p->number,
            'unit_type' => $p->unit_type,
            'carpet_area' => $p->carpet_area,
            'facing' => $p->facing,
            'price' => $p->price,
            'status' => $p->status,
            'available' => $p->status === 'available',
        ]);
        return response()->json(['data' => $plots]);
    }

    public function projects()
    {
        return response()->json(['data' => Project::orderBy('name')->get(['id', 'name', 'code'])]);
    }

    public function documents()
    {
        return response()->json(['data' => CpDocument::where('active', true)->orderByDesc('created_at')->get()]);
    }

    public function profile(Request $request)
    {
        return response()->json(['partner' => $this->cp($request)->makeVisible([])]);
    }

    public function updateProfile(Request $request)
    {
        $cp = $this->cp($request);
        $data = $request->validate([
            'company' => 'nullable|string|max:200',
            'phone' => 'nullable|string|max:20',
            'contact_name' => 'nullable|string|max:150',
            'contact_designation' => 'nullable|string|max:150',
            'registered_address' => 'nullable|string',
            'entity_type' => 'nullable|string|max:100',
            'nature_of_business' => 'nullable|string|max:200',
            'gstin' => 'nullable|string|max:20',
            'pan' => 'nullable|string|max:15',
            'rera_number' => 'nullable|string|max:50',
            'bank_account_name' => 'nullable|string|max:150',
            'bank_name' => 'nullable|string|max:150',
            'bank_account_number' => 'nullable|string|max:40',
            'bank_ifsc' => 'nullable|string|max:15',
            'bank_account_type' => 'nullable|string|max:30',
            'signature_name' => 'nullable|string|max:150',
            'signature_designation' => 'nullable|string|max:150',
        ]);
        $cp->fill($data)->save();
        return response()->json(['partner' => $cp->fresh()]);
    }

    // Partner submits KYC for admin approval.
    public function submitKyc(Request $request)
    {
        $cp = $this->cp($request);
        $cp->forceFill(['kyc_status' => 'submitted', 'kyc_submitted_at' => now()])->save();
        return response()->json(['message' => 'KYC submitted for review', 'partner' => $cp->fresh()]);
    }
}
