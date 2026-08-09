<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CommunicationLog extends Model
{
    protected $guarded = ['id'];
    protected $casts = ['meta' => 'array'];
}
