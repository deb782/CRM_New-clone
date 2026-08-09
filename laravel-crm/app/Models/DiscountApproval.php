<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DiscountApproval extends Model
{
    protected $guarded = ['id'];
    protected $casts = ['decided_at' => 'datetime'];

    public function costSheet()
    {
        return $this->belongsTo(CostSheet::class);
    }

    public function lead()
    {
        return $this->belongsTo(Lead::class);
    }

    public function requester()
    {
        return $this->belongsTo(User::class, 'requested_by');
    }
}
