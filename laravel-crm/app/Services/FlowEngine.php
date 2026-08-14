<?php

namespace App\Services;

use App\Models\Lead;
use App\Models\LeadStatus;
use App\Models\PipelineStage;
use App\Models\Task;
use App\Models\Workflow;
use App\Models\WorkflowRun;
use Illuminate\Support\Facades\Log;

class FlowEngine
{
    private const MAX_STEPS = 60;

    /**
     * Move a lead to a status from the catalog, enforcing allow-listed transitions,
     * mandatory gates and SLA clocks. When $enforce is false (automation), a blocked
     * gate/transition is logged and skipped instead of failing.
     */
    public function applyStatus(Lead $lead, string $code, bool $enforce, ?int $actorId = null, ?string $reason = null): array
    {
        $target = LeadStatus::where('code', $code)->first();
        if (! $target) {
            return ['ok' => false, 'message' => 'Unknown status "'.$code.'".'];
        }
        $current = $lead->status_code ? LeadStatus::where('code', $lead->status_code)->first() : null;

        // Allow-listed transition check (first move from a blank status is always allowed).
        if ($enforce && $current && $current->code !== $code) {
            $allowed = $current->allowed_next ?? [];
            if (! in_array($code, $allowed, true)) {
                return ['ok' => false, 'message' => 'Cannot move from "'.$current->display_name.'" to "'.$target->display_name.'". Allowed next: '.(empty($allowed) ? 'none' : implode(', ', $allowed)).'.'];
            }
        }

        // Mandatory gate check.
        $missing = [];
        foreach (($target->gate_fields ?? []) as $field) {
            if (blank($lead->{$field})) { $missing[] = $field; }
        }
        if ($enforce && $missing) {
            return ['ok' => false, 'gate' => $missing, 'message' => 'Cannot enter "'.$target->display_name.'" — required first: '.implode(', ', $missing).'.'];
        }

        $lead->status_code = $target->code;
        if ($target->pipeline_slug && ($stage = PipelineStage::where('slug', $target->pipeline_slug)->first())) {
            $lead->pipeline_stage_id = $stage->id;
            $lead->status = $stage->slug;
        }
        $lead->status_sla_due_at = $target->sla_minutes ? now()->addMinutes($target->sla_minutes) : null;
        $lead->save();

        try {
            \App\Models\AuditLog::create([
                'auditable_type' => Lead::class, 'auditable_id' => $lead->id,
                'action' => 'status_change', 'user_id' => $actorId,
                'field' => 'status_code', 'old_value' => $current?->code, 'new_value' => $code,
                'reason' => $reason,
            ]);
        } catch (\Throwable $e) { /* audit is best-effort */ }

        return ['ok' => true, 'message' => 'Status → '.$target->display_name.($missing && ! $enforce ? ' (gate fields missing: '.implode(', ', $missing).')' : '')];
    }

    /** External event happened — start any matching active workflows. */
    public function trigger(string $event, Lead $lead, array $ctx = []): void
    {
        foreach (Workflow::where('status', 'active')->get() as $wf) {
            foreach ($this->nodes($wf) as $id => $node) {
                if (($node['data']['node_type'] ?? null) !== 'trigger') {
                    continue;
                }
                if ($this->triggerMatches($node['data'], $event, $ctx)) {
                    $this->startRun($wf, (string) $id, $lead, false);
                }
            }
        }
    }

    /** Manually run an active/draft workflow against a lead (for testing/demo). */
    public function simulate(Workflow $wf, Lead $lead): WorkflowRun
    {
        $triggerId = null;
        foreach ($this->nodes($wf) as $id => $node) {
            if (($node['data']['node_type'] ?? null) === 'trigger') { $triggerId = (string) $id; break; }
        }
        if (! $triggerId) {
            // no trigger — start from the first node
            $triggerId = (string) array_key_first($this->nodes($wf));
        }

        return $this->startRun($wf, $triggerId, $lead, true);
    }

