<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class LeadImport extends Model
{
    protected $guarded = ['id'];
    protected $casts = ['error_log' => 'array'];
}
