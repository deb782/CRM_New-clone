<?php

namespace App\Providers;

use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Facades\URL;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Generate absolute URLs (assets, links) from APP_URL so the app renders
        // correctly behind the preview proxy regardless of the internal request host.
        $appUrl = (string) config('app.url');
        if ($appUrl && str_starts_with($appUrl, 'http')) {
            URL::forceRootUrl($appUrl);
            if (str_starts_with($appUrl, 'https')) {
                URL::forceScheme('https');
            }
        }
    }
}
