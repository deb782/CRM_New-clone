<?php

namespace App\Providers;

use App\Integrations\Esign\Contract as EsignContract;
use App\Integrations\Esign\MockDriver as EsignMock;
use App\Integrations\Sms\Contract as SmsContract;
use App\Integrations\Sms\HttpGatewayDriver;
use App\Integrations\Sms\MockDriver as SmsMock;
use App\Integrations\Telephony\Contract as TelephonyContract;
use App\Integrations\Telephony\ExotelDriver;
use App\Integrations\Telephony\MockDriver as TelephonyMock;
use App\Integrations\WhatsApp\CloudApiDriver;
use App\Integrations\WhatsApp\Contract as WhatsAppContract;
use App\Integrations\WhatsApp\MockDriver as WhatsAppMock;
use App\Integrations\WhatsApp\WatiDriver;
use Illuminate\Support\ServiceProvider;

class IntegrationsServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->bind(WhatsAppContract::class, function () {
            return match (config('integrations.whatsapp.driver')) {
                'wati' => new WatiDriver(),
                'cloud' => new CloudApiDriver(),
                default => new WhatsAppMock(),
            };
        });

        $this->app->bind(TelephonyContract::class, function () {
            return match (config('integrations.telephony.driver')) {
                'exotel' => new ExotelDriver(),
                default => new TelephonyMock(),
            };
        });

        $this->app->bind(SmsContract::class, function () {
            return match (config('integrations.sms.driver')) {
                'http' => new HttpGatewayDriver(),
                default => new SmsMock(),
            };
        });

        $this->app->bind(EsignContract::class, function () {
            return new EsignMock();
        });
    }
}
