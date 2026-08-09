<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Sequence extends Model
{
    protected $fillable = ['name', 'temperature', 'description', 'active'];
    protected $casts = ['active' => 'boolean'];

    public function steps()
    {
        return $this->hasMany(SequenceStep::class)->orderBy('step_no');
    }
}
