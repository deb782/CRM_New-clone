<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Booking extends Model
{
    protected $guarded = ['id'];
    protected $casts = [
        'form_data' => 'array', 'meta' => 'array',
        'form_sent_at' => 'datetime', 'form_submitted_at' => 'datetime',
        'verified_at' => 'datetime', 'token_paid_at' => 'datetime',
    ];

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

    public function costSheet()
    {
        return $this->belongsTo(CostSheet::class);
    }

    public function payments()
    {
        return $this->hasMany(Payment::class);
    }

    public function documents()
    {
        return $this->hasMany(DocumentChecklistItem::class);
    }

    public function letters()
    {
        return $this->hasMany(Letter::class);
    }

    public function milestones()
    {
        return $this->hasMany(PaymentMilestone::class)->orderBy('seq');
    }

    public function agreements()
    {
        return $this->hasMany(Agreement::class);
    }

    public function demandLetters()
    {
        return $this->hasMany(DemandLetter::class);
    }

    public function channelPartner()
    {
        return $this->belongsTo(ChannelPartner::class);
    }
}
