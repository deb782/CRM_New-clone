<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\ChannelPartner;
use App\Models\Lead;
use Illuminate\Http\Request;

class ChannelPartnerController extends Controller
{
    // ---- Admin management (config.manage) ----
    public function index()
    {
        return response()->json([
            'partners' => ChannelPartner::withCount('leads', 'bookings')->latest()->get(),
        ]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => 'required|string',
            'company' => 'nullable|string',
            'email' => 'nullable|email',
            'phone' => 'nullable|string',
            'commission_rate' => 'nullable|numeric|min:0|max:100',
            'user_id' => 'nullable|exists:users,id',
        ]);
        return response()->json(['partner' => ChannelPartner::create($data)], 201);
    }

    public function update(Request $request, ChannelPartner $channelPartner)
    {
        $data = $request->validate([
            'name' => 'sometimes|string',
            'company' => 'nullable|string',
            'email' => 'nullable|email',
            'phone' => 'nullable|string',
            'commission_rate' => 'nullable|numeric|min:0|max:100',
            'active' => 'nullable|boolean',
            'user_id' => 'nullable|exists:users,id',
        ]);
        $channelPartner->update($data);
        return response()->json(['partner' => $channelPartner->fresh()]);
    }

    /** Admin: commissions across all bookings. */
    public function commissions(Request $request)
    {
        $q = Booking::with(['channelPartner:id,name', 'lead:id,name'])
            ->whereNotNull('channel_partner_id')->where('commission_amount', '>', 0);
        if ($status = $request->query('status')) {
            $q->where('commission_status', $status);
        }
        return response()->json($q->latest()->paginate((int) $request->query('per_page', 50)));
    }

    public function decideCommission(Request $request, Booking $booking)
    {
        $data = $request->validate(['action' => 'required|in:approve,pay']);
        $booking->update(['commission_status' => $data['action'] === 'approve' ? 'approved' : 'paid']);
        return response()->json(['booking' => $booking->fresh()]);
    }

    // ---- Public referral submission (no auth) ----
    public function refer(Request $request, string $code, \App\Services\LeadService $leads)
    {
        $partner = ChannelPartner::where('referral_code', $code)->where('active', true)->first();
        if (! $partner) {
            return response()->json(['message' => 'Invalid referral code'], 404);
        }
        $data = $request->validate([
            'name' => 'required|string|max:150',
            'phone' => 'required|string|max:20',
            'email' => 'nullable|email',
            'message' => 'nullable|string|max:500',
        ]);
        $result = $leads->capture(array_merge($data, ['source' => 'Partner Referral']));
        $lead = $result['lead'] ?? null;
        if ($lead) {
            $lead->forceFill(['channel_partner_id' => $partner->id, 'source' => 'Partner Referral'])->save();
        }
        return response()->json(['message' => 'Thank you! '.$partner->name.' will be in touch shortly.', 'status' => $result['status'] ?? 'created']);
    }

    // ---- Public widget branding (no auth; used by /widget/chat.js when data-ref set) ----
    public function widgetConfig(string $code)
    {
        $partner = ChannelPartner::where('referral_code', $code)->where('active', true)->first();
        return response()->json([
            'title' => $partner && $partner->widget_title ? $partner->widget_title : 'Find your dream home',
            'accent' => $partner && $partner->widget_accent ? $partner->widget_accent : '#6c8cff',
            'greeting' => $partner && $partner->widget_greeting ? $partner->widget_greeting : "Hi! I can help you explore our projects. First, what's your name?",
        ]);
    }

    // ---- Partner self-service branding update (auth, partner-scoped) ----
    public function updateBranding(Request $request)
    {
        $partner = $this->currentPartner($request);
        if (! $partner) {
            return response()->json(['message' => 'No channel-partner profile linked to this account'], 404);
        }
        $data = $request->validate([
            'widget_title' => 'nullable|string|max:60',
            'widget_accent' => ['nullable', 'string', 'regex:/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/'],
            'widget_greeting' => 'nullable|string|max:300',
        ]);
        $partner->update($data);

        return response()->json(['partner' => $partner->fresh()->only(['id', 'name', 'widget_title', 'widget_accent', 'widget_greeting'])]);
    }

    // ---- Partner portal (scoped to the logged-in partner user) ----
    private function currentPartner(Request $request): ?ChannelPartner
    {
        return ChannelPartner::where('user_id', $request->user()->id)->first();
    }

    public function portal(Request $request)
    {
        $partner = $this->currentPartner($request);
        if (! $partner) {
            return response()->json(['message' => 'No channel-partner profile linked to this account'], 404);
        }
        $leads = Lead::where('channel_partner_id', $partner->id)->with('stage')->latest()->limit(200)->get();
        $bookings = Booking::where('channel_partner_id', $partner->id)->with(['lead:id,name', 'plot:id,number'])->latest()->get();
        $earned = (int) $bookings->where('commission_status', 'paid')->sum('commission_amount');
        $pending = (int) $bookings->whereIn('commission_status', ['pending', 'approved'])->sum('commission_amount');

        return response()->json([
            'partner' => array_merge($partner->only(['id', 'name', 'company', 'commission_rate', 'referral_code', 'widget_title', 'widget_accent', 'widget_greeting']), [
                'referral_url' => url('/refer/'.$partner->referral_code),
                'widget_snippet' => '<script src="'.url('/widget/chat.js').'" data-ref="'.$partner->referral_code.'" async></script>',
            ]),
            'summary' => [
                'leads' => $leads->count(),
                'bookings' => $bookings->count(),
                'commission_earned' => $earned,
                'commission_pending' => $pending,
            ],
            'leads' => $leads,
            'bookings' => $bookings,
        ]);
    }
}
