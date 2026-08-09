<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class WhatsappSetting extends Model
{
    protected $table = 'whatsapp_settings';
    protected $guarded = ['id'];
    protected $casts = ['auto_assign' => 'boolean'];

    public static function current(): self
    {
        return static::firstOrCreate(['id' => 1], ['auto_assign' => true]);
    }
}
