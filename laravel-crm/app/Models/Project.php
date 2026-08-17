<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Project extends Model
{
    protected $fillable = ['name', 'code', 'project_type', 'city', 'zone', 'address', 'unit_types', 'price_min', 'price_max', 'status', 'description', 'meta'];
    protected $casts = ['unit_types' => 'array', 'meta' => 'array'];

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

    public function expenses()
    {
        return $this->hasMany(Expense::class);
    }

    public function stockItems()
    {
        return $this->hasMany(StockItem::class);
    }

    public function assignedUsers()
    {
        return $this->belongsToMany(User::class);
    }
}
