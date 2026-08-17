<?php

use Illuminate\Support\Facades\Schedule;

// crm:automation — process due nurturing steps + automation queue (S)
Schedule::command('crm:automation')->everyMinute()->withoutOverlapping();

// crm:reminders — task/follow-up SLA + escalations (C/F/I)
Schedule::command('crm:reminders')->everyFiveMinutes()->withoutOverlapping();

// crm:webhooks — retry failed webhook/comms deliveries (T2)
Schedule::command('crm:webhooks')->everyTenMinutes()->withoutOverlapping();

// crm:email-scheduled — dispatch email campaigns whose scheduled time has arrived
Schedule::command('crm:email-scheduled')->everyMinute()->withoutOverlapping();

// crm:flow-run — resume workflow runs whose wait timers elapsed
Schedule::command('crm:flow-run')->everyMinute()->withoutOverlapping();

// wa:campaigns:dispatch — send scheduled WhatsApp campaigns
Schedule::command('wa:campaigns:dispatch')->everyMinute()->withoutOverlapping();

// crm:engagement-nudge — auto WhatsApp appointment nudges (every 2 days until meeting/status change)
Schedule::command('crm:engagement-nudge')->hourly()->withoutOverlapping();
