<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class WaInboundRule extends Model
{
    protected $table = 'wa_inbound_rules';
    protected $guarded = ['id'];
    protected $casts = [
        'keywords' => 'array',
        'enabled' => 'boolean',
    ];
}
