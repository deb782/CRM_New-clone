<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ChannelPartner extends Model
{
    protected $fillable = ['name', 'company', 'email', 'phone', 'commission_rate', 'active'];
    protected $casts = ['active' => 'boolean', 'commission_rate' => 'decimal:2'];
}
