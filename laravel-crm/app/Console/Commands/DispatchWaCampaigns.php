<?php

namespace App\Console\Commands;

use App\Models\WaCampaign;
use App\Services\WaCampaignService;
use Illuminate\Console\Command;

class DispatchWaCampaigns extends Command
{
    protected $signature = 'wa:campaigns:dispatch';
    protected $description = 'Send WhatsApp campaigns whose scheduled time has arrived';

    public function handle(WaCampaignService $svc): int
    {
        $due = WaCampaign::where('status', 'scheduled')->whereNotNull('scheduled_at')->where('scheduled_at', '<=', now())->get();
        foreach ($due as $c) {
            $this->info("Dispatching campaign #{$c->id} — {$c->name}");
            $svc->launch($c);
        }
        $this->info('Done. '.$due->count().' campaign(s) dispatched.');

        return self::SUCCESS;
    }
}
