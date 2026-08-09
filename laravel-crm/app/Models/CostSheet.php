<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CostSheet extends Model
{
    protected $guarded = ['id'];
    protected $casts = ['meta' => 'array'];

    public function lead()
    {
        return $this->belongsTo(Lead::class);
    }

    public function plot()
    {
        return $this->belongsTo(Plot::class);
    }

    public function project()
    {
        return $this->belongsTo(Project::class);
    }

    public function paymentPlan()
    {
        return $this->belongsTo(PaymentPlan::class);
    }

    public function approvals()
    {
        return $this->hasMany(DiscountApproval::class)->latest();
    }
}
