<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Template extends Model
{
    protected $fillable = ['name', 'slug', 'channel', 'subject', 'body', 'variables', 'active'];
    protected $casts = ['variables' => 'array', 'active' => 'boolean'];
}
