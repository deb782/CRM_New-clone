<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class WhatsappBroadcast extends Model
{
    protected $table = 'whatsapp_broadcasts';
    protected $guarded = ['id'];
    protected $casts = ['sent_at' => 'datetime'];
}
