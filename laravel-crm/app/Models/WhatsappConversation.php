<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class WhatsappConversation extends Model
{
    protected $table = 'whatsapp_conversations';
    protected $guarded = ['id'];
    protected $casts = ['last_message_at' => 'datetime', 'last_inbound_at' => 'datetime', 'tags' => 'array', 'bot_state' => 'array'];

    public function notes()
    {
        return $this->hasMany(WhatsappNote::class, 'conversation_id')->latest();
    }

    public function lead()
    {
        return $this->belongsTo(Lead::class);
    }

    public function agent()
    {
        return $this->belongsTo(User::class, 'assigned_to');
    }

    public function messages()
    {
        return $this->hasMany(WhatsappMessage::class, 'conversation_id')->orderBy('id');
    }

    public function withinWindow(): bool
    {
        $hours = (int) config('integrations.whatsapp.session_window_hours', 24);
        return $this->last_inbound_at && $this->last_inbound_at->gt(now()->subHours($hours));
    }
}
