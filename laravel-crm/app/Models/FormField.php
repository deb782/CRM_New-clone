<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class FormField extends Model
{
    protected $fillable = ['form_id','slug','label','type','options','is_required','sort_order','maps_to_field','placeholder'];

    protected function casts(): array
    {
        return ['options' => 'array', 'is_required' => 'boolean'];
    }

    public function form() { return $this->belongsTo(Form::class); }
}
