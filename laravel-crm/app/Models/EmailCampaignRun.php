<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class EmailCampaignRun extends Model
{
    protected $table = 'email_campaign_runs';
    protected $guarded = ['id'];
    protected $casts = ['sent_at' => 'datetime'];
}
