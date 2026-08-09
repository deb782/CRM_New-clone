<?php

namespace App\Services;

use App\Models\AuditLog;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Auth;

class AuditService
{
    public function record(Model $model, string $action, ?string $field = null, $old = null, $new = null, ?string $reason = null): void
    {
        AuditLog::create([
            'auditable_type' => $model::class,
            'auditable_id' => $model->getKey(),
            'user_id' => Auth::id(),
            'action' => $action,
            'field' => $field,
            'old_value' => is_scalar($old) || $old === null ? $old : json_encode($old),
            'new_value' => is_scalar($new) || $new === null ? $new : json_encode($new),
            'reason' => $reason,
        ]);
    }

    /** Log each changed field of a dirty model (T1.1). */
    public function recordChanges(Model $model, array $original, array $watch = [], ?string $reason = null): void
    {
        foreach ($model->getChanges() as $field => $new) {
            if ($field === 'updated_at') {
                continue;
            }
            if ($watch && ! in_array($field, $watch, true)) {
                continue;
            }
            $this->record($model, 'updated', $field, $original[$field] ?? null, $new, $reason);
        }
    }
}
