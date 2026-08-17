<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class VisitEngagement extends Model
{
    protected $fillable = [
        'lead_id', 'site_visit_id', 'mode', 'appointment_at', 'baseline_status_code',
        'next_send_at', 'sends_done', 'total_sends', 'active', 'stopped_reason',
    ];

    protected $casts = [
        'appointment_at' => 'datetime',
        'next_send_at' => 'datetime',
        'active' => 'boolean',
    ];

    public function lead(): BelongsTo
    {
        return $this->belongsTo(Lead::class);
    }
}
