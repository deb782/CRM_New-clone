<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Plot extends Model
{
    protected $guarded = ['id'];
    protected $casts = ['meta' => 'array', 'hold_expires_at' => 'datetime'];

    public function project()
    {
        return $this->belongsTo(Project::class);
    }

    public function phase()
    {
        return $this->belongsTo(Phase::class);
    }

    public function heldBy()
    {
        return $this->belongsTo(Lead::class, 'held_by_lead_id');
    }
}
