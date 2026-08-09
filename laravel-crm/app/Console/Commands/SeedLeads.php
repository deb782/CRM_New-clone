<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class SeedLeads extends Command
{
    protected $signature = 'crm:seed-leads {count=100000}';
    protected $description = 'Bulk-insert dummy leads for load / performance testing (T3)';

    public function handle(): int
    {
        $count = (int) $this->argument('count');
        $now = now();
        $batch = 2000;
        $temps = ['hot', 'warm', 'cold'];
        $statuses = ['new_lead', 'contacted', 'qualified', 'interested', 'negotiation'];
        $sources = ['Website Form', 'Meta Ads', 'Referral', 'Walk-in', 'Chatbot'];

        $this->info("Seeding {$count} leads...");
        $bar = $this->output->createProgressBar((int) ceil($count / $batch));
        for ($i = 0; $i < $count; $i += $batch) {
            $rows = [];
            $n = min($batch, $count - $i);
            for ($j = 0; $j < $n; $j++) {
                $k = $i + $j;
                $rows[] = [
                    'name' => 'LoadTest Lead '.$k,
                    'email' => 'loadtest'.$k.'@example.com',
                    'phone' => '8'.str_pad((string) $k, 9, '0', STR_PAD_LEFT),
                    'source' => $sources[$k % count($sources)],
                    'status' => $statuses[$k % count($statuses)],
                    'temperature' => $temps[$k % 3],
                    'score' => $k % 100,
                    'created_at' => $now,
                    'updated_at' => $now,
                ];
            }
            DB::table('leads')->insert($rows);
            $bar->advance();
        }
        $bar->finish();
        $this->newLine();
        $this->info('Done. Total leads: '.DB::table('leads')->count());
        return self::SUCCESS;
    }
}
