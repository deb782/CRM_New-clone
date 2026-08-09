<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Task;
use Illuminate\Http\Request;

class TaskController extends Controller
{
    /** SLA heat-board: open tasks colour-coded by time-to-breach. */
    public function slaBoard(Request $request)
    {
        $slaVerify = (int) config('integrations.sla.verify_hours', 2);
        $tasks = Task::with(['lead:id,name', 'assignee:id,name'])
            ->where('status', 'open')->get();

        $rows = $tasks->map(function ($t) use ($slaVerify) {
            $deadline = $t->due_at
                ?: ($t->type === 'verify' ? $t->created_at->copy()->addHours($slaVerify) : $t->created_at->copy()->addHours(24));
            $mins = (int) round(now()->diffInMinutes($deadline, false));
            $bucket = $mins < 0 ? 'breached' : ($mins < 60 ? 'red' : ($mins < 240 ? 'amber' : 'green'));
            return [
                'id' => $t->id, 'title' => $t->title, 'type' => $t->type,
                'priority' => $t->priority, 'escalated' => (bool) $t->escalated,
                'lead' => $t->lead ? ['id' => $t->lead->id, 'name' => $t->lead->name] : null,
                'assignee' => $t->assignee ? ['id' => $t->assignee->id, 'name' => $t->assignee->name] : null,
                'deadline' => $deadline, 'minutes_to_breach' => $mins, 'bucket' => $bucket,
            ];
        })->sortBy('minutes_to_breach')->values();

        $counts = ['breached' => 0, 'red' => 0, 'amber' => 0, 'green' => 0];
        foreach ($rows as $r) {
            $counts[$r['bucket']]++;
        }
        $users = \App\Models\User::where('is_active', true)->get(['id', 'name']);
        return response()->json(['tasks' => $rows, 'counts' => $counts, 'users' => $users]);
    }

    public function index(Request $request)
    {
        $q = Task::with(['lead', 'assignee']);
        if ($request->boolean('mine')) {
            $q->where('assigned_to', $request->user()->id);
        }
        if ($status = $request->query('status')) {
            $q->where('status', $status);
        }
        if ($leadId = $request->query('lead_id')) {
            $q->where('lead_id', $leadId);
        }
        if ($type = $request->query('type')) {
            $q->where('type', $type);
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
