<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class WaCampaignRecipient extends Model
{
    protected $table = 'wa_campaign_recipients';
    protected $guarded = ['id'];
    protected $casts = [
        'sent_at' => 'datetime',
        'delivered_at' => 'datetime',
        'read_at' => 'datetime',
        'replied_at' => 'datetime',
    ];
}
