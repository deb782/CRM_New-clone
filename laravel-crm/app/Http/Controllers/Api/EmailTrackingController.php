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
}
