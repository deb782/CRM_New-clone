<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DocumentChecklistItem extends Model
{
    protected $guarded = ['id'];
    protected $casts = [
        'required' => 'boolean',
        'reminded' => 'boolean',
        'due_at' => 'datetime',
        'received_at' => 'datetime',
        'verified_at' => 'datetime',
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
