<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ScoringRule extends Model
{
    protected $fillable = ['category', 'factor', 'field', 'operator', 'value', 'points', 'active'];
    protected $casts = ['active' => 'boolean'];
}
