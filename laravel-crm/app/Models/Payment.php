<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Payment extends Model
{
    protected $guarded = ['id'];
    protected $casts = [
        'meta' => 'array',
        'receipt_issued_at' => 'datetime',
        'received_at' => 'datetime',
        'verified_at' => 'datetime',
        'reconciled_at' => 'datetime',
    ];

    public function booking()
    {
        return $this->belongsTo(Booking::class);
    }

    public function lead()
    {
        return $this->belongsTo(Lead::class);
    }

    public function verifiedBy()
    {
        return $this->belongsTo(User::class, 'verified_by');
    }
}
