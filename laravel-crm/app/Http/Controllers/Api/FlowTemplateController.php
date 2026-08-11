<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\FlowTemplate;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Team-shared Flow Builder templates ("Save current canvas as a starter pack").
 * A template stores a full Drawflow export so it can be dropped back onto the canvas.
 */
class FlowTemplateController extends Controller
{
    public function index(): JsonResponse
    {
        $templates = FlowTemplate::orderByDesc('created_at')->get()->map(fn ($t) => [
            'id'              => $t->id,
            'name'            => $t->name,
            'description'     => $t->description,
            'node_count'      => $t->node_count,
            'created_by_name' => $t->created_by_name,
            'graph'           => $t->graph,
        ]);
        return response()->json(['templates' => $templates]);
    }

    public function store(Request $req): JsonResponse
    {
        $data = $req->validate([
            'name'        => ['required', 'string', 'min:2', 'max:160'],
            'description' => ['nullable', 'string', 'max:400'],
            'graph'       => ['required', 'array'],
        ]);

        $nodes = data_get($data, 'graph.drawflow.Home.data');
        if (! is_array($nodes) || ! count($nodes)) {
            return response()->json(['message' => 'The flow has no nodes to save.'], 422);
        }

        $tpl = FlowTemplate::create([
            'name'            => $data['name'],
            'description'     => $data['description'] ?? null,
            'graph'           => $data['graph'],
            'node_count'      => count($nodes),
            'created_by'      => $req->user()->id,
            'created_by_name' => $req->user()->name,
        ]);

        return response()->json(['template' => [
            'id' => $tpl->id, 'name' => $tpl->name, 'description' => $tpl->description,
            'node_count' => $tpl->node_count, 'created_by_name' => $tpl->created_by_name, 'graph' => $tpl->graph,
        ]], 201);
    }

    public function destroy(FlowTemplate $flowTemplate): JsonResponse
    {
        $flowTemplate->delete();
        return response()->json(['ok' => true]);
    }
}
