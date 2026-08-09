<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SequenceStep extends Model
{
    protected $fillable = ['sequence_id', 'step_no', 'offset_hours', 'channel', 'template_id', 'subject', 'body'];

    public function sequence()
    {
        return $this->belongsTo(Sequence::class);
    }

    public function template()
    {
        return $this->belongsTo(Template::class);
    }
}
