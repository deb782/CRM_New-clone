<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PaymentMilestone extends Model
{
    protected $guarded = ['id'];
    protected $casts = [
        'reminders_sent' => 'array',
        'due_at' => 'datetime',
        'paid_at' => 'datetime',
    ];

    public function booking()
    {
        return $this->belongsTo(Booking::class);
    }

    public function lead()
    {
        return $this->belongsTo(Lead::class);
    }

    public function outstanding(): int
    {
        return max(0, (int) $this->amount - (int) $this->paid_amount);
    }
}
