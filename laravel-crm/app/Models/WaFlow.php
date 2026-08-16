<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class WaFlow extends Model
{
    protected $table = 'wa_flows';
    protected $guarded = ['id'];
    protected $casts = [
        'keywords' => 'array',
        'graph' => 'array',
    ];
}
