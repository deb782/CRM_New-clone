<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Task;
use Illuminate\Http\Request;

class TaskController extends Controller
{
    public function index(Request $request)
    {
        $q = Task::with(['lead', 'assignee']);
        if ($request->boolean('mine')) {
            $q->where('assigned_to', $request->user()->id);
        }
        if ($status = $request->query('status')) {
            $q->where('status', $status);
        }
        if ($request->boolean('overdue')) {
            $q->where('status', 'open')->where('due_at', '<', now());
        }
        return response()->json($q->orderBy('due_at')->paginate((int) $request->query('per_page', 50)));
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'lead_id' => 'nullable|exists:leads,id',
            'title' => 'required|string',
            'type' => 'nullable|string',
            'assigned_to' => 'nullable|exists:users,id',
            'due_at' => 'nullable|date',
            'priority' => 'nullable|in:low,normal,high',
            'description' => 'nullable|string',
        ]);
        $data['assigned_to'] = $data['assigned_to'] ?? $request->user()->id;
        return response()->json(['task' => Task::create($data)], 201);
    }

    public function complete(Task $task)
    {
        $task->update(['status' => 'done', 'completed_at' => now()]);
        return response()->json(['task' => $task]);
    }

    public function update(Request $request, Task $task)
    {
        $data = $request->validate([
            'title' => 'sometimes|string',
            'status' => 'sometimes|in:open,done,cancelled',
            'due_at' => 'nullable|date',
            'priority' => 'nullable|in:low,normal,high',
            'assigned_to' => 'nullable|exists:users,id',
        ]);
        $task->update($data);
        return response()->json(['task' => $task->fresh()]);
    }
}
