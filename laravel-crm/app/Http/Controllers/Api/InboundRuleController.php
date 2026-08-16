<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AppSetting;
use App\Models\User;
use App\Models\WaInboundRule;
use App\Services\InboundRouter;
use Illuminate\Http\Request;

class InboundRuleController extends Controller
{
    public function index()
    {
        return response()->json([
            'settings' => InboundRouter::settings(),
            'rules' => WaInboundRule::orderBy('priority')->orderBy('id')->get(),
            'agents' => User::whereHas('role', fn ($q) => $q->where('department', 'sales'))->get(['id', 'name']),
        ]);
    }

    public function updateSettings(Request $r)
    {
        $data = $r->validate([
            'office_hours_enabled' => 'required|boolean',
            'hours' => 'required|array',
            'away_message' => 'nullable|string|max:1000',
            'auto_assign_mode' => 'required|in:off,round_robin,specific',
            'auto_assign_agents' => 'nullable|array',
            'auto_assign_agents.*' => 'integer',
        ]);
        $cur = InboundRouter::settings();
        AppSetting::set(InboundRouter::KEY, array_merge($cur, $data));

        return response()->json(['settings' => InboundRouter::settings()]);
    }

    public function store(Request $r)
    {
        return response()->json(['rule' => WaInboundRule::create($this->validated($r))], 201);
    }

    public function update(Request $r, WaInboundRule $rule)
    {
        $rule->update($this->validated($r));

        return response()->json(['rule' => $rule]);
    }

    public function destroy(WaInboundRule $rule)
    {
        $rule->delete();

        return response()->json(['deleted' => true]);
    }

    public function test(Request $r, InboundRouter $router)
    {
        $data = $r->validate(['text' => 'required|string', 'time' => 'nullable|string']);
        $dt = ! empty($data['time']) ? \Carbon\Carbon::parse($data['time']) : now();

        return response()->json($router->evaluate($data['text'], $dt, false));
    }

    private function validated(Request $r): array
    {
        return $r->validate([
            'name' => 'required|string|max:120',
            'keywords' => 'required|array|min:1',
            'keywords.*' => 'string|max:60',
            'match_type' => 'required|in:contains,exact',
            'action' => 'required|in:bot,assign,tag,reply',
            'flow_id' => 'nullable|integer',
            'assignee_id' => 'nullable|integer',
            'tag' => 'nullable|string|max:60',
            'reply_text' => 'nullable|string|max:1000',
            'priority' => 'nullable|integer',
            'enabled' => 'boolean',
        ]);
    }
}
