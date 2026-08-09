<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DemandLetter extends Model
{
    protected $guarded = ['id'];
    protected $casts = [
        'meta' => 'array',
        'delivered_at' => 'datetime',
        'escalated_at' => 'datetime',
    ];

    public function booking()
    {
        return $this->belongsTo(Booking::class);
    }

    public function lead()
    {
        return $this->belongsTo(Lead::class);
    }

    public function milestone()
    {
        return $this->belongsTo(PaymentMilestone::class, 'payment_milestone_id');
    }
}
