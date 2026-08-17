<?php

namespace App\Http\Controllers\Api\Cp;

use App\Http\Controllers\Controller;
use App\Models\CpLead;
use App\Services\CpLeadService;
use Illuminate\Http\Request;

class LeadController extends Controller
{
    public function __construct(private CpLeadService $svc) {}

    private function cp(Request $r)
    {
        return $r->attributes->get('cp');
    }

    public function index(Request $request)
    {
        $cp = $this->cp($request);
        $q = CpLead::where('channel_partner_id', $cp->id)
            ->with(['representative:id,name', 'project:id,name', 'convertedLead:id,name,status']);
        if ($status = $request->query('status')) {
            if ($status !== 'all') {
                $q->where('status', $status);
            }
        }
        if ($rep = $request->query('representative_id')) {
            $q->where('cp_representative_id', $rep);
        }
        if ($search = $request->query('search')) {
            $s = '%' . $search . '%';
            $q->where(fn ($w) => $w->where('customer_name', 'like', $s)->orWhere('phone', 'like', $s)->orWhere('email', 'like', $s));
        }
        $q->orderByDesc('created_at');
        return response()->json($q->paginate((int) $request->query('per_page', 15)));
    }

    public function store(Request $request)
    {
        $cp = $this->cp($request);
        $data = $request->validate([
            'customer_name' => 'required|string|max:150',
            'phone' => 'required|string|max:20',
            'email' => 'nullable|email|max:150',
            'plot_type' => 'nullable|string|max:100',
            'project_id' => 'nullable|exists:projects,id',
            'cp_representative_id' => 'nullable|integer',
            'notes' => 'nullable|string',
        ]);

        // Verify the representative belongs to this partner.
        if (! empty($data['cp_representative_id'])) {
            $ok = $cp->representatives()->where('id', $data['cp_representative_id'])->exists();
            if (! $ok) {
                return response()->json(['message' => 'Invalid representative.'], 422);
            }
        }

        $lead = CpLead::create($data + [
            'channel_partner_id' => $cp->id,
            'source' => 'Channel Partner Portal',
            'status' => 'new',
        ]);
        $this->svc->logEvent($lead, null, 'new', 'partner', $cp->id, 'Lead submitted by partner');
        return response()->json(['lead' => $lead->load(['representative:id,name', 'project:id,name'])], 201);
    }

    public function show(Request $request, CpLead $cpLead)
    {
        $this->authorizeOwn($request, $cpLead);
        return response()->json(['lead' => $cpLead->load(['representative:id,name', 'project:id,name', 'events', 'convertedLead:id,name,status'])]);
    }

    public function update(Request $request, CpLead $cpLead)
    {
        $this->authorizeOwn($request, $cpLead);
        if ($cpLead->status === 'converted') {
            return response()->json(['message' => 'This lead is already in the CRM and cannot be edited.'], 422);
        }
        $data = $request->validate([
            'customer_name' => 'sometimes|string|max:150',
            'phone' => 'sometimes|string|max:20',
            'email' => 'nullable|email|max:150',
            'plot_type' => 'nullable|string|max:100',
            'notes' => 'nullable|string',
            'status' => 'sometimes|in:new,contacted,qualified,lost',
        ]);
        $old = $cpLead->status;
        $cpLead->fill($data)->save();
        if (isset($data['status']) && $data['status'] !== $old) {
            $this->svc->logEvent($cpLead, $old, $data['status'], 'partner', $this->cp($request)->id);
        }
        return response()->json(['lead' => $cpLead->fresh(['representative:id,name'])]);
    }

    private function authorizeOwn(Request $request, CpLead $cpLead): void
    {
        abort_if($cpLead->channel_partner_id !== $this->cp($request)->id, 404, 'Lead not found.');
    }
}
