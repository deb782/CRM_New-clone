<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Proposal extends Model
{
    protected $guarded = ['id'];
    protected $casts = ['snapshot' => 'array', 'payment_plan_snapshot' => 'array', 'consent_at' => 'datetime', 'sent_at' => 'datetime'];

    public function lead()
    {
        return $this->belongsTo(Lead::class);
    }

    public function costSheet()
    {
        return $this->belongsTo(CostSheet::class);
    }
}
