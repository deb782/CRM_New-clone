<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Chatbot extends Model
{
    use HasFactory, SoftDeletes;
    protected $fillable = ['uuid','name','slug','project_id','brand_name','brand_color','welcome_message','start_node_key','is_active','escalate_on_qualified','settings','created_by'];
    protected $casts = ['is_active' => 'boolean', 'escalate_on_qualified' => 'boolean', 'settings' => 'array'];
    protected static function booted() { static::creating(fn ($m) => $m->uuid ??= (string) \Illuminate\Support\Str::uuid()); }
    public function nodes() { return $this->hasMany(ChatbotNode::class)->orderBy('sort_order'); }
    public function project() { return $this->belongsTo(Project::class); }
}
