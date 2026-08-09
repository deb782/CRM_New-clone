<?php

namespace App\Services;

use App\Integrations\Telephony\Contract;
use App\Models\Call;
use App\Models\Lead;
use App\Models\Task;
use Illuminate\Support\Facades\Auth;

class TelephonyService
{
    public function __construct(private Contract $driver, private ActivityService $activity) {}

    public function clickToCall(Lead $lead): array
    {
        $agent = Auth::user();
        $res = $this->driver->call((string) ($agent?->phone ?? ''), (string) $lead->phone);
        $this->activity->log($lead, 'call', 'Click-to-call initiated', null, $res);
        return $res;
    }

    /** Log a completed call + apply outcome side effects (C1.2 / F1.1). */
    public function logCall(Lead $lead, array $data): Call
    {
        $call = Call::create([
            'lead_id' => $lead->id,
            'user_id' => Auth::id(),
            'direction' => $data['direction'] ?? 'outbound',
            'outcome' => $data['outcome'] ?? null,
            'duration' => $data['duration'] ?? 0,
            'notes' => $data['notes'] ?? null,
            'recording_url' => $data['recording_url'] ?? null,
            'called_at' => now(),
        ]);

        $lead->increment('contact_attempts');
        $lead->last_contacted_at = now();

        // No-answer -> auto follow-up in 1 hour (C1.2)
        if (($data['outcome'] ?? null) === 'no_answer') {
            Task::create([
                'lead_id' => $lead->id,
                'assigned_to' => $lead->owner_id,
                'title' => 'Retry call (no answer)',
                'type' => 'callback',
                'due_at' => now()->addHour(),
                'priority' => 'normal',
            ]);
        }
        $lead->save();

        $this->activity->log($lead, 'call', 'Call logged: '.($data['outcome'] ?? 'n/a'), $data['notes'] ?? null, [
            'duration' => $data['duration'] ?? 0,
            'outcome' => $data['outcome'] ?? null,
        ]);
        $this->activity->comm($lead->id, 'call', $data['direction'] ?? 'outbound', $data['outcome'] ?? 'logged');

        return $call;
    }
}
