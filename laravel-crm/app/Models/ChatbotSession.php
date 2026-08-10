<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ChatbotSession extends Model
{
    protected $fillable = ['uuid','chatbot_id','current_node_key','visitor_data','transcript','is_qualified','lead_id','ip','user_agent','completed_at'];
    protected $casts = ['visitor_data' => 'array', 'transcript' => 'array', 'is_qualified' => 'boolean', 'completed_at' => 'datetime'];
    protected static function booted() { static::creating(fn ($m) => $m->uuid ??= (string) \Illuminate\Support\Str::uuid()); }
    public function chatbot() { return $this->belongsTo(Chatbot::class); }
    public function lead() { return $this->belongsTo(Lead::class); }
}
