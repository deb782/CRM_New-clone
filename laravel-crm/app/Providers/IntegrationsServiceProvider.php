<?php

namespace App\Providers;

use App\Integrations\Esign\Contract as EsignContract;
use App\Integrations\Esign\MockDriver as EsignMock;
use App\Integrations\Sms\Contract as SmsContract;
use App\Integrations\Sms\HttpGatewayDriver;
use App\Integrations\Sms\MockDriver as SmsMock;
use App\Integrations\Telephony\Contract as TelephonyContract;
use App\Integrations\Telephony\ExotelDriver;
use App\Integrations\Telephony\McubeDriver;
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
                'mcube' => new McubeDriver(),
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

    public function boot(): void
    {
        // Bridge Integrations Hub (DB) credentials into runtime config so the live
        // drivers + webhook verification use what admins enter in the Hub UI —
        // no .env edits or server restarts needed on the deployment.
        try {
            if (! \Illuminate\Support\Facades\Schema::hasTable('integrations')) {
                return;
            }
        } catch (\Throwable $e) {
            return; // DB not ready (e.g. during migrate) — skip.
        }

        $wa = \App\Models\Integration::liveConfig('meta_whatsapp');
        if ($wa && ! empty($wa['access_token']) && ! empty($wa['phone_number_id'])) {
            config([
                'integrations.whatsapp.driver'         => 'cloud',
                'integrations.whatsapp.cloud.token'    => $wa['access_token'],
                'integrations.whatsapp.cloud.phone_id' => $wa['phone_number_id'],
            ]);
            if (! empty($wa['waba_id']))       config(['integrations.whatsapp.cloud.waba_id' => $wa['waba_id']]);
            if (! empty($wa['verify_token']))  config(['integrations.whatsapp.cloud.verify_token' => $wa['verify_token']]);
            if (! empty($wa['app_secret']))    config(['integrations.whatsapp.cloud.app_secret' => $wa['app_secret']]);
        }

        // Google Workspace SMTP → Laravel mailer config.
        $mail = \App\Models\Integration::liveConfig('google_email');
        if ($mail && ! empty($mail['host']) && ! empty($mail['username']) && ! empty($mail['app_password'])) {
            $port = (int) ($mail['port'] ?: 587);
            config([
                'mail.default'                     => 'smtp',
                'mail.mailers.smtp.host'           => $mail['host'],
                'mail.mailers.smtp.port'           => $port,
                'mail.mailers.smtp.username'       => $mail['username'],
                'mail.mailers.smtp.password'       => $mail['app_password'],
                'mail.mailers.smtp.scheme'         => $port === 465 ? 'smtps' : 'smtp',
                'mail.from.address'                => ! empty($mail['from_email']) ? $mail['from_email'] : $mail['username'],
            ]);
            if (! empty($mail['from_name'])) config(['mail.from.name' => $mail['from_name']]);
        }

        // Mcube telephony → runtime config + driver.
        $tel = \App\Models\Integration::liveConfig('mcube');
        if ($tel && ! empty($tel['base_url']) && ! empty($tel['auth_token'])) {
            config([
                'integrations.telephony.driver'           => 'mcube',
                'integrations.telephony.mcube.base_url'   => $tel['base_url'],
                'integrations.telephony.mcube.auth_token' => $tel['auth_token'],
            ]);
            if (! empty($tel['caller_id'])) config(['integrations.telephony.mcube.caller_id' => $tel['caller_id']]);
        }
    }
}
