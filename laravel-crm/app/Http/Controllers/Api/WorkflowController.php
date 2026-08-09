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

    /** Read-only journey of a lead along the active flow (train-tracker for reps). */
    public function leadJourney(\App\Models\Lead $lead)
    {
        $wf = Workflow::where('status', 'active')->latest('id')->first() ?: Workflow::latest('id')->first();
        if (! $wf) {
            return response()->json(['workflow' => null]);
        }
        $run = \App\Models\WorkflowRun::where('workflow_id', $wf->id)->where('lead_id', $lead->id)->latest('id')->first();
        $done = [];
        if ($run) {
            foreach (($run->log ?? []) as $s) {
                if (! empty($s['node'])) { $done[(string) $s['node']] = true; }
            }
        }
        $nodeCount = count((array) data_get($wf->graph, 'drawflow.Home.data', []));

        return response()->json([
            'workflow' => ['id' => $wf->id, 'name' => $wf->name, 'status' => $wf->status, 'graph' => $wf->graph],
            'lead' => ['id' => $lead->id, 'name' => $lead->name, 'status' => $lead->status, 'temperature' => $lead->temperature],
            'run' => $run ? [
                'status' => $run->status,
                'current_node' => $run->current_node,
                'done' => array_keys($done),
                'resume_at' => $run->resume_at,
                'updated_at' => $run->updated_at,
                'log' => $run->log,
            ] : null,
            'progress' => ['done' => count($done), 'total' => $nodeCount],
        ]);
    }

    public function activate(Workflow $workflow)
    {
        $workflow->update(['status' => 'active']);

        return response()->json(['workflow' => $workflow->fresh()]);
    }

    /** Run the flow against a lead so the process admin can see it work (demo/test). */
    public function simulate(Request $request, Workflow $workflow, \App\Services\FlowEngine $engine)
    {
        $leadId = $request->input('lead_id');
        $lead = $leadId ? \App\Models\Lead::find($leadId) : \App\Models\Lead::latest('id')->first();
        if (! $lead) {
            return response()->json(['message' => 'No lead available to simulate against.'], 422);
        }
        $run = $engine->simulate($workflow, $lead);

        return response()->json(['run' => $run, 'lead' => ['id' => $lead->id, 'name' => $lead->name]]);
    }

    /** Recent execution runs for this workflow. */
    public function runs(Workflow $workflow)
    {
        $runs = \App\Models\WorkflowRun::where('workflow_id', $workflow->id)
            ->with('lead:id,name')
            ->latest('id')->limit(30)->get();

        return response()->json(['runs' => $runs]);
    }

    /** Template checklist derived from the flow's comms nodes. */
    public function checklist(Workflow $workflow)
    {
        $nodes = (array) data_get($workflow->graph, 'drawflow.Home.data', []);
        $wa = [];
        $email = [];
        foreach ($nodes as $n) {
            $t = data_get($n, 'data.node_type');
            $tpl = trim((string) data_get($n, 'data.template'));
            if ($t === 'send_whatsapp' && $tpl) { $wa[$tpl] = true; }
            if ($t === 'send_email' && $tpl) { $email[$tpl] = true; }
        }
        $waExists = \App\Models\WhatsappTemplate::pluck('name')->map(fn ($s) => strtolower($s))->all();
        $emExists = \App\Models\EmailTemplate::pluck('name')->map(fn ($s) => strtolower($s))->all();

        $map = fn ($names, $existing) => array_values(array_map(fn ($name) => [
            'name' => $name, 'exists' => in_array(strtolower($name), $existing, true),
        ], array_keys($names)));

        return response()->json([
            'whatsapp' => $map($wa, $waExists),
            'email' => $map($email, $emExists),
        ]);
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
