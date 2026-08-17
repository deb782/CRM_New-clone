<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Expense;
use App\Models\StockItem;
use App\Models\StockMovement;
use App\Support\ProjectScope;
use Illuminate\Http\Request;

class StockController extends Controller
{
    /** Per-project material ledger with computed opening/inward/outward/closing. */
    public function index(Request $request)
    {
        $q = StockItem::with('project');
        ProjectScope::apply($q, $request->user());
        if ($project = $request->query('project_id')) {
            $q->where('project_id', $project);
        }
        $items = $q->orderBy('name')->get()->map(function (StockItem $item) {
            $inward = $item->movements()->where('direction', 'inward')->sum('qty');
            $outward = $item->movements()->where('direction', 'outward')->sum('qty');
            return [
                'id' => $item->id,
                'project_id' => $item->project_id,
                'project' => $item->project?->name,
                'name' => $item->name,
                'unit' => $item->unit,
                'opening_qty' => (float) $item->opening_qty,
                'inward' => (float) $inward,
                'outward' => (float) $outward,
                'closing_qty' => (float) $item->opening_qty + (float) $inward - (float) $outward,
            ];
        });
        return response()->json(['data' => $items]);
    }

    public function storeItem(Request $request)
    {
        $data = $request->validate([
            'project_id' => 'required|exists:projects,id',
            'name' => 'required|string|max:120',
            'unit' => 'nullable|string|max:20',
            'opening_qty' => 'nullable|numeric|min:0',
        ]);
        if (! ProjectScope::allows($request->user(), (int) $data['project_id'])) {
            return response()->json(['message' => 'You are not assigned to this project.'], 403);
        }
        $item = StockItem::create($data + ['unit' => $data['unit'] ?? 'nos', 'opening_qty' => $data['opening_qty'] ?? 0]);
        return response()->json(['item' => $item], 201);
    }

    public function movements(Request $request, StockItem $item)
    {
        if (! ProjectScope::allows($request->user(), $item->project_id)) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }
        return response()->json(['data' => $item->movements()->with('expense:id,title,amount')->orderByDesc('created_at')->get()]);
    }

    public function storeMovement(Request $request, StockItem $item)
    {
        if (! ProjectScope::allows($request->user(), $item->project_id)) {
            return response()->json(['message' => 'You are not assigned to this project.'], 403);
        }
        $data = $request->validate([
            'direction' => 'required|in:inward,outward',
            'qty' => 'required|numeric|min:0.01',
            'expense_id' => 'nullable|exists:expenses,id',
            'note' => 'nullable|string|max:200',
            'moved_on' => 'nullable|date',
        ]);

        // Inward movements must be backed by an approved expense.
        if ($data['direction'] === 'inward') {
            if (empty($data['expense_id'])) {
                return response()->json(['message' => 'Inward stock must reference an approved expense.'], 422);
            }
            $expense = Expense::find($data['expense_id']);
            if (! $expense || $expense->status !== 'approved' || $expense->project_id !== $item->project_id) {
                return response()->json(['message' => 'Referenced expense must be approved and belong to this project.'], 422);
            }
        } else {
            $data['expense_id'] = null;
        }

        $movement = StockMovement::create($data + [
            'project_id' => $item->project_id,
            'stock_item_id' => $item->id,
            'created_by' => $request->user()->id,
        ]);
        return response()->json(['movement' => $movement->load('expense:id,title,amount')], 201);
    }

    /** Approved expenses available to back an inward movement (not yet linked). */
    public function approvedExpenses(Request $request)
    {
        $q = Expense::where('status', 'approved');
        ProjectScope::apply($q, $request->user());
        if ($project = $request->query('project_id')) {
            $q->where('project_id', $project);
        }
        return response()->json(['data' => $q->orderByDesc('created_at')->get(['id', 'title', 'amount', 'project_id', 'vendor'])]);
    }
}
