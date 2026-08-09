<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ChannelPartner extends Model
{
    protected $fillable = ['name', 'company', 'email', 'phone', 'commission_rate', 'active', 'user_id', 'referral_code', 'widget_title', 'widget_accent', 'widget_greeting'];
    protected $casts = ['active' => 'boolean', 'commission_rate' => 'decimal:2'];

    protected static function booted(): void
    {
        static::creating(function ($p) {
            if (empty($p->referral_code)) {
                $p->referral_code = strtoupper(\Illuminate\Support\Str::random(8));
            }
        });
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function leads()
    {
        return $this->hasMany(Lead::class);
    }

    public function bookings()
    {
        return $this->hasMany(Booking::class);
    }
}
