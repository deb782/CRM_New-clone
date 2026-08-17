<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Laravel\Sanctum\HasApiTokens;

class ChannelPartner extends Model
{
    use HasApiTokens;

    protected $fillable = [
        'name', 'company', 'email', 'phone', 'commission_rate', 'active', 'user_id', 'referral_code',
        'widget_title', 'widget_accent', 'widget_greeting',
        'cp_code', 'contact_name', 'contact_email', 'contact_designation', 'password_hash',
        'status', 'must_change_password', 'last_login_at',
        'registered_address', 'entity_type', 'nature_of_business', 'gstin', 'pan', 'rera_number',
        'bank_account_name', 'bank_name', 'bank_account_number', 'bank_ifsc', 'bank_account_type',
        'signature_name', 'signature_designation', 'kyc_status', 'kyc_submitted_at', 'kyc_approved_at',
    ];

    protected $hidden = ['password_hash'];

    protected $casts = [
        'active' => 'boolean',
        'must_change_password' => 'boolean',
        'commission_rate' => 'decimal:2',
        'last_login_at' => 'datetime',
        'kyc_submitted_at' => 'datetime',
        'kyc_approved_at' => 'datetime',
    ];

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

    public function representatives()
    {
        return $this->hasMany(CpRepresentative::class);
    }

    public function cpLeads()
    {
        return $this->hasMany(CpLead::class);
    }

    public function tickets()
    {
        return $this->hasMany(CpTicket::class);
    }
}
