<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class EmailMessage extends Model
{
    protected $table = 'email_messages';
    protected $guarded = ['id'];
    protected $casts = ['opened_at' => 'datetime', 'clicked_at' => 'datetime'];

    public function campaign()
    {
        return $this->belongsTo(EmailCampaign::class, 'campaign_id');
    }
}
