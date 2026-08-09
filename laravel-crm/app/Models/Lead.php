<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\MorphMany;

class Lead extends Model
{
    protected $guarded = ['id'];

    protected $casts = [
        'meta' => 'array',
        'contact_verified' => 'boolean',
        'whatsapp_opt_out' => 'boolean',
        'do_not_contact' => 'boolean',
        'is_invalid' => 'boolean',
        'verified_at' => 'datetime',
        'last_contacted_at' => 'datetime',
        'next_follow_up_at' => 'datetime',
        'acknowledged_at' => 'datetime',
    ];

    public function contact()
    {
        return $this->belongsTo(Contact::class);
    }

    public function project()
    {
        return $this->belongsTo(Project::class);
    }

    public function owner()
    {
        return $this->belongsTo(User::class, 'owner_id');
    }

    public function stage()
    {
        return $this->belongsTo(PipelineStage::class, 'pipeline_stage_id');
    }

    public function activities(): MorphMany
    {
        return $this->morphMany(Activity::class, 'subject')->latest();
    }

    public function tasks()
    {
        return $this->hasMany(Task::class);
    }

    public function calls()
    {
        return $this->hasMany(Call::class)->latest('called_at');
    }

    public function whatsappMessages()
    {
        return $this->hasMany(WhatsappMessage::class)->latest();
    }

    public function emails()
    {
        return $this->hasMany(Email::class)->latest();
    }

    public function enrollments()
    {
        return $this->hasMany(SequenceEnrollment::class);
    }
}
