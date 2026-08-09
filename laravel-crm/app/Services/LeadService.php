<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\Lead;
use App\Models\PipelineStage;
use App\Models\Task;
use App\Models\User;
use Illuminate\Support\Facades\Auth;

class LeadService
{
    public function __construct(
        private DuplicateService $duplicates,
        private ScoringService $scoring,
        private ActivityService $activity,
        private AuditService $audit,
        private EmailService $email,
        private WhatsAppService $whatsapp,
        private SequenceService $sequences,
        private AutomationService $automation,
    ) {}

    /**
     * Capture a new lead from any channel (A1). Handles routing, ack, verify task, automation.
     */
    public function capture(array $data, bool $force = false): array
    {
        $dupe = $this->duplicates->detect($data['email'] ?? null, $data['phone'] ?? null, $data['name'] ?? null);
        if ($dupe['block'] && ! $force) {
            return ['status' => 'duplicate', 'duplicate' => $dupe];
        }

        $stage = PipelineStage::where('slug', 'new_lead')->first();
        $ownerId = $this->assignOwner();

        // R — concurrency-safe de-dup: normalized key + unique index catch.
        // A manual force-create bypasses the guard (key left null).
        $key = $force ? null : $this->dedupeKey($data['phone'] ?? null, $data['email'] ?? null);
        try {
            $lead = Lead::create(array_merge([
                'source' => 'Website Form',
                'pipeline_stage_id' => $stage?->id,
                'status' => 'new_lead',
                'owner_id' => $ownerId,
                'dedupe_key' => $key,
            ], $this->fillable($data)));
        } catch (\Illuminate\Database\QueryException $e) {
            // Another concurrent request won the race — return the existing lead
            if ($key && $existing = Lead::where('dedupe_key', $key)->first()) {
                return ['status' => 'duplicate', 'duplicate' => ['block' => true, 'reason' => 'concurrent', 'lead' => $existing], 'lead' => $existing];
            }
            throw $e;
        }

        $this->audit($lead, 'created', null, null, $lead->name, 'lead captured via '.$lead->source);
        $this->activity->log($lead, 'system', 'Lead captured', 'Source: '.$lead->source);

        // Auto-acknowledgement <= 5 min (A / E1.1)
        if ($lead->email) {
            $this->email->send($lead, 'Thanks for your interest', "Hi {$lead->name}, thanks for reaching out. Our team will contact you shortly.");
        }
        $lead->acknowledged_at = now();
        $lead->save();

        // Verify Lead task same-day (C1.1)
        Task::create([
            'lead_id' => $lead->id,
            'assigned_to' => $ownerId,
            'title' => 'Verify Lead: '.$lead->name,
            'type' => 'verify',
            'description' => "Verify contact details. Phone: {$lead->phone}, Email: {$lead->email}",
            'due_at' => now()->endOfDay(),
            'priority' => 'high',
        ]);

        $this->automation->fire('lead.created', $lead);
        try { app(\App\Services\FlowEngine::class)->trigger('new_lead', $lead->fresh()); } catch (\Throwable $e) { \Log::warning('FlowEngine new_lead: '.$e->getMessage()); }

        return ['status' => 'created', 'lead' => $lead->fresh()];
    }

    /** Qualification + scoring (D). */
    public function qualify(Lead $lead, array $data): Lead
    {
        $original = $lead->getOriginal();
        $lead->fill($this->fillable($data));
        $lead->save();
        $this->audit->recordChanges($lead, $original, [
            'interest_level', 'budget_min', 'budget_max', 'preferred_location',
            'property_type', 'timeline', 'financing', 'decision_maker',
        ], 'qualification update');

        $result = $this->scoring->apply($lead);
        $this->activity->log($lead, 'system', "Scored {$result['total']} ({$result['temperature']})", null, $result['breakdown']);

        // Move to Contacted if still new
        if (optional($lead->stage)->slug === 'new_lead') {
            $this->transition($lead, 'contacted', 'auto after qualification');
        }

        // Temperature-based nurturing (E1.3)
        $this->sequences->enroll($lead->fresh(), $result['temperature']);

        return $lead->fresh();
    }

