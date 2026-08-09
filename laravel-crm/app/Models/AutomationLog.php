<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AutomationLog extends Model
{
    protected $guarded = ['id'];
    protected $casts = ['executed_at' => 'datetime'];

    public function rule()
    {
        return $this->belongsTo(AutomationRule::class, 'rule_id');
    }
}
