<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PaymentPlan extends Model
{
    protected $fillable = ['name', 'code', 'description', 'milestones', 'active'];
    protected $casts = ['milestones' => 'array', 'active' => 'boolean'];
}
