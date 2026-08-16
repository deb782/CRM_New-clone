<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class WaFlowTemplate extends Model
{
    protected $table = 'wa_flow_templates';
    protected $guarded = ['id'];
    protected $casts = [
        'graph' => 'array',
    ];
}
