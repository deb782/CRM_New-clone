<?php

namespace App\Services;

use App\Models\Activity;
use App\Models\CommunicationLog;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Auth;

class ActivityService
{
    public function log(Model $subject, string $type, string $title, ?string $body = null, array $meta = []): Activity
    {
        return Activity::create([
            'subject_type' => $subject::class,
            'subject_id' => $subject->getKey(),
            'user_id' => Auth::id(),
            'type' => $type,
            'title' => $title,
            'body' => $body,
            'meta' => $meta ?: null,
        ]);
    }

    public function comm(int $leadId, string $channel, string $direction, string $status, array $meta = []): void
    {
        CommunicationLog::create([
            'lead_id' => $leadId,
            'channel' => $channel,
            'direction' => $direction,
            'status' => $status,
            'meta' => $meta ?: null,
        ]);
    }
}
