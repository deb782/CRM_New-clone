<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasFactory, Notifiable, HasApiTokens;

    protected $fillable = ['name', 'email', 'password', 'role_id', 'phone', 'is_active', 'must_change_password', 'avatar_color', 'preferences'];
    protected $hidden = ['password', 'remember_token'];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'is_active' => 'boolean',
            'must_change_password' => 'boolean',
            'preferences' => 'array',
        ];
    }

    public function role()
    {
        return $this->belongsTo(Role::class);
    }

    public function projects()
    {
        return $this->belongsToMany(Project::class);
    }

    public function hasPermission(string $key): bool
    {
        if (! $this->role) {
            return false;
        }
        if ($this->role->slug === 'admin') {
            return true;
        }
        return $this->role->permissions()->where('key', $key)->exists();
    }
}
