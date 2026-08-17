<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CpPasswordReset extends Model
{
    protected $guarded = ['id'];
    protected $casts = ['expires_at' => 'datetime', 'used_at' => 'datetime'];
}
