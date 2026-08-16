<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class WaCampaign extends Model
{
    protected $table = 'wa_campaigns';
    protected $guarded = ['id'];
    protected $casts = [
        'audience' => 'array',
        'variables' => 'array',
        'stats' => 'array',
        'simulated' => 'boolean',
        'scheduled_at' => 'datetime',
    ];

    public function recipients()
    {
        return $this->hasMany(WaCampaignRecipient::class, 'campaign_id');
    }
}
