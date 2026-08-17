<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Expense extends Model
{
    protected $guarded = ['id'];
    protected $casts = [
        'meta' => 'array',
        'incurred_on' => 'date',
        'accounts_approved_at' => 'datetime',
        'management_approved_at' => 'datetime',
        'rejected_at' => 'datetime',
    ];

    public function project()
    {
        return $this->belongsTo(Project::class);
    }

    public function phase()
    {
        return $this->belongsTo(Phase::class);
    }

    public function raisedBy()
    {
        return $this->belongsTo(User::class, 'raised_by');
    }

    public function accountsApprover()
    {
        return $this->belongsTo(User::class, 'accounts_approved_by');
    }

    public function managementApprover()
    {
        return $this->belongsTo(User::class, 'management_approved_by');
    }
}
