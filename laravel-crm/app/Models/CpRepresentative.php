<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CpRepresentative extends Model
{
    protected $guarded = ['id'];

    public function partner()
    {
        return $this->belongsTo(ChannelPartner::class, 'channel_partner_id');
    }

    public function leads()
    {
        return $this->hasMany(CpLead::class, 'cp_representative_id');
    }
}
