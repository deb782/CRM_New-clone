<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AutomationRule extends Model
{
    protected $fillable = ['name', 'event', 'conditions', 'actions', 'delay_minutes', 'active'];
    protected $casts = ['conditions' => 'array', 'actions' => 'array', 'active' => 'boolean'];
}
