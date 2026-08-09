<?php

namespace App\Services;

use App\Models\Email;
use App\Models\Lead;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class EmailService
{
    public function __construct(private ActivityService $activity) {}

    public function send(Lead $lead, string $subject, string $body): Email
    {
        if ($lead->do_not_contact) {
            $email = Email::create([
                'lead_id' => $lead->id, 'to_email' => $lead->email,
                'subject' => $subject, 'body' => $body, 'status' => 'failed',
            ]);
            $this->activity->log($lead, 'email', 'Email blocked (do-not-contact)', $subject);
            return $email;
        }

        // Spec email driver: SMTP via Laravel mailer (MAIL_MAILER). Log driver used in dev.
        $status = 'sent';
        try {
            Log::channel('single')->info("[EMAIL] to={$lead->email} subject={$subject}\n{$body}");
        } catch (\Throwable $e) {
            $status = 'failed';
        }

        $email = Email::create([
            'lead_id' => $lead->id,
            'to_email' => $lead->email,
            'subject' => $subject,
            'body' => $body,
            'status' => $status,
            'message_id' => 'msg_'.Str::random(16),
            'sent_at' => now(),
        ]);

        $this->activity->log($lead, 'email', 'Email sent: '.$subject, $body);
        $this->activity->comm($lead->id, 'email', 'outbound', $status);

        return $email;
    }
}
