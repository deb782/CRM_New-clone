<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Expense;
use App\Services\ExpenseService;
use App\Services\ObjectStorage;
use App\Support\ProjectScope;
use Illuminate\Http\Request;

class ExpenseController extends Controller
{
    public function __construct(private ExpenseService $service) {}

    public function index(Request $request)
    {
        $q = Expense::with(['project', 'phase', 'raisedBy', 'accountsApprover', 'managementApprover']);
        ProjectScope::apply($q, $request->user());

        if ($project = $request->query('project_id')) {
            $q->where('project_id', $project);
        }
        if ($status = $request->query('status')) {
            $q->where('status', $status);
        }
        if ($mine = $request->query('mine')) {
            $q->where('raised_by', $request->user()->id);
        }
        $q->orderByDesc('created_at');
        return response()->json($q->paginate((int) $request->query('per_page', 25)));
    }

    public function summary(Request $request)
    {
        $q = Expense::query();
        ProjectScope::apply($q, $request->user());
        $base = clone $q;
        return response()->json([
            'counts' => [
                'pending_accounts' => (clone $base)->where('status', 'pending_accounts')->count(),
                'pending_management' => (clone $base)->where('status', 'pending_management')->count(),
                'approved' => (clone $base)->where('status', 'approved')->count(),
                'rejected' => (clone $base)->where('status', 'rejected')->count(),
            ],
            'approved_amount' => (clone $base)->where('status', 'approved')->sum('amount'),
            'pending_amount' => (clone $base)->whereIn('status', ['pending_accounts', 'pending_management'])->sum('amount'),
        ]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'project_id' => 'required|exists:projects,id',
            'phase_id' => 'nullable|exists:phases,id',
            'title' => 'required|string|max:200',
            'category' => 'nullable|in:material,labour,equipment,transport,utilities,other',
            'vendor' => 'nullable|string|max:200',
            'amount' => 'required|integer|min:1',
            'incurred_on' => 'nullable|date',
            'description' => 'nullable|string',
        ]);
        if (! ProjectScope::allows($request->user(), (int) $data['project_id'])) {
            return response()->json(['message' => 'You are not assigned to this project.'], 403);
        }
        $expense = $this->service->raise($data, $request->user());
        return response()->json(['expense' => $expense], 201);
    }

    public function show(Request $request, Expense $expense)
    {
        if (! ProjectScope::allows($request->user(), $expense->project_id)) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }
        return response()->json(['expense' => $expense->load(['project', 'phase', 'raisedBy', 'accountsApprover', 'managementApprover'])]);
    }

    public function approveAccounts(Request $request, Expense $expense)
    {
        return response()->json(['expense' => $this->service->approveAccounts($expense, $request->user())]);
    }

    public function approveManagement(Request $request, Expense $expense)
    {
        return response()->json(['expense' => $this->service->approveManagement($expense, $request->user())]);
    }

    public function reject(Request $request, Expense $expense)
    {
        $data = $request->validate(['reason' => 'required|string|max:300']);
        return response()->json(['expense' => $this->service->reject($expense, $request->user(), $data['reason'])]);
    }

    public function uploadReceipt(Request $request, Expense $expense, ObjectStorage $storage)
    {
        if (! ProjectScope::allows($request->user(), $expense->project_id)) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }
        $request->validate(['file' => 'required|file|max:10240']);
        $file = $request->file('file');
        $path = 'expenses/'.$expense->id.'-'.time().'.'.$file->getClientOriginalExtension();
        $stored = $storage->put($path, file_get_contents($file->getRealPath()), $file->getMimeType() ?: 'application/octet-stream');
        $expense->update(['receipt_path' => $stored]);
        return response()->json(['expense' => $expense->fresh(), 'receipt_path' => $stored]);
    }
}
