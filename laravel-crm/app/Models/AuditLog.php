<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AuditLog extends Model
{
    protected $fillable = ['auditable_type', 'auditable_id', 'user_id', 'action', 'field', 'old_value', 'new_value', 'reason'];

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
