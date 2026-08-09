<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Workflow;
use Illuminate\Http\Request;

class WorkflowController extends Controller
{
    public function index()
    {
        return response()->json(['workflows' => Workflow::latest()->get(['id', 'name', 'description', 'status', 'tally', 'updated_at'])]);
    }

    public function show(Workflow $workflow)
    {
        return response()->json(['workflow' => $workflow]);
    }

    public function store(Request $request)
    {
        $data = $this->validated($request);
        $data['created_by'] = $request->user()->id;
        $data['tally'] = $this->tally($data['graph'] ?? null);

        return response()->json(['workflow' => Workflow::create($data)], 201);
    }

    public function update(Request $request, Workflow $workflow)
    {
        $data = $this->validated($request);
        $data['tally'] = $this->tally($data['graph'] ?? $workflow->graph);
        $workflow->update($data);

        return response()->json(['workflow' => $workflow->fresh()]);
    }

    public function activate(Workflow $workflow)
    {
        $workflow->update(['status' => 'active']);

        return response()->json(['workflow' => $workflow->fresh()]);
    }

    public function destroy(Workflow $workflow)
    {
        $workflow->delete();

        return response()->json(['ok' => true]);
    }

    private function validated(Request $request): array
    {
        return $request->validate([
            'name' => 'required|string|max:150',
            'description' => 'nullable|string',
            'status' => 'nullable|in:draft,active',
            'graph' => 'nullable|array',
        ]);
    }

    /** Count nodes that require templates/tasks so the onboarding checklist can prompt the process admin. */
    private function tally(?array $graph): array
    {
        $counts = ['whatsapp' => 0, 'email' => 0, 'task' => 0, 'nodes' => 0, 'triggers' => 0, 'conditions' => 0, 'fallbacks' => 0];
        $nodes = data_get($graph, 'drawflow.Home.data', []);
        foreach ((array) $nodes as $node) {
            $type = data_get($node, 'data.node_type') ?? data_get($node, 'name');
            $counts['nodes']++;
            switch ($type) {
                case 'send_whatsapp': $counts['whatsapp']++; break;
                case 'send_email': $counts['email']++; break;
                case 'task': case 'activity': $counts['task']++; break;
                case 'trigger': $counts['triggers']++; break;
                case 'condition': $counts['conditions']++; break;
                case 'fallback': $counts['fallbacks']++; break;
            }
        }

        return $counts;
    }
}
