<?php

namespace App\Services;

use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;

class BroadcastMailer
{
    /**
     * Send one raw HTML email for the broadcast module.
     * Driver via config('integrations.email.driver'): mock = log only (default), smtp = Laravel Mail (Gmail at go-live).
     *
     * @return array{provider_id:?string, status:string}
     */
    public function send(string $to, string $subject, string $html, ?string $fromName = null, ?string $fromEmail = null): array
    {
        $driver = config('integrations.email.driver', 'mock');

        if ($driver === 'smtp') {
            try {
                Mail::html($html, function ($m) use ($to, $subject, $fromName, $fromEmail) {
                    $m->to($to)->subject($subject);
                    if ($fromEmail) {
                        $m->from($fromEmail, $fromName ?: config('mail.from.name'));
                    }
                });

                return ['provider_id' => 'smtp_'.Str::random(12), 'status' => 'sent'];
            } catch (\Throwable $e) {
                Log::error('BroadcastMailer SMTP failed: '.$e->getMessage());

                return ['provider_id' => null, 'status' => 'failed'];
            }
        }

        Log::info('[MOCK EMAIL] to='.$to.' subject="'.$subject.'"');

        return ['provider_id' => 'mock_email_'.Str::random(12), 'status' => 'sent'];
    }
}
