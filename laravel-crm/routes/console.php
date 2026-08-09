<?php

use Illuminate\Support\Facades\Schedule;

// crm:automation — process due nurturing steps + automation queue (S)
Schedule::command('crm:automation')->everyMinute()->withoutOverlapping();

// crm:reminders — task/follow-up SLA + escalations (C/F/I)
Schedule::command('crm:reminders')->everyFiveMinutes()->withoutOverlapping();

// crm:webhooks — retry failed webhook/comms deliveries (T2)
Schedule::command('crm:webhooks')->everyTenMinutes()->withoutOverlapping();
