<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class WhatsappTemplate extends Model
{
    protected $table = 'whatsapp_templates';
    protected $guarded = ['id'];
    protected $casts = ['synced_at' => 'datetime'];
}
