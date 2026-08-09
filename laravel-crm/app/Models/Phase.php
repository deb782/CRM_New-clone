<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Phase extends Model
{
    protected $fillable = ['project_id', 'name', 'code', 'sort_order', 'status', 'possession_target'];

    public function project()
    {
        return $this->belongsTo(Project::class);
    }

    public function plots()
    {
        return $this->hasMany(Plot::class)->orderBy('number');
    }
}
