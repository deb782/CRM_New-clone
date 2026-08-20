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
        // C1.1 — Verify Lead tasks not started within 2h => escalate to manager
        $slaHours = config('integrations.sla.verify_hours', 2);
        $managerId = \App\Models\User::whereHas('role', fn ($q) => $q->where('slug', 'sales_head'))
            ->where('is_active', true)->value('id')
            ?? \App\Models\User::whereHas('role', fn ($q) => $q->where('slug', 'admin'))->value('id');
        $stale = Task::where('type', 'verify')
            ->where('status', 'open')
            ->where('escalated', false)
            ->where('created_at', '<', now()->subHours($slaHours))
            ->get();

        foreach ($stale as $task) {
            $task->update(['escalated' => true, 'priority' => 'high', 'assigned_to' => $managerId ?: $task->assigned_to]);
            if ($task->lead) {
                $activity->log($task->lead, 'system', 'Verify task escalated to manager (SLA breach > '.$slaHours.'h)');
            }
        }
        $this->info("Escalated {$stale->count()} verify task(s).");

        // Generic overdue follow-up / handover escalation to manager
        $overdue = Task::whereIn('type', ['follow_up', 'callback'])
            ->where('status', 'open')
            ->where('escalated', false)
            ->where('due_at', '<', now())
            ->get();
        foreach ($overdue as $task) {
            $task->update(['escalated' => true, 'priority' => 'high', 'assigned_to' => $managerId ?: $task->assigned_to]);
            if ($task->lead) {
                $activity->log($task->lead, 'system', 'Task escalated to manager (SLA breach): '.$task->title);
            }
        }
        $this->info("Escalated {$overdue->count()} overdue task(s).");

        // I1.3 — Site-visit reminders (admin-configured windows) and no-show detection
        $windows = \App\Models\AppSetting::get('site_visit_reminder_windows', [1440, 60]);
        rsort($windows);
        $maxMin = $windows ? max($windows) : 1440;
        $upcoming = SiteVisit::whereIn('status', ['scheduled', 'confirmed', 'rescheduled'])
            ->whereBetween('scheduled_at', [now(), now()->addMinutes($maxMin)])
            ->with('lead')->get();
        $rSent = 0;
        $human = function (int $min): string {
            if ($min % 1440 === 0) { $d = $min / 1440; return $d.' day'.($d > 1 ? 's' : ''); }
            if ($min % 60 === 0) { $h = $min / 60; return $h.' hour'.($h > 1 ? 's' : ''); }
            return $min.' min';
        };
        foreach ($upcoming as $v) {
            $sent = $v->reminders_sent ?? [];
            $minsAway = now()->diffInMinutes($v->scheduled_at, false);
            $when = $v->scheduled_at->format('D, d M · h:i A');
            foreach ($windows as $w) {
                $tag = 'w'.$w;
                if ($minsAway <= $w && $minsAway >= 0 && ! in_array($tag, $sent) && $v->lead) {
                    $first = explode(' ', trim((string) $v->lead->name))[0] ?: 'there';
                    $mp = $v->meeting_point ?: 'the sales office';
                    $whatsapp->sendAuto($v->lead, "Reminder: your site visit is on {$when} (in about {$human($w)}). Meeting point: {$mp}.", 'site_visit_reminder', [$first, $when, $mp]);
                    if ($v->lead->email && $w >= 240) $email->send($v->lead, 'Reminder: your upcoming site visit', "See you on {$when} at ".($v->meeting_point ?: 'the sales office').".");
                    $sent[] = $tag; $v->update(['reminders_sent' => $sent]); $rSent++;
                }
            }
        }
        $this->info("Sent {$rSent} site-visit reminder(s) across windows: ".implode(', ', $windows).' min.');

        // No-show: past scheduled time + 30m grace, still not completed
        $noShows = SiteVisit::whereIn('status', ['scheduled', 'confirmed', 'rescheduled'])
            ->where('scheduled_at', '<', now()->subMinutes(30))->with('lead')->get();
        foreach ($noShows as $v) {
            $visits->handleNoShow($v);
        }
        $this->info("Processed {$noShows->count()} no-show(s).");

        // N — Document checklist reminders for pending required docs past due
        $pendingDocs = \App\Models\DocumentChecklistItem::where('required', true)
            ->where('status', 'pending')
            ->where('reminded', false)
            ->where('due_at', '<', now())
            ->with('lead')->get();
        foreach ($pendingDocs as $doc) {
            if ($doc->lead) {
                $whatsapp->sendAuto($doc->lead, "Reminder: please share your {$doc->name} to complete your booking documentation.", 'document_reminder', [$doc->lead->name, $doc->name]);
                $activity->log($doc->lead, 'system', 'Document reminder sent', $doc->name);
            }
            $doc->update(['reminded' => true]);
        }
        $this->info("Sent {$pendingDocs->count()} document reminder(s).");

        // P — Milestone payment reminders (30/15/7/1-day + due date) and overdue detection
        $reminderDays = config('integrations.payments.reminder_days', [30, 15, 7, 1]);
        $milestones = \App\Models\PaymentMilestone::whereIn('status', ['pending', 'due', 'partial', 'overdue'])
            ->whereColumn('paid_amount', '<', 'amount')
            ->whereNotNull('due_at')->with('lead')->get();
        $mRem = 0; $mOverdue = 0;
        $demands = app(\App\Services\DemandLetterService::class);
        foreach ($milestones as $m) {
            $sent = $m->reminders_sent ?? [];
            $daysToDue = (int) now()->diffInDays($m->due_at, false);
            if ($daysToDue >= 0) {
                foreach ($reminderDays as $d) {
                    if ($daysToDue <= $d && ! in_array('d'.$d, $sent)) {
                        if ($m->lead) {
                            $whatsapp->sendAuto($m->lead, "Payment reminder: '{$m->label}' of ₹".number_format($m->outstanding())." is due on ".$m->due_at->format('d M Y').".", 'payment_reminder', [$m->lead->name, $m->label, number_format($m->outstanding()), $m->due_at->format('d M Y')]);
                        }
                        $sent[] = 'd'.$d; $mRem++;
                        break;
                    }
                }
                $m->update(['reminders_sent' => $sent]);
            } else {
                // Overdue: friendly pay-link nudge (once) + mark + auto-issue demand letter (Q)
                if ($m->status !== 'overdue') {
                    $m->update(['status' => 'overdue']);
                }
                if (! in_array('nudge', $sent) && $m->lead) {
                    $link = optional($m->booking)->payment_link;
                    $whatsapp->sendAuto($m->lead, "Hi {$m->lead->name}, a gentle reminder — your '{$m->label}' payment of ₹".number_format($m->outstanding())." is now due."
                        .($link ? " You can pay securely here: {$link}" : ' Please reach out to complete it.'), 'payment_overdue', [$m->lead->name, $m->label, number_format($m->outstanding()), $link ?: 'contact us']);
                    $activity->log($m->lead, 'system', 'Overdue payment nudge sent', $m->label);
                    $sent[] = 'nudge';
                    $m->update(['reminders_sent' => $sent]);
                    $mRem++;
                }
                if (! $m->demand_letter_id) {
                    $demands->generateForMilestone($m);
                    $mOverdue++;
                }
            }
        }
        $this->info("Sent {$mRem} milestone reminder(s); issued {$mOverdue} demand letter(s).");

        return self::SUCCESS;
    }
}
