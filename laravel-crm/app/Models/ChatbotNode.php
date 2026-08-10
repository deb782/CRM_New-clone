<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ChatbotNode extends Model
{
    protected $fillable = ['chatbot_id','key','type','content','collect_field','collect_validator','options','next_key','marks_qualified','sort_order'];
    protected $casts = ['options' => 'array', 'marks_qualified' => 'boolean'];
    public function chatbot() { return $this->belongsTo(Chatbot::class); }
}
