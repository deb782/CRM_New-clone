<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Notification;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class NotificationController extends Controller
{
    public function index(Request $request)
    {
        $uid = Auth::id();
        $items = Notification::where('user_id', $uid)->latest()->limit(40)->get();
        return response()->json([
            'data' => $items,
            'unread' => Notification::where('user_id', $uid)->whereNull('read_at')->count(),
        ]);
    }

    public function unreadCount()
    {
        return response()->json([
            'unread' => Notification::where('user_id', Auth::id())->whereNull('read_at')->count(),
        ]);
    }

    public function markRead(Notification $notification)
    {
        abort_unless($notification->user_id === Auth::id(), 403);
        $notification->update(['read_at' => now()]);
        return response()->json(['ok' => true]);
    }

    public function markAll()
    {
        Notification::where('user_id', Auth::id())->whereNull('read_at')->update(['read_at' => now()]);
        return response()->json(['ok' => true]);
    }
}
