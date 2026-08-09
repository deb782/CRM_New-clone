<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class WhatsappMessage extends Model
{
    protected $table = 'whatsapp_messages';
    protected $guarded = ['id'];
    protected $casts = ['sent_at' => 'datetime', 'delivered_at' => 'datetime', 'read_at' => 'datetime', 'meta' => 'array'];

    public function lead()
    {
        return $this->belongsTo(Lead::class);
    }

    public function conversation()
    {
        return $this->belongsTo(WhatsappConversation::class, 'conversation_id');
    }
}
