<?php

namespace App\Console\Commands;

use App\Services\EngagementService;
use Illuminate\Console\Command;

class EngagementNudge extends Command
{
    protected $signature = 'crm:engagement-nudge';

    protected $description = 'Send due auto-WhatsApp appointment nudges (every 2 days until the meeting date or a status change).';

    public function handle(EngagementService $engagement): int
    {
        $sent = $engagement->dispatchDue();
        $this->info("Engagement nudges sent: {$sent}");

        return self::SUCCESS;
    }
}