    /** Resume waiting runs whose timer elapsed (called by scheduler). */
    public function resumeDue(): int
    {
        $runs = WorkflowRun::where('status', 'waiting')->whereNotNull('resume_at')->where('resume_at', '<=', now())->get();
        foreach ($runs as $run) {
            $wf = Workflow::find($run->workflow_id);
            $lead = Lead::find($run->lead_id);
            if (! $wf || ! $lead) {
                $log = $run->log ?? [];
                $log[] = ['node' => $run->current_node, 'type' => 'system', 'detail' => 'Run failed: '.(! $wf ? 'workflow' : 'lead').' no longer exists', 'at' => now()->toDateTimeString()];
                $run->update(['status' => 'failed', 'log' => $log]);
                continue;
            }
            // continue from the node AFTER the wait node
            $node = $this->nodes($wf)[$run->current_node] ?? null;
            $next = $node ? $this->nextNode($node, 'output_1') : null;
            $this->walk($run, $wf, $lead, $next, $run->log ?? []);
        }

        return $runs->count();
    }

    // ---- internals ----
    private function nodes(Workflow $wf): array
    {
        return (array) data_get($wf->graph, 'drawflow.Home.data', []);
    }

    private function triggerMatches(array $data, string $event, array $ctx): bool
    {
        $tt = $data['trigger_type'] ?? 'new_lead';
        if ($event === 'new_lead') {
            return $tt === 'new_lead';
        }
        if ($event === 'status_enter') {
            return $tt === 'status_enter' && $this->norm($data['status'] ?? '') === $this->norm($ctx['status'] ?? '');
        }

        return false;
    }

    private function startRun(Workflow $wf, string $triggerId, Lead $lead, bool $sim): WorkflowRun
    {
        $run = WorkflowRun::create([
            'workflow_id' => $wf->id, 'lead_id' => $lead->id,
            'status' => 'running', 'current_node' => $triggerId, 'log' => [], 'simulated' => $sim,
        ]);
        $this->walk($run, $wf, $lead, $triggerId, []);

        return $run->fresh();
    }

    private function walk(WorkflowRun $run, Workflow $wf, Lead $lead, ?string $nodeId, array $log): void
    {
        $graph = $this->nodes($wf);
        $steps = 0;
        while ($nodeId !== null && isset($graph[$nodeId]) && $steps < self::MAX_STEPS) {
            $steps++;
            $node = $graph[$nodeId];
            $type = $node['data']['node_type'] ?? 'unknown';
            $res = $this->execute($type, $node['data'], $lead, $run->simulated);
            $log[] = ['node' => $nodeId, 'type' => $type, 'detail' => $res['detail'], 'at' => now()->toDateTimeString()];

            if ($type === 'wait') {
                $run->update(['status' => 'waiting', 'current_node' => $nodeId, 'resume_at' => $res['resume_at'], 'log' => $log]);
                return;
            }
            $nodeId = $this->nextNode($node, $res['output'] ?? 'output_1');
        }
        if ($steps >= self::MAX_STEPS) {
            $log[] = ['node' => $nodeId, 'type' => 'system', 'detail' => 'Stopped: step limit ('.self::MAX_STEPS.') reached — possible loop', 'at' => now()->toDateTimeString()];
            $run->update(['status' => 'failed', 'current_node' => $nodeId, 'log' => $log]);
            return;
        }
        $run->update(['status' => 'completed', 'current_node' => null, 'log' => $log, 'completed_at' => now()]);
    }

    private function nextNode(array $node, string $outputKey): ?string
    {
        $conn = data_get($node, 'outputs.'.$outputKey.'.connections.0.node');

        return $conn !== null ? (string) $conn : null;
    }

