<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Lead;
use App\Models\User;
use App\Models\WaCampaign;
use App\Models\WhatsappTemplate;
use App\Services\WaCampaignService;
use Illuminate\Http\Request;

class WaCampaignController extends Controller
{
    public function __construct(private WaCampaignService $svc) {}

    public function index()
    {
        return response()->json([
            'campaigns' => WaCampaign::orderByDesc('id')->get()->map(fn ($c) => array_merge($c->toArray(), ['stats' => $c->stats ?: ['total' => 0]])),
            'templates' => WhatsappTemplate::where('status', 'APPROVED')->get(['id', 'name', 'language', 'body', 'category']),
            'filters' => [
                'temperature' => ['hot', 'warm', 'cold'],
                'status' => Lead::select('status')->distinct()->pluck('status'),
                'source' => Lead::select('source')->whereNotNull('source')->distinct()->pluck('source'),
                'owners' => User::whereHas('role', fn ($q) => $q->where('department', 'sales'))->get(['id', 'name']),
            ],
        ]);
    }

    public function show(WaCampaign $campaign)
    {
        $campaign->stats = $this->svc->computeStats($campaign);
        $campaign->save();

        return response()->json([
            'campaign' => $campaign,
            'recipients' => $campaign->recipients()->orderByRaw("FIELD(status,'replied','read','delivered','sent','failed','queued')")->limit(100)->get(),
        ]);
    }

    public function preview(Request $r)
    {
        return response()->json(['count' => $this->svc->audienceCount($r->input('audience', []) ?: [])]);
    }

    public function store(Request $r)
    {
        $data = $this->validated($r);
        $data['created_by'] = $r->user()->id;
        $data['status'] = ! empty($data['scheduled_at']) ? 'scheduled' : 'draft';
        $c = WaCampaign::create($data);

        return response()->json(['campaign' => $c], 201);
    }

    public function update(Request $r, WaCampaign $campaign)
    {
        abort_if(in_array($campaign->status, ['sending', 'sent']), 422, 'A sent campaign cannot be edited.');
        $campaign->update($this->validated($r));

        return response()->json(['campaign' => $campaign]);
    }

    public function destroy(WaCampaign $campaign)
    {
        $campaign->recipients()->delete();
        $campaign->delete();

        return response()->json(['deleted' => true]);
    }

    public function launch(WaCampaign $campaign)
    {
        abort_if($campaign->status === 'sent', 422, 'Campaign already sent.');
        abort_if(! $campaign->template_name, 422, 'Pick an approved template first.');
        $this->svc->launch($campaign);

        return response()->json(['campaign' => $campaign, 'message' => $campaign->simulated ? 'Sent in sandbox (simulated analytics). Connect WhatsApp to send for real.' : 'Campaign sent.']);
    }

    private function validated(Request $r): array
    {
        $data = $r->validate([
            'name' => 'required|string|max:120',
            'template_id' => 'nullable|integer',
            'audience' => 'nullable|array',
            'variables' => 'nullable|array',
            'scheduled_at' => 'nullable|date',
        ]);
        if (! empty($data['template_id'])) {
            $data['template_name'] = optional(WhatsappTemplate::find($data['template_id']))->name;
        }

        return $data;
    }
}
