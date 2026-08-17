<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CpTicket extends Model
{
    protected $guarded = ['id'];
    protected $casts = ['last_reply_at' => 'datetime'];

    public function partner()
    {
        return $this->belongsTo(ChannelPartner::class, 'channel_partner_id');
    }

    public function messages()
    {
        return $this->hasMany(CpTicketMessage::class)->orderBy('created_at');
    }
}
