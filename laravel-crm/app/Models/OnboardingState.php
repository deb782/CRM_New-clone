<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class OnboardingState extends Model
{
    protected $table = 'onboarding_states';
    protected $guarded = ['id'];
    protected $casts = ['steps' => 'array', 'completed' => 'boolean', 'completed_at' => 'datetime'];

    public static function current(): self
    {
        return static::firstOrCreate([], ['steps' => []]);
    }
}
