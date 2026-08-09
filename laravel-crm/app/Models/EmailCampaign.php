<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class EmailCampaign extends Model
{
    protected $table = 'email_campaigns';
    protected $guarded = ['id'];
    protected $casts = ['sent_at' => 'datetime'];
}
