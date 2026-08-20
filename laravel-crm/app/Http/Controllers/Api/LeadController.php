<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Lead;
use App\Models\PipelineStage;
use App\Services\DuplicateService;
use App\Services\LeadService;
use Illuminate\Http\Request;

class LeadController extends Controller
{
    public function __construct(private LeadService $leads, private DuplicateService $duplicates) {}

    public function index(Request $request)
    {
        $q = Lead::query()->with(['stage', 'owner', 'project']);
        \App\Support\ProjectScope::apply($q, $request->user());

        if ($s = $request->query('search')) {
            $q->where(function ($w) use ($s) {
                $w->where('name', 'like', "%{$s}%")
                    ->orWhere('email', 'like', "%{$s}%")
                    ->orWhere('phone', 'like', "%{$s}%");
            });
        }
        if ($status = $request->query('status')) {
            $q->where('status', $status);
        }
        if ($temp = $request->query('temperature')) {
            $q->where('temperature', $temp);
        }
        if ($source = $request->query('source')) {
            $q->where('source', $source);
        }
        if ($owner = $request->query('owner_id')) {
            $q->where('owner_id', $owner);
        }

        $sort = $request->query('sort', 'created_at');
        $dir = $request->query('dir', 'desc');
        $q->orderBy(in_array($sort, ['created_at', 'score', 'last_contacted_at', 'name']) ? $sort : 'created_at', $dir === 'asc' ? 'asc' : 'desc');

        return response()->json($q->paginate((int) $request->query('per_page', 25)));
    }

    public function board()
    {
        $stages = PipelineStage::orderBy('sort_order')->get();
        $leads = Lead::with('owner')->orderByDesc('score')->get()->groupBy('pipeline_stage_id');
        return response()->json([
            'stages' => $stages,
            'leads' => $leads,
        ]);
    }

    public function callList(Request $request)
    {
        // Prioritized list (H1.3): hot first, recent first, exclude invalid/DNC
        $leads = Lead::with(['owner', 'stage'])
            ->where('is_invalid', false)
            ->where('do_not_contact', false)
            ->when($request->query('owner_id'), fn ($q, $o) => $q->where('owner_id', $o))
            ->orderByRaw("FIELD(temperature,'hot','warm','cold')")
            ->orderByDesc('score')
            ->orderByRaw('last_contacted_at IS NULL, last_contacted_at ASC')
            ->limit(100)
            ->get();
        return response()->json(['leads' => $leads]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'nullable|email',
            'phone' => 'nullable|string|max:30',
            'source' => 'nullable|string',
            'city' => 'nullable|string',
            'project_id' => 'nullable|exists:projects,id',
            'campaign' => 'nullable|string',
        ]);
        if (empty($data['email']) && empty($data['phone'])) {
            return response()->json(['message' => 'Phone or email is required.'], 422);
        }

