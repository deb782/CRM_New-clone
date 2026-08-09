<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class WorkflowRun extends Model
{
    protected $guarded = ['id'];
    protected $casts = ['log' => 'array', 'resume_at' => 'datetime', 'completed_at' => 'datetime'];

    public function lead()
    {
        return $this->belongsTo(Lead::class);
    }

    public function workflow()
    {
        return $this->belongsTo(Workflow::class);
    }
}
