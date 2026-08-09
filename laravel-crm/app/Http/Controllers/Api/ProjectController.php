<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Project;
use Illuminate\Http\Request;

class ProjectController extends Controller
{
    public function index()
    {
        return response()->json(['data' => Project::orderBy('name')->get()]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => 'required|string',
            'code' => 'required|string|unique:projects,code',
            'city' => 'nullable|string',
            'zone' => 'nullable|string',
            'address' => 'nullable|string',
            'unit_types' => 'nullable|array',
            'price_min' => 'nullable|integer',
            'price_max' => 'nullable|integer',
            'description' => 'nullable|string',
        ]);
        return response()->json(['project' => Project::create($data)], 201);
    }

    public function show(Project $project)
    {
        return response()->json(['project' => $project]);
    }

    public function update(Request $request, Project $project)
    {
        $project->update($request->only(['name', 'city', 'zone', 'address', 'unit_types', 'price_min', 'price_max', 'status', 'description']));
        return response()->json(['project' => $project->fresh()]);
    }
}
