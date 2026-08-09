<?php

namespace App\Services;

use App\Models\Booking;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class RazorpayService
{
    public function enabled(): bool
    {
        return (bool) config('integrations.razorpay.key_id') && (bool) config('integrations.razorpay.key_secret');
    }

    private function client(): \Razorpay\Api\Api
    {
        return new \Razorpay\Api\Api(config('integrations.razorpay.key_id'), config('integrations.razorpay.key_secret'));
    }

    /**
     * Create a payment link for a booking's token/EOI (or any amount in rupees).
     * Falls back to a mock link when keys are absent.
     * @return array{id:?string, url:string, provider:string}
     */
    public function createPaymentLink(Booking $booking, ?int $amountRupees = null, string $purpose = 'Token / EOI'): array
    {
        $amount = (int) ($amountRupees ?? $booking->token_amount);
        $appUrl = rtrim(config('app.url'), '/');

        if (! $this->enabled()) {
            return ['id' => 'mock_plink_'.Str::random(10), 'url' => $appUrl.'/pay/'.$booking->form_token, 'provider' => 'mock'];
        }

        try {
            $lead = $booking->lead;
            $link = $this->client()->paymentLink->create([
                'amount' => $amount * 100, // paise
                'currency' => 'INR',
                'accept_partial' => false,
                'reference_id' => substr($booking->booking_ref.'-'.Str::random(4), 0, 40),
                'description' => $purpose.' for '.$booking->booking_ref,
                'customer' => [
                    'name' => $lead?->name,
                    'email' => $lead?->email,
                    'contact' => $lead?->phone,
                ],
                'notify' => ['sms' => true, 'email' => (bool) $lead?->email],
                'callback_url' => $appUrl.'/booking/'.$booking->form_token,
                'callback_method' => 'get',
            ]);
            return ['id' => $link['id'] ?? null, 'url' => $link['short_url'] ?? ($appUrl.'/pay/'.$booking->form_token), 'provider' => 'razorpay'];
        } catch (\Throwable $e) {
            Log::error('Razorpay payment link failed: '.$e->getMessage());
            return ['id' => null, 'url' => $appUrl.'/pay/'.$booking->form_token, 'provider' => 'mock'];
        }
    }

    public function verifyWebhookSignature(string $body, string $signature): bool
    {
        $secret = config('integrations.razorpay.webhook_secret');
        if (! $secret) {
            return app()->environment('local');
        }
        try {
            $this->client()->utility->verifyWebhookSignature($body, $signature, $secret);
            return true;
        } catch (\Throwable $e) {
            // Fallback to manual HMAC when SDK client cannot init (no keys)
            return hash_equals(hash_hmac('sha256', $body, $secret), $signature);
        }
    }
}
