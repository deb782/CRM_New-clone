<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\EmailCampaign;
use App\Models\EmailMessage;
use Illuminate\Http\Request;

class EmailTrackingController extends Controller
{
    // 1x1 transparent GIF
    private const PIXEL = "\x47\x49\x46\x38\x39\x61\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00\x21\xf9\x04\x01\x00\x00\x00\x00\x2c\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02\x44\x01\x00\x3b";

    public function open(string $token)
    {
        $msg = EmailMessage::where('open_token', $token)->first();
        if ($msg && ! $msg->opened_at) {
            $msg->update(['opened_at' => now()]);
            EmailCampaign::where('id', $msg->campaign_id)->increment('open_count');
        }

        return response(self::PIXEL, 200)
            ->header('Content-Type', 'image/gif')
            ->header('Cache-Control', 'no-store, no-cache, must-revalidate');
    }

    public function click(Request $request, string $token)
    {
        $url = $request->query('u');
        $validUrl = $url && filter_var($url, FILTER_VALIDATE_URL);
        $msg = EmailMessage::where('open_token', $token)->first();
        if ($msg && $validUrl) {
            if (! $msg->opened_at) {
                $msg->opened_at = now();
                EmailCampaign::where('id', $msg->campaign_id)->increment('open_count');
            }
            if (! $msg->clicked_at) {
                $msg->clicked_at = now();
                EmailCampaign::where('id', $msg->campaign_id)->increment('click_count');
            }
            $msg->save();
        }

        return redirect()->away($validUrl ? $url : (config('app.url') ?: '/'));
    }

    public function unsubscribe(string $token)
    {
        $msg = EmailMessage::where('open_token', $token)->first();
        $email = $msg?->to_email ?? 'your address';
        if ($msg) {
            \App\Models\Lead::where('id', $msg->lead_id)->update([
                'email_opt_out' => true,
                'email_opt_out_at' => now(),
            ]);
        }

        $safeEmail = htmlspecialchars($email, ENT_QUOTES);
        $body = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            .'<title>Unsubscribed</title></head>'
            .'<body style="margin:0;font-family:Arial,Helvetica,sans-serif;background:#f1f5f9">'
            .'<div style="max-width:460px;margin:80px auto;background:#fff;border-radius:14px;padding:40px;text-align:center;box-shadow:0 10px 30px rgba(2,6,23,.08)">'
            .'<div style="font-size:40px">&#128075;</div>'
            .'<h1 style="font-size:20px;color:#0f172a;margin:12px 0 6px">You\'re unsubscribed</h1>'
            .'<p style="color:#64748b;font-size:14px;line-height:1.5">'.$safeEmail.' has been removed from our email broadcast list. You will no longer receive marketing emails from us.</p>'
            .'</div></body></html>';

        return response($body, 200)->header('Content-Type', 'text/html');
    }
}
