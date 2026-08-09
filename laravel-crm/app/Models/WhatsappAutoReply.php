<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class WhatsappAutoReply extends Model
{
    protected $table = 'whatsapp_auto_replies';
    protected $guarded = ['id'];
    protected $casts = ['active' => 'boolean'];
}
