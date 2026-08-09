<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ChannelPartner extends Model
{
    protected $fillable = ['name', 'company', 'email', 'phone', 'commission_rate', 'active', 'user_id'];
    protected $casts = ['active' => 'boolean', 'commission_rate' => 'decimal:2'];

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