    private function execute(string $type, array $d, Lead $lead, bool $sim): array
    {
        $prefix = $sim ? '[SIM] ' : '';
        switch ($type) {
            case 'trigger':
                return ['detail' => 'Flow triggered', 'output' => 'output_1'];

            case 'status_change':
                $code = $d['status_code'] ?? $d['status'] ?? '';
                if ($code && LeadStatus::where('code', $code)->exists()) {
                    if (! $sim) {
                        $res = $this->applyStatus($lead, $code, false);
                        return ['detail' => $prefix.$res['message'], 'output' => 'output_1'];
                    }
                    return ['detail' => $prefix.'Set status → '.$code, 'output' => 'output_1'];
                }
                // legacy fallback: map a free label to a pipeline stage
                $slug = $this->slugFor($d['status'] ?? '');
                if ($slug && ($stage = PipelineStage::where('slug', $slug)->first())) {
                    if (! $sim) { $lead->pipeline_stage_id = $stage->id; $lead->status = $stage->slug; $lead->save(); }
                    return ['detail' => 'Set status → '.($d['status'] ?? $slug), 'output' => 'output_1'];
                }
                return ['detail' => 'Status "'.($d['status'] ?? '?').'" (no matching status — skipped)', 'output' => 'output_1'];

            case 'task':
                if (! $sim) {
                    Task::create([
                        'lead_id' => $lead->id,
                        'assigned_to' => $lead->owner_id,
                        'title' => $d['title'] ?? 'Workflow task',
                        'type' => $d['task_type'] ?? 'call',
                        'description' => 'Auto-created by workflow',
                        'due_at' => now()->addHours((int) ($d['due_hours'] ?? 2)),
                        'priority' => 'medium',
                    ]);
                }
                return ['detail' => $prefix.'Created task "'.($d['title'] ?? 'task').'" (due in '.($d['due_hours'] ?? 0).'h)', 'output' => 'output_1'];

            case 'send_whatsapp':
                Log::info('[FlowEngine] '.$prefix.'send WhatsApp template '.($d['template'] ?? '').' to lead '.$lead->id);
                return ['detail' => $prefix.'Sent WhatsApp template "'.($d['template'] ?: 'unnamed').'"'.(($d['attach_pdf'] ?? false) ? ' (+PDF)' : ''), 'output' => 'output_1'];

            case 'send_email':
                Log::info('[FlowEngine] '.$prefix.'send Email template '.($d['template'] ?? '').' to lead '.$lead->id);
                return ['detail' => $prefix.'Sent Email template "'.($d['template'] ?: 'unnamed').'"'.(($d['attach_pdf'] ?? false) ? ' (+PDF)' : ''), 'output' => 'output_1'];

            case 'wait':
                $amount = (int) ($d['amount'] ?? 1);
                $unit = $d['unit'] ?? 'days';
                $resume = match ($unit) {
                    'minutes' => now()->addMinutes($amount),
                    'hours' => now()->addHours($amount),
                    default => now()->addDays($amount),
                };
                return ['detail' => 'Waiting '.$amount.' '.$unit, 'resume_at' => $resume];

            case 'condition':
                $ok = $this->evalCondition($d, $lead);
                return ['detail' => 'Condition '.($d['field'] ?? '?').' '.($d['operator'] ?? '=').' '.($d['value'] ?? '?').' → '.($ok ? 'YES' : 'NO'), 'output' => $ok ? 'output_1' : 'output_2'];

            case 'fallback':
                return ['detail' => 'Fallback: '.($d['action'] ?? 'noop'), 'output' => 'output_1'];

            default:
                return ['detail' => 'Skipped node', 'output' => 'output_1'];
        }
    }

    private function evalCondition(array $d, Lead $lead): bool
    {
        $field = $d['field'] ?? '';
        $val = match ($field) {
            'temperature' => $lead->temperature,
            'source' => $lead->source,
            'status' => $lead->status,
            'score' => $lead->score,
            default => null,
        };
        $target = $d['value'] ?? '';
        $op = $d['operator'] ?? '=';
        if (in_array($op, ['>', '<'], true)) {
            return $op === '>' ? ((float) $val > (float) $target) : ((float) $val < (float) $target);
        }
        $eq = $this->norm((string) $val) === $this->norm((string) $target);

        return $op === '!=' ? ! $eq : $eq;
    }

    private function norm(string $s): string
    {
        return strtolower(trim(str_replace([' ', '-'], '_', $s)));
    }

    private function slugFor(string $label): ?string
    {
        $n = $this->norm($label);
        if ($n === '') {
            return null;
        }
        // exact slug match first, else normalized label match against pipeline stage names
        if (PipelineStage::where('slug', $n)->exists()) {
            return $n;
        }
        $stage = PipelineStage::all()->first(fn ($s) => $this->norm($s->name) === $n || $this->norm($s->slug) === $n);

        return $stage?->slug;
    }
}
