<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Activity extends Model
{
    protected $fillable = ['subject_type', 'subject_id', 'user_id', 'type', 'title', 'body', 'meta'];
    protected $casts = ['meta' => 'array'];

    public function subject()
    {
        return $this->morphTo();
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
