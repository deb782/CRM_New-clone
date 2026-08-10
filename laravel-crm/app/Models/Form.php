<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

class Form extends Model
{
    protected $fillable = [
        'uuid','slug','name','project_id',
        'redirect_url','settings','is_active','submission_count','created_by',
    ];

    protected function casts(): array
    {
        return ['settings' => 'array', 'is_active' => 'boolean'];
    }

    protected static function booted(): void
    {
        static::creating(function (self $f) {
            $f->uuid ??= (string) Str::uuid();
            $f->slug ??= Str::slug($f->name) . '-' . substr(bin2hex(random_bytes(3)), 0, 6);
        });
    }

    public function fields()  { return $this->hasMany(FormField::class)->orderBy('sort_order'); }
    public function project() { return $this->belongsTo(Project::class); }

    public function embedScript(?string $appUrl = null): string
    {
        $appUrl = rtrim($appUrl ?: config('app.url'), '/');
        $prefix = config('app.public_api_prefix', '/crm-api/v1');
        $url = $appUrl . $prefix . '/public/forms/' . $this->slug . '/submit';
        $v   = $this->updated_at?->timestamp ?? time();
        return <<<HTML
<!-- Agrocorp CRM Form Embed -->
<div data-crm-form="{$this->slug}"></div>
<script src="{$appUrl}/assets/js/form-embed.js?v={$v}"
        data-crm-base="{$appUrl}"
        data-form="{$this->slug}"
        data-endpoint="{$url}" async></script>
HTML;
    }
}