    /** Status transition engine (G). */
    public function transition(Lead $lead, string $toSlug, ?string $reason = null, bool $force = false): Lead
    {
        $to = PipelineStage::where('slug', $toSlug)->firstOrFail();
        $from = $lead->stage;

        // Manager approval for downgrades (G1.4)
        if ($from && $to->sort_order < $from->sort_order && ! $force) {
            $user = Auth::user();
            if ($user && ! $user->hasPermission('leads.override')) {
                abort(403, 'Manager approval required for status downgrade.');
            }
        }

        $oldSlug = $from?->slug;
        $lead->pipeline_stage_id = $to->id;
        $lead->status = $to->slug;
        $lead->save();

        AuditLog::create([
            'auditable_type' => Lead::class,
            'auditable_id' => $lead->id,
            'user_id' => Auth::id(),
            'action' => 'status_changed',
            'field' => 'status',
            'old_value' => $oldSlug,
            'new_value' => $to->slug,
            'reason' => $reason,
        ]);
        $this->activity->log($lead, 'status_change', "Status: {$oldSlug} → {$to->slug}", $reason);

        // Auto-pause nurturing on negative/won terminal stages (E)
        if ($to->is_lost || in_array($to->slug, ['not_interested', 'do_not_contact'])) {
            $this->sequences->pause($lead, 'status: '.$to->slug);
        }

        $this->automation->fire('status.changed', $lead, ['from' => $oldSlug, 'to' => $to->slug, 'status' => $to->slug]);
        try { app(\App\Services\FlowEngine::class)->trigger('status_enter', $lead->fresh(), ['status' => $to->slug]); } catch (\Throwable $e) { \Log::warning('FlowEngine status_enter: '.$e->getMessage()); }

        return $lead->fresh();
    }

    /** Mark contact verified (C1.4). */
    public function verifyContact(Lead $lead, array $data): Lead
    {
        $original = $lead->getOriginal();
        $lead->fill($this->fillable($data));
        $lead->contact_verified = true;
        $lead->verified_at = now();
        $lead->verified_by = Auth::id();
        $lead->save();
        $this->audit->recordChanges($lead, $original, ['phone', 'email', 'alt_phone', 'alt_email']);
        $this->audit($lead, 'updated', 'contact_verified', '0', '1', 'contact verified');
        $this->activity->log($lead, 'system', 'Contact verified');
        return $lead->fresh();
    }

    /** Round-robin owner assignment among pre-sales execs (A routing). */
    protected function assignOwner(): ?int
    {
        $execs = User::whereHas('role', fn ($q) => $q->whereIn('slug', ['sales_bde', 'sales_bdm']))
            ->where('is_active', true)->pluck('id');
        if ($execs->isEmpty()) {
            return User::whereHas('role', fn ($q) => $q->where('slug', 'admin'))->value('id');
        }
        $last = Lead::max('owner_id');
        $pos = $execs->search($last);
        $next = $pos === false ? 0 : ($pos + 1) % $execs->count();
        return $execs[$next];
    }

    protected function audit(Lead $lead, string $action, ?string $field, $old, $new, ?string $reason = null): void
    {
        AuditLog::create([
            'auditable_type' => Lead::class,
            'auditable_id' => $lead->id,
            'user_id' => Auth::id(),
            'action' => $action,
            'field' => $field,
            'old_value' => $old,
            'new_value' => $new,
            'reason' => $reason,
        ]);
    }

    protected function fillable(array $data): array
    {
        $keys = [
            'contact_id', 'name', 'email', 'phone', 'alt_phone', 'alt_email', 'source', 'campaign',
            'ad_set', 'city', 'project_id', 'interest_level', 'budget_min', 'budget_max',
            'preferred_location', 'property_type', 'timeline', 'financing', 'decision_maker',
            'primary_objection', 'objection_severity', 'intent_notes', 'comm_preference',
            'whatsapp_opt_out', 'do_not_contact', 'is_invalid', 'invalid_reason', 'owner_id', 'next_follow_up_at',
        ];
        return array_intersect_key($data, array_flip($keys));
    }

    /** R — normalized de-dup key: last-10 phone digits, else lowercased email. */
    public function dedupeKey(?string $phone, ?string $email): ?string
    {
        if ($phone) {
            $digits = preg_replace('/\D+/', '', $phone);
            if (strlen($digits) >= 10) {
                return 'p:'.substr($digits, -10);
            }
        }
        if ($email) {
            return 'e:'.strtolower(trim($email));
        }
        return null;
    }

    /** R — switch a lead's interest to a competing/other project (keeps history). */
    public function switchProject(Lead $lead, int $projectId, ?string $reason = null): Lead
    {
        $from = $lead->project_id;
        $lead->project_id = $projectId;
        $lead->save();
        $this->audit($lead, 'updated', 'project_id', (string) $from, (string) $projectId, $reason ?: 'project switch');
        $this->activity->log($lead, 'system', 'Project switched', $reason);
        return $lead->fresh();
    }
}
