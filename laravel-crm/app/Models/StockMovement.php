<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class StockMovement extends Model
{
    protected $guarded = ['id'];
    protected $casts = ['qty' => 'decimal:2', 'moved_on' => 'date'];

    public function project()
    {
        return $this->belongsTo(Project::class);
    }

    public function item()
    {
        return $this->belongsTo(StockItem::class, 'stock_item_id');
    }

    public function expense()
    {
        return $this->belongsTo(Expense::class);
    }
}
