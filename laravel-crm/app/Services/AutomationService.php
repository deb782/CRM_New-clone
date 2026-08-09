<?php

namespace App\Services;

use App\Models\AutomationLog;
use App\Models\AutomationRule;
use App\Models\Lead;
use App\Models\Task;

class AutomationService
{
    /**
     * Fire all active rules bound to an event for a lead (S1/S2).
     */
    public function fire(string $event, Lead $lead, array $context = []): void
    {
        $rules = AutomationRule::where('active', true)->where('event', $event)->get();

        foreach ($rules as $rule) {
            if (! $this->conditionsMet($rule->conditions ?? [], $lead, $context)) {
                continue;
            }
            foreach (($rule->actions ?? []) as $action) {
                $this->run($rule, $lead, $action, $context);
            }
        }
    }

    protected function conditionsMet(array $conditions, Lead $lead, array $context): bool
    {
        foreach ($conditions as $field => $expected) {
            $actual = $context[$field] ?? $lead->{$field} ?? null;
            if (is_array($expected)) {
                if (! in_array($actual, $expected, true)) {
                    return false;
                }
            } elseif ((string) $actual !== (string) $expected) {
                return false;
            }
        }
        return true;
    }

    protected function run(AutomationRule $rule, Lead $lead, array $action, array $context): void
    {
        $type = $action['type'] ?? null;
        try {
            switch ($type) {
                case 'create_task':
                    Task::create([
                        'lead_id' => $lead->id,
                        'assigned_to' => $lead->owner_id,
                        'title' => $action['title'] ?? 'Follow-up',
                        'type' => $action['task_type'] ?? 'follow_up',
                        'due_at' => now()->addHours((int) ($action['due_in_hours'] ?? 24)),
                        'priority' => $action['priority'] ?? 'normal',
                    ]);
                    break;

                case 'send_email':
                    app(EmailService::class)->send($lead, $action['subject'] ?? 'Update', $this->render($action['body'] ?? '', $lead));
                    break;

                case 'send_whatsapp':
                    app(WhatsAppService::class)->send($lead, $this->render($action['body'] ?? '', $lead));
                    break;

                case 'enroll_sequence':
                    app(SequenceService::class)->enroll($lead, $action['temperature'] ?? null);
                    break;

                case 'pause_sequence':
                    app(SequenceService::class)->pause($lead, $action['reason'] ?? 'automation');
                    break;

                default:
                    // notify / segment tags are logged only
                    break;
            }

            $this->log($rule, $lead, $rule->event, $type ?? 'unknown', 'success');
        } catch (\Throwable $e) {
            $this->log($rule, $lead, $rule->event, $type ?? 'unknown', 'failed', $e->getMessage());
        }
    }

    protected function render(string $body, Lead $lead): string
    {
        return strtr($body, ['{{name}}' => $lead->name, '{{project}}' => optional($lead->project)->name ?? 'our projects']);
    }

    protected function log(?AutomationRule $rule, Lead $lead, string $event, string $action, string $status, ?string $message = null): void
    {
        AutomationLog::create([
            'rule_id' => $rule?->id,
            'lead_id' => $lead->id,
            'event' => $event,
            'action' => $action,
            'status' => $status,
            'message' => $message,
            'executed_at' => now(),
        ]);
    }
}
