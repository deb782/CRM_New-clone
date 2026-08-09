<?php

namespace App\Console\Commands;

use App\Services\FlowEngine;
use Illuminate\Console\Command;

class RunFlowEngine extends Command
{
    protected $signature = 'crm:flow-run';
    protected $description = 'Resume workflow runs whose wait timers have elapsed';

    public function handle(FlowEngine $engine): int
    {
        $n = $engine->resumeDue();
        $this->info($n.' workflow run(s) resumed');

        return self::SUCCESS;
    }
}
