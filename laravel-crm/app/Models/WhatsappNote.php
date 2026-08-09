<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class WhatsappNote extends Model
{
    protected $table = 'whatsapp_notes';
    protected $guarded = ['id'];

    public function author()
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}
