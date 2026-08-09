<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Phase;
use App\Models\Plot;
use App\Models\Project;
use Illuminate\Http\Request;

class InventoryController extends Controller
{
    /** Full Projects -> Phases -> Plots tree with availability counts. */
    public function tree(Request $request)
    {
        $projects = Project::with(['phases.plots' => fn ($q) => $q->orderBy('number'), 'plots'])->get()->map(function ($p) {
            $plots = $p->plots;
            return [
                'id' => $p->id, 'name' => $p->name, 'code' => $p->code, 'city' => $p->city, 'zone' => $p->zone,
                'counts' => [
                    'total' => $plots->count(),
                    'available' => $plots->where('status', 'available')->count(),
                    'held' => $plots->where('status', 'held')->count(),
                    'booked' => $plots->where('status', 'booked')->count(),
                    'sold' => $plots->where('status', 'sold')->count(),
                ],
                'phases' => $p->phases->map(fn ($ph) => [
                    'id' => $ph->id, 'name' => $ph->name, 'code' => $ph->code, 'status' => $ph->status,
                    'possession_target' => $ph->possession_target,
                    'plots' => $ph->plots,
                ]),
                'unassigned_plots' => $plots->whereNull('phase_id')->values(),
            ];
        });
        return response()->json(['projects' => $projects]);
    }

    public function availablePlots(Request $request)
    {
        $q = Plot::with('phase')->where('status', 'available');
        if ($project = $request->query('project_id')) {
            $q->where('project_id', $project);
        }
        return response()->json(['data' => $q->orderBy('number')->get()]);
    }

    public function storePhase(Request $request)
    {
        $data = $request->validate([
            'project_id' => 'required|exists:projects,id',
            'name' => 'required|string',
            'code' => 'nullable|string',
            'sort_order' => 'nullable|integer',
            'possession_target' => 'nullable|string',
        ]);
        return response()->json(['phase' => Phase::create($data)], 201);
    }

    public function updatePhase(Request $request, Phase $phase)
    {
        $phase->update($request->only(['name', 'code', 'sort_order', 'status', 'possession_target']));
        return response()->json(['phase' => $phase->fresh()]);
    }

    public function storePlot(Request $request)
    {
        $data = $request->validate([
            'project_id' => 'required|exists:projects,id',
            'phase_id' => 'nullable|exists:phases,id',
            'number' => 'required|string',
            'unit_type' => 'nullable|string',
            'carpet_area' => 'nullable|numeric',
            'built_up_area' => 'nullable|numeric',
            'floor' => 'nullable|string',
            'facing' => 'nullable|string',
            'price' => 'nullable|integer',
            'status' => 'nullable|in:available,held,booked,sold',
        ]);
        return response()->json(['plot' => Plot::create($data)], 201);
    }

    public function updatePlot(Request $request, Plot $plot)
    {
        $data = $request->validate([
            'number' => 'sometimes|string',
            'unit_type' => 'nullable|string',
            'carpet_area' => 'nullable|numeric',
            'built_up_area' => 'nullable|numeric',
            'floor' => 'nullable|string',
            'facing' => 'nullable|string',
            'price' => 'nullable|integer',
            'status' => 'sometimes|in:available,held,booked,sold',
            'phase_id' => 'nullable|exists:phases,id',
        ]);
        if (($data['status'] ?? null) === 'available') {
            $data['held_by_lead_id'] = null;
            $data['hold_expires_at'] = null;
        }
        $plot->update($data);
        return response()->json(['plot' => $plot->fresh('heldBy')]);
    }

    public function destroyPlot(Plot $plot)
    {
        $plot->delete();
        return response()->json(['message' => 'deleted']);
    }
}
