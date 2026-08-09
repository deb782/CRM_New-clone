<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Project extends Model
{
    protected $fillable = ['name', 'code', 'city', 'zone', 'address', 'unit_types', 'price_min', 'price_max', 'status', 'description'];
    protected $casts = ['unit_types' => 'array'];

    public function leads()
    {
        return $this->hasMany(Lead::class);
    }

    public function phases()
    {
        return $this->hasMany(Phase::class)->orderBy('sort_order');
    }

    public function plots()
    {
        return $this->hasMany(Plot::class);
    }
}
