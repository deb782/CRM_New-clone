<?php

namespace App\Services;

use App\Models\EmailCampaign;
use App\Models\EmailMessage;
use App\Models\Lead;
use Illuminate\Support\Str;

class CampaignDispatcher
{
    public function __construct(private BroadcastMailer $mailer) {}

    public function audience(array $c)
    {
        $q = Lead::whereNotNull('email')->where('email', '!=', '')
            ->where('do_not_contact', false)
            ->where('email_opt_out', false);

        return match ($c['audience_type'] ?? 'all') {
            'status' => $q->where('status', $c['audience_value'] ?? null),
            'temperature' => $q->where('temperature', $c['audience_value'] ?? null),
            'source' => $q->where('source', $c['audience_value'] ?? null),
            default => $q,
        };
    }

    public function dispatch(EmailCampaign $campaign): array
    {
        $campaign->update(['status' => 'sending']);

        $targets = $this->audience($campaign->toArray())->get();
        $sent = 0;
        $failed = 0;
        $appUrl = rtrim(config('app.url') ?: url('/'), '/');

        foreach ($targets as $lead) {
            $token = Str::random(48);
            $subject = $this->personalize($campaign->subject, $lead);
            $html = $this->personalize($campaign->html ?: '', $lead);
            $html = $this->injectTracking($html, $token, $appUrl);
            $html = $this->injectUnsubscribe($html, $token, $appUrl, $campaign->from_name);

            $res = $this->mailer->send($lead->email, $subject, $html, $campaign->from_name, $campaign->from_email);

            EmailMessage::create([
                'campaign_id' => $campaign->id,
                'lead_id' => $lead->id,
                'to_email' => $lead->email,
                'subject' => $subject,
                'body_html' => $html,
                'status' => $res['status'],
                'open_token' => $token,
                'provider_id' => $res['provider_id'],
            ]);
            $res['status'] === 'sent' ? $sent++ : $failed++;
        }

        $campaign->update([
            'status' => 'sent',
            'recipients' => $targets->count(),
            'sent_count' => $sent,
            'failed_count' => $failed,
            'sent_at' => now(),
            'scheduled_at' => null,
        ]);

        return ['sent' => $sent, 'failed' => $failed, 'total' => $targets->count()];
    }

    private function personalize(string $text, Lead $lead): string
    {
        $values = [
            'name' => $lead->name ?: 'there',
            'email' => (string) $lead->email,
            'phone' => (string) $lead->phone,
            'project' => optional($lead->project)->name ?: 'our projects',
        ];

        $map = [];
        foreach ($values as $tag => $value) {
            $map['{{'.$tag.'}}'] = $value;
            $map['{'.$tag.'}'] = $value;
        }

        return strtr($text, $map);
    }

    private function injectTracking(string $html, string $token, string $appUrl): string
    {
        $html = preg_replace_callback('/href="(https?:\/\/[^"]+)"/i', function ($m) use ($token, $appUrl) {
            return 'href="'.$appUrl.'/api/v1/email/click/'.$token.'?u='.urlencode($m[1]).'"';
        }, $html);

        $pixel = '<img src="'.$appUrl.'/api/v1/email/open/'.$token.'" width="1" height="1" alt="" style="display:none"/>';
        if (stripos($html, '</body>') !== false) {
            return str_ireplace('</body>', $pixel.'</body>', $html);
        }

        return $html.$pixel;
    }

    private function injectUnsubscribe(string $html, string $token, string $appUrl, ?string $fromName): string
    {
        $sender = $fromName ? e($fromName) : 'us';
        $link = $appUrl.'/api/v1/email/unsubscribe/'.$token;
        $footer = '<div style="margin-top:28px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;color:#94a3b8;text-align:center;font-family:Arial,Helvetica,sans-serif">'
            .'You are receiving this because you opted in to updates from '.$sender.'. '
            .'<a href="'.$link.'" style="color:#64748b;text-decoration:underline">Unsubscribe</a>'
            .'</div>';
        if (stripos($html, '</body>') !== false) {
            return str_ireplace('</body>', $footer.'</body>', $html);
        }

        return $html.$footer;
    }
}
