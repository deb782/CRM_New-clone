<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Agreement extends Model
{
    protected $guarded = ['id'];
    protected $casts = [
        'meta' => 'array',
        'sent_for_sign_at' => 'datetime',
        'review_until' => 'datetime',
        'signed_at' => 'datetime',
        'registered_at' => 'datetime',
    ];

    public function booking()
    {
        return $this->belongsTo(Booking::class);
    }

    public function lead()
    {
        return $this->belongsTo(Lead::class);
    }
}
