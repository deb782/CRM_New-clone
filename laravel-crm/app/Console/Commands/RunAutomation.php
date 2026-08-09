<?php

namespace App\Console\Commands;

use App\Models\Lead;
use App\Services\ScoringService;
use App\Services\SequenceService;
use Illuminate\Console\Command;

class RunAutomation extends Command
{
    protected $signature = 'crm:automation';
    protected $description = 'Process due nurturing sequence steps and daily lead re-scoring';

    public function handle(SequenceService $sequences, ScoringService $scoring): int
    {
        $processed = $sequences->processDue();
        $this->info("Processed {$processed} sequence step(s).");

        // Daily recency-driven recalculation (H1.2) — cap per run for load safety
        $rescored = 0;
        Lead::where('is_invalid', false)
            ->where(function ($q) {
                $q->whereNull('updated_at')->orWhere('updated_at', '<', now()->subHours(20));
            })
            ->limit(500)
            ->get()
            ->each(function ($lead) use ($scoring, &$rescored) {
                $scoring->apply($lead);
                $rescored++;
            });
        $this->info("Re-scored {$rescored} lead(s).");

        return self::SUCCESS;
    }
}
