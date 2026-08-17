<?php

namespace App\Services;

use App\Models\Expense;
use App\Models\User;
use Illuminate\Support\Facades\Auth;

/**
 * Two-stage expense approval:
 * Site Manager raises -> Accounts approves (stage 1) -> Management approves (final) -> approved.
 * Any rejection needs a reason. No threshold: every expense goes through both stages.
 */
class ExpenseService
{
    public function __construct(private AuditService $audit) {}

    public function raise(array $data, User $user): Expense
    {
        $expense = Expense::create($data + [
            'raised_by' => $user->id,
            'status' => 'pending_accounts',
        ]);
        $this->audit->record($expense, 'created', 'status', null, 'pending_accounts', 'Expense raised');
        return $expense->fresh(['project', 'raisedBy']);
    }

    public function approveAccounts(Expense $expense, User $user): Expense
    {
        if ($expense->status !== 'pending_accounts') {
            abort(422, 'Expense is not awaiting accounts approval.');
        }
        $expense->update([
            'status' => 'pending_management',
            'accounts_approved_by' => $user->id,
            'accounts_approved_at' => now(),
        ]);
        $this->audit->record($expense, 'status_changed', 'status', 'pending_accounts', 'pending_management', 'Accounts approved');
        return $expense->fresh();
    }

    public function approveManagement(Expense $expense, User $user): Expense
    {
        if ($expense->status !== 'pending_management') {
            abort(422, 'Expense is not awaiting management approval.');
        }
        $expense->update([
            'status' => 'approved',
            'management_approved_by' => $user->id,
            'management_approved_at' => now(),
        ]);
        $this->audit->record($expense, 'status_changed', 'status', 'pending_management', 'approved', 'Management approved');
        return $expense->fresh();
    }

    public function reject(Expense $expense, User $user, string $reason): Expense
    {
        if (in_array($expense->status, ['approved', 'rejected'], true)) {
            abort(422, 'Expense is already finalised.');
        }
        $from = $expense->status;
        $expense->update([
            'status' => 'rejected',
            'rejected_by' => $user->id,
            'rejected_at' => now(),
            'rejection_reason' => $reason,
        ]);
        $this->audit->record($expense, 'status_changed', 'status', $from, 'rejected', $reason);
        return $expense->fresh();
    }
}
