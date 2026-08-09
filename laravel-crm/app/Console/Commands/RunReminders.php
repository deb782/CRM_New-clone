<?php

namespace App\Console\Commands;

use App\Models\SiteVisit;
use App\Models\Task;
use App\Services\ActivityService;
use App\Services\EmailService;
use App\Services\SiteVisitService;
use App\Services\WhatsAppService;
use Illuminate\Console\Command;

class RunReminders extends Command
{
    protected $signature = 'crm:reminders';
    protected $description = 'Escalate overdue verify tasks and send follow-up + site-visit reminders (SLA)';

    public function handle(ActivityService $activity, SiteVisitService $visits, WhatsAppService $whatsapp, EmailService $email): int
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

        // I1.3 — Site-visit reminders (24h + 1h) and no-show detection
        $upcoming = SiteVisit::whereIn('status', ['scheduled', 'confirmed', 'rescheduled'])
            ->whereBetween('scheduled_at', [now(), now()->addDay()])
            ->with('lead')->get();
        $r24 = 0; $r1 = 0;
        foreach ($upcoming as $v) {
            $sent = $v->reminders_sent ?? [];
            $hoursAway = now()->diffInHours($v->scheduled_at, false);
            $when = $v->scheduled_at->format('D, d M · h:i A');
            if ($hoursAway <= 24 && ! in_array('24h', $sent)) {
                if ($v->lead) {
                    $whatsapp->send($v->lead, "Reminder: your site visit is on {$when}. We're excited to show you the project!");
                    if ($v->lead->email) $email->send($v->lead, 'Reminder: your site visit tomorrow', "See you on {$when} at ".($v->meeting_point ?: 'the sales office').".");
                }
                $sent[] = '24h'; $v->update(['reminders_sent' => $sent]); $r24++;
            }
            if ($hoursAway <= 1 && ! in_array('1h', $sent)) {
                if ($v->lead) $whatsapp->send($v->lead, "Our team will meet you in about an hour at ".($v->meeting_point ?: 'the sales office').". See you soon!");
                $sent[] = '1h'; $v->update(['reminders_sent' => $sent]); $r1++;
            }
        }
        $this->info("Sent {$r24} 24h + {$r1} 1h site-visit reminder(s).");

        // No-show: past scheduled time + 30m grace, still not completed
        $noShows = SiteVisit::whereIn('status', ['scheduled', 'confirmed', 'rescheduled'])
            ->where('scheduled_at', '<', now()->subMinutes(30))->with('lead')->get();
        foreach ($noShows as $v) {
            $visits->handleNoShow($v);
        }
        $this->info("Processed {$noShows->count()} no-show(s).");

        return self::SUCCESS;
    }
}
