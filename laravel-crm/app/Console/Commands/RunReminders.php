<?php

namespace App\Console\Commands;

use App\Models\Task;
use App\Services\ActivityService;
use Illuminate\Console\Command;

class RunReminders extends Command
{
    protected $signature = 'crm:reminders';
    protected $description = 'Escalate overdue verify tasks and send follow-up reminders (SLA)';

    public function handle(ActivityService $activity): int
    {
        // C1.1 — Verify Lead tasks not started within 2h => escalate
        $slaHours = config('integrations.sla.verify_hours', 2);
        $stale = Task::where('type', 'verify')
            ->where('status', 'open')
            ->where('escalated', false)
            ->where('created_at', '<', now()->subHours($slaHours))
            ->get();

        foreach ($stale as $task) {
            $task->update(['escalated' => true, 'priority' => 'high']);
            if ($task->lead) {
                $activity->log($task->lead, 'system', 'Verify task escalated (SLA breach)');
            }
        }
        $this->info("Escalated {$stale->count()} verify task(s).");

        // Generic overdue follow-up escalation
        $overdue = Task::whereIn('type', ['follow_up', 'callback'])
            ->where('status', 'open')
            ->where('escalated', false)
            ->where('due_at', '<', now()->subHours(1))
            ->get();
        foreach ($overdue as $task) {
            $task->update(['escalated' => true]);
        }
        $this->info("Flagged {$overdue->count()} overdue follow-up(s).");

        return self::SUCCESS;
    }
}