        $result = $this->leads->capture($data, (bool) $request->boolean('force'));
        if ($result['status'] === 'duplicate') {
            return response()->json([
                'message' => 'Potential duplicate detected.',
                'duplicate' => $result['duplicate'],
            ], 409);
        }
        return response()->json(['lead' => $result['lead']], 201);
    }

    public function show(Lead $lead)
    {
        $lead->load(['stage', 'owner', 'project', 'contact', 'tasks.assignee', 'calls', 'whatsappMessages', 'emails', 'enrollments.sequence', 'siteVisits.project', 'siteVisits.plot', 'bookings.plot', 'bookings.project']);
        return response()->json([
            'lead' => $lead,
            'timeline' => $lead->activities()->with('user')->limit(100)->get(),
        ]);
    }

    /** Front-line execs (BDE/BDM) may only edit leads they currently own — read-only after hand-off. */
    protected function assertOwnerOrManager(Request $request, Lead $lead): void
    {
        $user = $request->user();
        if ($user->role?->tier === 'exec' && $lead->owner_id !== $user->id) {
            abort(403, 'This lead is now owned by another team member and is read-only for you.');
        }
    }

    public function update(Request $request, Lead $lead)
    {
        if ($lead->locked && ! $request->user()->hasPermission('postsales.manage')) {
            abort(423, 'This record is locked (post-sales handover). Contact post-sales to edit.');
        }
        $this->assertOwnerOrManager($request, $lead);
        $data = $request->validate([
            'name' => 'sometimes|string|max:255',
            'email' => 'nullable|email',
            'phone' => 'nullable|string|max:30',
            'city' => 'nullable|string',
            'project_id' => 'nullable|exists:projects,id',
            'owner_id' => 'nullable|exists:users,id',
            'comm_preference' => 'nullable|in:any,call,whatsapp,email',
            'whatsapp_opt_out' => 'nullable|boolean',
            'do_not_contact' => 'nullable|boolean',
        ]);
        $original = $lead->getOriginal();
        $lead->fill($data)->save();
        app(\App\Services\AuditService::class)->recordChanges($lead, $original, array_keys($data));
        return response()->json(['lead' => $lead->fresh()]);
    }

    public function qualify(Request $request, Lead $lead)
    {
        if ($lead->locked && ! $request->user()->hasPermission('postsales.manage')) {
            abort(423, 'This record is locked (post-sales handover).');
        }
        $this->assertOwnerOrManager($request, $lead);
        $data = $request->validate([
            'interest_level' => 'nullable|in:very_high,high,medium,low',
            'budget_min' => 'nullable|integer',
            'budget_max' => 'nullable|integer',
            'preferred_location' => 'nullable|string',
            'property_type' => 'nullable|string',
            'timeline' => 'nullable|in:immediate,1-3m,3-6m,6-12m,later',
            'financing' => 'nullable|in:cash,loan,mixed',
            'decision_maker' => 'nullable|in:self,spouse,family,advisor',
            'primary_objection' => 'nullable|string',
            'objection_severity' => 'nullable|in:blocking,manageable,minor',
            'intent_notes' => 'nullable|string',
        ]);
        return response()->json(['lead' => $this->leads->qualify($lead, $data)]);
    }

    public function transition(Request $request, Lead $lead)
    {
        $data = $request->validate([
            'stage' => 'required|string|exists:pipeline_stages,slug',
            'reason' => 'nullable|string',
        ]);
        $user = $request->user();
        $force = $user && $user->hasPermission('leads.override');
        return response()->json(['lead' => $this->leads->transition($lead, $data['stage'], $data['reason'] ?? null, $force)]);
    }

    public function verify(Request $request, Lead $lead)
    {
        $data = $request->validate([
            'phone' => 'nullable|string|max:30',
            'email' => 'nullable|email',
            'alt_phone' => 'nullable|string|max:30',
            'alt_email' => 'nullable|email',
        ]);
        return response()->json(['lead' => $this->leads->verifyContact($lead, $data)]);
    }

    public function recalculate(Lead $lead)
    {
        $result = app(\App\Services\ScoringService::class)->apply($lead);
        return response()->json(['lead' => $lead->fresh(), 'result' => $result]);
    }

    public function merge(Request $request, Lead $lead)
    {
        $data = $request->validate([
            'duplicate_id' => 'required|exists:leads,id|different:id',
            'reason' => 'nullable|string',
        ]);
        $dup = Lead::findOrFail($data['duplicate_id']);
        $master = $this->duplicates->merge($lead, $dup, $data['reason'] ?? null);
        return response()->json(['lead' => $master]);
    }

    public function checkDuplicate(Request $request)
    {
        $result = $this->duplicates->detect($request->query('email'), $request->query('phone'), $request->query('name'));
        return response()->json($result);
    }

    public function destroy(Lead $lead)
    {
        $lead->delete();
        return response()->json(['message' => 'deleted']);
    }

    /** R1/R8 — mark Do-Not-Contact / wrong-number / spam and manage consent. */
    public function markDnc(Request $request, Lead $lead)
    {
        $data = $request->validate(['reason' => 'nullable|string']);
        $lead->forceFill(['do_not_contact' => true, 'invalid_reason' => $data['reason'] ?? 'do not contact'])->save();
        app(\App\Services\SequenceService::class)->pause($lead, 'do not contact');
        return response()->json(['lead' => $lead->fresh()]);
    }

    public function markInvalid(Request $request, Lead $lead)
    {
        $data = $request->validate(['reason' => 'required|in:wrong_number,spam,invalid,junk']);
        $lead->forceFill(['is_invalid' => true, 'invalid_reason' => $data['reason'], 'do_not_contact' => true])->save();
        app(\App\Services\SequenceService::class)->pause($lead, $data['reason']);
        $this->leads->transition($lead, 'not_interested', $data['reason'], true);
        return response()->json(['lead' => $lead->fresh()]);
    }

    public function consent(Request $request, Lead $lead)
    {
        $data = $request->validate([
            'do_not_contact' => 'nullable|boolean',
            'whatsapp_opt_out' => 'nullable|boolean',
            'comm_preference' => 'nullable|in:any,call,whatsapp,email',
        ]);
        $lead->forceFill(array_filter($data, fn ($v) => $v !== null))->save();
        return response()->json(['lead' => $lead->fresh()]);
    }

    /** R — multiple decision-makers / stakeholders on a lead. */
    public function addStakeholder(Request $request, Lead $lead)
    {
        $data = $request->validate([
            'name' => 'required|string',
            'role' => 'nullable|string',
            'phone' => 'nullable|string',
            'email' => 'nullable|email',
            'is_primary' => 'nullable|boolean',
        ]);
        $list = $lead->stakeholders ?: [];
        if (! empty($data['is_primary'])) {
            $list = array_map(fn ($s) => array_merge($s, ['is_primary' => false]), $list);
        }
        $list[] = array_merge(['role' => 'decision_maker', 'is_primary' => false], $data);
        $lead->forceFill(['stakeholders' => array_values($list)])->save();
        return response()->json(['lead' => $lead->fresh()]);
    }

    public function removeStakeholder(Lead $lead, int $index)
    {
        $list = $lead->stakeholders ?: [];
        if (isset($list[$index])) {
            array_splice($list, $index, 1);
            $lead->forceFill(['stakeholders' => array_values($list)])->save();
        }
        return response()->json(['lead' => $lead->fresh()]);
    }

    /** R — multiple units of interest. */
    public function setInterestedUnits(Request $request, Lead $lead)
    {
        $data = $request->validate(['units' => 'present|array', 'units.*' => 'string']);
        $lead->forceFill(['interested_units' => array_values(array_unique($data['units']))])->save();
        return response()->json(['lead' => $lead->fresh()]);
    }

    /** R — switch to a competing/other project. */
    public function switchProject(Request $request, Lead $lead)
    {
        $data = $request->validate(['project_id' => 'required|exists:projects,id', 'reason' => 'nullable|string']);
        return response()->json(['lead' => $this->leads->switchProject($lead, (int) $data['project_id'], $data['reason'] ?? null)]);
    }
}
