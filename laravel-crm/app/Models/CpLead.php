<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CpLead extends Model
{
    protected $guarded = ['id'];

    public function partner()
    {
        return $this->belongsTo(ChannelPartner::class, 'channel_partner_id');
    }

    public function representative()
    {
        return $this->belongsTo(CpRepresentative::class, 'cp_representative_id');
    }

    public function project()
    {
        return $this->belongsTo(Project::class);
    }

    public function convertedLead()
    {
        return $this->belongsTo(Lead::class, 'converted_lead_id');
    }

    public function events()
    {
        return $this->hasMany(CpLeadEvent::class)->orderByDesc('created_at');
    }
}
