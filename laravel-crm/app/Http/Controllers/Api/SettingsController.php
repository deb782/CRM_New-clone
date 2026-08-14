<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AppSetting;
use Illuminate\Http\Request;

class SettingsController extends Controller
{
    private const KEY = 'site_visit_reminder_windows';
    private const DEFAULT = [1440, 60]; // minutes before the visit

    public function reminders()
    {
        return response()->json(['windows' => AppSetting::get(self::KEY, self::DEFAULT)]);
    }

    public function updateReminders(Request $request)
    {
        $data = $request->validate([
            'windows' => 'required|array|max:6',
            'windows.*' => 'integer|min:5|max:20160', // 5 min .. 14 days
        ]);
        $windows = array_values(array_unique(array_map('intval', $data['windows'])));
        rsort($windows); // furthest-out first
        AppSetting::set(self::KEY, $windows);

        return response()->json(['ok' => true, 'windows' => $windows]);
    }
}
