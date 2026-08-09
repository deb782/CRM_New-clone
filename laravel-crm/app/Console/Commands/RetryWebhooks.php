<?php

namespace App\Console\Commands;

use App\Models\Email;
use App\Models\WhatsappMessage;
use Illuminate\Console\Command;

class RetryWebhooks extends Command
{
    protected $signature = 'crm:webhooks';
    protected $description = 'Retry failed outbound comms / webhook deliveries (T2)';

    public function handle(): int
    {
        // Retry failed emails (mark queued for reprocessing) — capped
        $emails = Email::where('status', 'failed')->limit(100)->get();
        foreach ($emails as $email) {
            $email->update(['status' => 'queued']);
        }

        $wa = WhatsappMessage::where('status', 'failed')->whereNotNull('provider_id')->limit(100)->get();
        foreach ($wa as $msg) {
            $msg->update(['status' => 'queued']);
        }

        $this->info("Requeued {$emails->count()} email(s), {$wa->count()} whatsapp message(s).");
        return self::SUCCESS;
    }
}
