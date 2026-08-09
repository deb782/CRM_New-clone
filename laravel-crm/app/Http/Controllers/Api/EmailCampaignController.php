<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\EmailCampaign;
use App\Models\EmailMessage;
use App\Services\CampaignDispatcher;
use Illuminate\Http\Request;

class EmailCampaignController extends Controller
{
    public function __construct(private CampaignDispatcher $dispatcher) {}

    public function index()
    {
        return response()->json(['campaigns' => EmailCampaign::latest()->limit(100)->get()]);
    }

    public function show(EmailCampaign $email_campaign)
    {
        return response()->json(['campaign' => $email_campaign]);
    }

    public function analytics(EmailCampaign $email_campaign)
    {
        $messages = EmailMessage::where('campaign_id', $email_campaign->id)
            ->orderByDesc('id')
            ->limit(500)
            ->get(['id', 'to_email', 'status', 'opened_at', 'clicked_at']);

        $sent = (int) $email_campaign->sent_count;
        $opens = (int) $email_campaign->open_count;
        $clicks = (int) $email_campaign->click_count;

        $runs = \App\Models\EmailCampaignRun::where('campaign_id', $email_campaign->id)
            ->orderByDesc('run_number')
            ->get()
            ->map(function ($run) {
                $runOpens = EmailMessage::where('run_id', $run->id)->whereNotNull('opened_at')->count();
                $runClicks = EmailMessage::where('run_id', $run->id)->whereNotNull('clicked_at')->count();
                $runSent = (int) $run->sent_count;

                return [
                    'run_number' => $run->run_number,
                    'sent_at' => $run->sent_at,
                    'recipients' => (int) $run->recipients,
                    'sent' => $runSent,
                    'failed' => (int) $run->failed_count,
                    'opens' => $runOpens,
                    'clicks' => $runClicks,
                    'open_rate' => $runSent ? round($runOpens / $runSent * 100, 1) : 0,
                    'click_rate' => $runSent ? round($runClicks / $runSent * 100, 1) : 0,
                ];
            });

        return response()->json([
            'campaign' => $email_campaign,
            'stats' => [
                'recipients' => (int) $email_campaign->recipients,
                'sent' => $sent,
                'failed' => (int) $email_campaign->failed_count,
                'opens' => $opens,
                'clicks' => $clicks,
                'open_rate' => $sent ? round($opens / $sent * 100, 1) : 0,
                'click_rate' => $sent ? round($clicks / $sent * 100, 1) : 0,
            ],
            'runs' => $runs,
            'recipients' => $messages,
        ]);
    }

    public function store(Request $request)
    {
        $data = $this->data($request);
        $data['created_by'] = $request->user()->id;
        $data['recipients'] = $this->dispatcher->audience($data)->count();
        $recurring = ($data['recurrence'] ?? 'none') !== 'none';
        if (! empty($data['scheduled_at']) || $recurring) {
            $data['status'] = 'scheduled';
            if (empty($data['scheduled_at']) && $recurring) {
                $data['scheduled_at'] = now();
            }
        }

        return response()->json(['campaign' => EmailCampaign::create($data)], 201);
    }

    public function update(Request $request, EmailCampaign $email_campaign)
    {
        if ($email_campaign->status === 'sent') {
            return response()->json(['message' => 'Sent campaigns cannot be edited'], 422);
        }
        $data = $this->data($request);
        $data['recipients'] = $this->dispatcher->audience($data)->count();
        $recurring = ($data['recurrence'] ?? 'none') !== 'none';
        $data['status'] = (! empty($data['scheduled_at']) || $recurring) ? 'scheduled' : 'draft';
        if (empty($data['scheduled_at']) && $recurring) {
            $data['scheduled_at'] = now();
        }
        $email_campaign->update($data);

        return response()->json(['campaign' => $email_campaign->fresh()]);
    }

    public function destroy(EmailCampaign $email_campaign)
    {
        $email_campaign->delete();

        return response()->json(['ok' => true]);
    }

    public function schedule(Request $request, EmailCampaign $email_campaign)
    {
        if ($email_campaign->status === 'sent') {
            return response()->json(['message' => 'Campaign already sent'], 422);
        }
        $data = $request->validate([
            'scheduled_at' => 'required|date|after:now',
            'recurrence' => 'nullable|in:none,weekly,monthly',
        ]);
        $email_campaign->update([
            'scheduled_at' => $data['scheduled_at'],
            'recurrence' => $data['recurrence'] ?? 'none',
            'status' => 'scheduled',
        ]);

        return response()->json(['campaign' => $email_campaign->fresh()]);
    }

    public function unschedule(EmailCampaign $email_campaign)
    {
        if ($email_campaign->status !== 'scheduled') {
            return response()->json(['message' => 'Campaign is not scheduled'], 422);
        }
        $email_campaign->update(['scheduled_at' => null, 'recurrence' => 'none', 'status' => 'draft']);

        return response()->json(['campaign' => $email_campaign->fresh()]);
    }

    public function send(EmailCampaign $email_campaign)
    {
        if ($email_campaign->status === 'sent') {
            return response()->json(['message' => 'Campaign already sent'], 422);
        }

        $result = $this->dispatcher->dispatch($email_campaign);

        return response()->json(array_merge(['campaign' => $email_campaign->fresh()], $result));
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
            'scheduled_at' => 'nullable|date|after:now',
            'recurrence' => 'nullable|in:none,weekly,monthly',
        ]);
        if (empty($data['html'])) {
            abort(422, 'Email content is required');
        }

        return $data;
    }
}
