<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Email extends Model
{
    protected $guarded = ['id'];
    protected $casts = ['sent_at' => 'datetime', 'opened_at' => 'datetime', 'clicked_at' => 'datetime', 'bounced_at' => 'datetime'];

    public function lead()
    {
        return $this->belongsTo(Lead::class);
    }
}
