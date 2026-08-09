<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Contact extends Model
{
    protected $fillable = ['name', 'email', 'phone', 'alt_phone', 'alt_email', 'city', 'comm_preference', 'whatsapp_opt_out', 'do_not_contact'];
    protected $casts = ['whatsapp_opt_out' => 'boolean', 'do_not_contact' => 'boolean'];

    public function leads()
    {
        return $this->hasMany(Lead::class);
    }
}
