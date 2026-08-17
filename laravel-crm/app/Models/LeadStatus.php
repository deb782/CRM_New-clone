<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class LeadStatus extends Model
{
    protected $fillable = [
        'stage_key', 'stage_name', 'code', 'display_name', 'color', 'wa_message', 'wa_enabled',
        'sort', 'is_terminal', 'disposition', 'allowed_next', 'gate_fields', 'sla_minutes',
        'pipeline_slug', 'lane_sla_minutes',
    ];

    protected $casts = [
        'allowed_next' => 'array',
        'gate_fields' => 'array',
        'is_terminal' => 'boolean',
        'wa_enabled' => 'boolean',
    ];
}
