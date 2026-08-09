<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\EmailCampaign;
use App\Models\EmailMessage;
use App\Models\Lead;
use App\Services\BroadcastMailer;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class EmailCampaignController extends Controller
{
    public function index()
    {
        return response()->json(['campaigns' => EmailCampaign::latest()->limit(100)->get()]);
    }

    public function show(EmailCampaign $email_campaign)
    {
        return response()->json(['campaign' => $email_campaign]);
    }

    public function store(Request $request)
    {
        $data = $this->data($request);
        $data['created_by'] = $request->user()->id;
        $data['recipients'] = $this->audience($data)->count();

        return response()->json(['campaign' => EmailCampaign::create($data)], 201);
    }

    public function update(Request $request, EmailCampaign $email_campaign)
    {
        if ($email_campaign->status === 'sent') {
            return response()->json(['message' => 'Sent campaigns cannot be edited'], 422);
        }
        $data = $this->data($request);
        $data['recipients'] = $this->audience($data)->count();
        $email_campaign->update($data);

        return response()->json(['campaign' => $email_campaign->fresh()]);
    }

    public function destroy(EmailCampaign $email_campaign)
    {
        $email_campaign->delete();

        return response()->json(['ok' => true]);
    }

    public function send(EmailCampaign $email_campaign, BroadcastMailer $mailer)
    {
        if ($email_campaign->status === 'sent') {
            return response()->json(['message' => 'Campaign already sent'], 422);
        }
        $email_campaign->update(['status' => 'sending']);

        $targets = $this->audience($email_campaign->toArray())->get();
        $sent = 0;
        $failed = 0;
        $appUrl = rtrim(config('app.url') ?: url('/'), '/');

        foreach ($targets as $lead) {
            $token = Str::random(48);
            $subject = $this->personalize($email_campaign->subject, $lead);
            $html = $this->personalize($email_campaign->html ?: '', $lead);
            $html = $this->injectTracking($html, $token, $appUrl);

            $res = $mailer->send($lead->email, $subject, $html, $email_campaign->from_name, $email_campaign->from_email);

            EmailMessage::create([
                'campaign_id' => $email_campaign->id,
                'lead_id' => $lead->id,
                'to_email' => $lead->email,
                'subject' => $subject,
                'status' => $res['status'],
                'open_token' => $token,
                'provider_id' => $res['provider_id'],
            ]);
            $res['status'] === 'sent' ? $sent++ : $failed++;
        }

        $email_campaign->update([
            'status' => 'sent',
            'recipients' => $targets->count(),
            'sent_count' => $sent,
            'failed_count' => $failed,
            'sent_at' => now(),
        ]);

        return response()->json(['campaign' => $email_campaign->fresh(), 'sent' => $sent, 'failed' => $failed, 'total' => $targets->count()]);
    }

    private function personalize(string $text, Lead $lead): string
    {
        return strtr($text, [
            '{{name}}' => $lead->name ?: 'there',
            '{{email}}' => (string) $lead->email,
            '{{phone}}' => (string) $lead->phone,
            '{{project}}' => 'our projects',
        ]);
    }

    private function injectTracking(string $html, string $token, string $appUrl): string
    {
        // Rewrite outbound links through the click tracker
        $html = preg_replace_callback('/href="(https?:\/\/[^"]+)"/i', function ($m) use ($token, $appUrl) {
            return 'href="'.$appUrl.'/api/v1/email/click/'.$token.'?u='.urlencode($m[1]).'"';
        }, $html);

        // Append a 1x1 open pixel
        $pixel = '<img src="'.$appUrl.'/api/v1/email/open/'.$token.'" width="1" height="1" alt="" style="display:none"/>';
        if (stripos($html, '</body>') !== false) {
            return str_ireplace('</body>', $pixel.'</body>', $html);
        }

        return $html.$pixel;
    }

    private function audience(array $c)
    {
        $q = Lead::whereNotNull('email')->where('email', '!=', '')->where('do_not_contact', false);

        return match ($c['audience_type'] ?? 'all') {
            'status' => $q->where('status', $c['audience_value'] ?? null),
            'temperature' => $q->where('temperature', $c['audience_value'] ?? null),
            'source' => $q->where('source', $c['audience_value'] ?? null),
            default => $q,
        };
    }

    private function data(Request $request): array
    {
        $data = $request->validate([
            'name' => 'required|string|max:150',
            'subject' => 'required|string|max:200',
            'template_id' => 'nullable|exists:email_templates,id',
            'html' => 'nullable|string',
            'audience_type' => 'required|in:all,status,temperature,source',
            'audience_value' => 'nullable|string',
            'from_name' => 'nullable|string|max:120',
            'from_email' => 'nullable|email',
        ]);
        if (empty($data['html'])) {
            abort(422, 'Email content is required');
        }

        return $data;
    }
}
