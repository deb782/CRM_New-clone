<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SequenceEnrollment extends Model
{
    protected $guarded = ['id'];
    protected $casts = ['enrolled_at' => 'datetime', 'next_run_at' => 'datetime'];

    public function lead()
    {
        return $this->belongsTo(Lead::class);
    }

    public function sequence()
    {
        return $this->belongsTo(Sequence::class);
    }
}
