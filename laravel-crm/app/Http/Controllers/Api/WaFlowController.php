<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\WaFlow;
use App\Services\WaFlowEngine;
use Illuminate\Http\Request;

class WaFlowController extends Controller
{
    public function index()
    {
        $flows = WaFlow::orderByDesc('id')->get()->map(function (WaFlow $f) {
            $arr = $f->toArray();
            $arr['node_count'] = count($f->graph['nodes'] ?? []);

            return $arr;
        });

        return response()->json(['flows' => $flows]);
    }

    public function show(WaFlow $flow)
    {
        return response()->json(['flow' => $flow]);
    }

    public function store(Request $r)
    {
        $data = $this->validated($r);
        $data['created_by'] = $r->user()->id;
        $data['status'] = 'draft';
        if (empty($data['graph'])) {
            $data['graph'] = $this->starterGraph();
        }
        $flow = WaFlow::create($data);

        return response()->json(['flow' => $flow], 201);
    }

    public function update(Request $r, WaFlow $flow)
    {
        $flow->update($this->validated($r));

        return response()->json(['flow' => $flow]);
    }

    public function destroy(WaFlow $flow)
    {
        $flow->delete();

        return response()->json(['deleted' => true]);
    }

    public function activate(Request $r, WaFlow $flow)
    {
        $active = $r->boolean('active', true);
        if ($active && $flow->trigger_type === 'default') {
            WaFlow::where('id', '!=', $flow->id)->where('trigger_type', 'default')->update(['status' => 'draft']);
        }
        $flow->update(['status' => $active ? 'active' : 'draft']);

        return response()->json(['flow' => $flow]);
    }

    /** Run one step of the flow for the in-app test simulator. */
    public function test(Request $r, WaFlow $flow, WaFlowEngine $engine)
    {
        $state = $r->input('state');
        $input = (string) $r->input('input', '');

        if (! is_array($state)) {
            return response()->json($engine->start($flow));
        }

        return response()->json($engine->step($flow, $state, $input));
    }

    /** Bot analytics: sessions, completion, handoffs, per-node funnel + per-button tap counts + drop-off. */
    public function analytics(WaFlow $flow)
    {
        $events = \App\Models\WaFlowEvent::where('flow_id', $flow->id)->get();
        $sessions = $events->where('event', 'enter')->count();
        $completed = $events->where('event', 'complete')->count();
        $handoffs = $events->where('event', 'handoff')->count();
        $reach = $events->where('event', 'reach')->groupBy('node_key')->map->count();
        $choose = $events->where('event', 'choose')->groupBy(fn ($e) => $e->node_key.'|'.$e->option_id)->map->count();

        $nodes = $flow->graph['nodes'] ?? [];
        $funnel = [];
        foreach ($nodes as $key => $node) {
            $reached = (int) ($reach[$key] ?? 0);
            $item = [
                'key' => $key,
                'title' => $node['title'] ?? $key,
                'type' => $node['type'] ?? 'message',
                'reached' => $reached,
                'options' => [],
            ];
            if (in_array($node['type'] ?? '', ['buttons', 'list'])) {
                $opts = ($node['type'] === 'buttons') ? ($node['config']['buttons'] ?? []) : ($node['config']['rows'] ?? []);
                $picked = 0;
                foreach ($opts as $o) {
                    $taps = (int) ($choose[$key.'|'.($o['id'] ?? '')] ?? 0);
                    $picked += $taps;
                    $item['options'][] = ['id' => $o['id'] ?? '', 'label' => $o['label'] ?? '', 'taps' => $taps];
                }
                $item['dropped'] = max(0, $reached - $picked);
            }
            $funnel[] = $item;
        }
        usort($funnel, fn ($a, $b) => $b['reached'] <=> $a['reached']);

        return response()->json([
            'sessions' => $sessions,
            'completed' => $completed,
            'handoffs' => $handoffs,
            'completion_rate' => $sessions ? round($completed * 100 / $sessions) : 0,
            'funnel' => $funnel,
        ]);
    }

    /** Save the current bot's graph as a reusable, team-shared template. */
    public function saveTemplate(Request $r, WaFlow $flow)
    {
        $data = $r->validate([
            'name' => 'required|string|max:120',
            'description' => 'nullable|string|max:255',
        ]);
        $tpl = \App\Models\WaFlowTemplate::create([
            'name' => $data['name'],
            'description' => $data['description'] ?? $flow->description,
            'graph' => $flow->graph,
            'created_by' => $r->user()->id,
        ]);

        return response()->json(['template' => $tpl], 201);
    }

    public function templates()
    {
        return response()->json(['templates' => \App\Models\WaFlowTemplate::orderByDesc('id')->get()]);
    }

    /** Create a new draft bot from a saved template (reuse across projects). */
    public function useTemplate(Request $r, \App\Models\WaFlowTemplate $template)
    {
        $flow = WaFlow::create([
            'name' => $template->name.' (copy)',
            'description' => $template->description,
            'trigger_type' => 'default',
            'keywords' => [],
            'status' => 'draft',
            'graph' => $template->graph,
            'created_by' => $r->user()->id,
        ]);

        return response()->json(['flow' => $flow], 201);
    }

    public function deleteTemplate(\App\Models\WaFlowTemplate $template)
    {
        $template->delete();

        return response()->json(['deleted' => true]);
    }

    private function validated(Request $r): array
    {
        return $r->validate([
            'name' => 'required|string|max:120',
            'description' => 'nullable|string|max:255',
            'trigger_type' => 'required|in:keyword,default',
            'keywords' => 'nullable|array',
            'keywords.*' => 'string|max:60',
            'graph' => 'nullable|array',
        ]);
    }

    private function starterGraph(): array
    {
        return [
            'entry' => 'start',
            'nodes' => [
                'start' => [
                    'key' => 'start', 'type' => 'message', 'title' => 'Welcome',
                    'config' => ['text' => 'Hi! 👋 Welcome to Agrocorp Realty. How can we help you today?', 'next' => 'menu'],
                    'x' => 60, 'y' => 60,
                ],
                'menu' => [
                    'key' => 'menu', 'type' => 'buttons', 'title' => 'Main menu',
                    'config' => ['text' => 'Please pick an option:', 'buttons' => [
                        ['id' => 'b1', 'label' => 'View projects', 'next' => 'capture_city'],
                        ['id' => 'b2', 'label' => 'Book a site visit', 'next' => 'agent'],
                        ['id' => 'b3', 'label' => 'Talk to sales', 'next' => 'agent'],
                    ]],
                    'x' => 60, 'y' => 240,
                ],
                'capture_city' => [
                    'key' => 'capture_city', 'type' => 'capture', 'title' => 'Ask location',
                    'config' => ['text' => 'Which location are you interested in?', 'field' => 'preferred_location', 'next' => 'agent'],
                    'x' => 420, 'y' => 240,
                ],
                'agent' => [
                    'key' => 'agent', 'type' => 'handoff', 'title' => 'Hand off',
                    'config' => ['note' => 'Great! Connecting you to a sales advisor now. 🙌'],
                    'x' => 420, 'y' => 440,
                ],
            ],
        ];
    }
}
