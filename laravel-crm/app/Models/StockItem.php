<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class StockItem extends Model
{
    protected $guarded = ['id'];
    protected $casts = ['opening_qty' => 'decimal:2'];

    public function project()
    {
        return $this->belongsTo(Project::class);
    }

    public function movements()
    {
        return $this->hasMany(StockMovement::class);
    }
}
