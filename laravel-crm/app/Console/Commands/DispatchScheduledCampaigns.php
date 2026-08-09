<?php

namespace App\Console\Commands;

use App\Models\EmailCampaign;
use App\Services\CampaignDispatcher;
use Illuminate\Console\Command;

class DispatchScheduledCampaigns extends Command
{
    protected $signature = 'crm:email-scheduled';
    protected $description = 'Send email campaigns whose scheduled time has arrived';

    public function handle(CampaignDispatcher $dispatcher): int
    {
        $due = EmailCampaign::where('status', 'scheduled')
            ->whereNotNull('scheduled_at')
            ->where('scheduled_at', '<=', now())
            ->get();

        foreach ($due as $campaign) {
            $res = $dispatcher->dispatch($campaign);
            $this->info("Campaign #{$campaign->id} '{$campaign->name}': {$res['sent']} sent, {$res['failed']} failed");
        }

        $this->info($due->count().' scheduled campaign(s) dispatched');

        return self::SUCCESS;
    }
}
