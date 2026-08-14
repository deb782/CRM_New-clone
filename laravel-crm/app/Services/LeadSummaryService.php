<?php

namespace App\Services;

use App\Models\Lead;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Process;

class LeadSummaryService
{
    protected string $model = 'gemini-3-flash-preview';

    /** Build a compact context string from the lead's recent conversation + attributes. */
    public function context(Lead $lead): string
    {
        $lines = [];

        $attrs = array_filter([
            'Interest level' => $lead->interest_level,
            'Property type' => $lead->property_type,
            'Preferred location' => $lead->preferred_location,
            'Budget' => $this->budget($lead),
            'Timeline' => $lead->timeline,
            'Financing' => $lead->financing,
            'Main objection' => $lead->primary_objection,
            'Stage' => $lead->status,
            'Notes' => $lead->intent_notes,
        ]);
        foreach ($attrs as $k => $v) {
            $lines[] = $k.': '.$v;
        }

        $wa = $lead->whatsappMessages()->limit(8)->get()->reverse();
        foreach ($wa as $m) {
            $who = $m->direction === 'inbound' ? 'Lead' : 'Agent';
            if (trim((string) $m->body) !== '') {
                $lines[] = 'WhatsApp '.$who.': '.trim($m->body);
            }
        }

        foreach ($lead->calls()->limit(4)->get() as $c) {
            $bits = array_filter([$c->outcome, $c->notes]);
            if ($bits) {
                $lines[] = 'Call ('.($c->direction ?: 'call').'): '.implode(' — ', $bits);
            }
        }

        foreach ($lead->activities()->limit(6)->get() as $a) {
            $bits = array_filter([$a->title, $a->body]);
            if ($bits) {
                $lines[] = 'Activity: '.implode(' — ', $bits);
            }
        }

        return trim(implode("\n", $lines));
    }

    protected function budget(Lead $lead): ?string
    {
        if (! $lead->budget_min && ! $lead->budget_max) {
            return null;
        }

        return trim('₹'.number_format((float) $lead->budget_min).' - ₹'.number_format((float) $lead->budget_max), ' -');
    }

    /** Signature of the lead's conversation state; summary is regenerated only when this changes. */
    public function signature(Lead $lead): string
    {
        $waCount = $lead->whatsappMessages()->count();
        $waLast = $lead->whatsappMessages()->max('id');
        $actCount = $lead->activities()->count();
        $actLast = optional($lead->activities()->first())->id;

        return md5(implode('|', [
            $lead->id, $lead->score, $lead->status,
            $waCount, $waLast, $actCount, $actLast,
            optional($lead->last_contacted_at)->timestamp,
        ]));
    }

    /** Return a cached summary if it is still valid for the current conversation state. */
    public function cached(Lead $lead): ?string
    {
        $meta = $lead->meta ?? [];
        if (($meta['ai_summary_sig'] ?? null) === $this->signature($lead) && ! empty($meta['ai_summary'])) {
            return $meta['ai_summary'];
        }

        return null;
    }

    /**
     * Generate (and cache) summaries for the given leads. Returns [leadId => summary].
     * Leads with a still-valid cached summary are returned without invoking the model.
     */
    public function generate(array $leads): array
    {
        $result = [];
        $pending = [];

        foreach ($leads as $lead) {
            if ($cached = $this->cached($lead)) {
                $result[$lead->id] = $cached;

                continue;
            }
            $ctx = $this->context($lead);
            if ($ctx === '') {
                continue;
            }
            $pending[] = ['id' => $lead->id, 'context' => $ctx, 'lead' => $lead];
        }

        if (! $pending || ! env('EMERGENT_LLM_KEY')) {
            return $result;
        }

        $summaries = $this->invokeModel(array_map(fn ($p) => ['id' => $p['id'], 'context' => $p['context']], $pending));

        foreach ($pending as $p) {
            $lead = $p['lead'];
            $text = $summaries[(string) $p['id']] ?? null;
            if (! $text) {
                continue;
            }
            $meta = $lead->meta ?? [];
            $meta['ai_summary'] = $text;
            $meta['ai_summary_sig'] = $this->signature($lead);
            $meta['ai_summary_at'] = now()->toIso8601String();
            $lead->meta = $meta;
            $lead->saveQuietly();
            $result[$lead->id] = $text;
        }

        return $result;
    }

    protected function invokeModel(array $items): array
    {
        $python = is_file('/root/.venv/bin/python3') ? '/root/.venv/bin/python3' : 'python3';
        $script = base_path('scripts/llm_summarize.py');
        $input = json_encode(['items' => $items, 'model' => $this->model]);

        try {
            $res = Process::timeout(60)
                ->env(['EMERGENT_LLM_KEY' => (string) env('EMERGENT_LLM_KEY')])
                ->input($input)
                ->run([$python, $script]);

            $out = json_decode($res->output(), true);
            if (is_array($out) && isset($out['results']) && is_array($out['results'])) {
                return $out['results'];
            }
            Log::warning('LeadSummary bridge returned unexpected output', ['stderr' => $res->errorOutput(), 'stdout' => substr($res->output(), 0, 500)]);
        } catch (\Throwable $e) {
            Log::warning('LeadSummary bridge failed: '.$e->getMessage());
        }

        return [];
    }
}
