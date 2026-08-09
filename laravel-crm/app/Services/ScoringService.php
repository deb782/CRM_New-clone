<?php

namespace App\Services;

use App\Models\Lead;
use App\Models\ScoringRule;
use Carbon\Carbon;

class ScoringService
{
    /** Build an evaluation context from the lead + engagement signals (H1.1). */
    public function context(Lead $lead): array
    {
        $lead->loadMissing(['emails', 'whatsappMessages', 'calls']);

        $emailOpens = $lead->emails->whereNotNull('opened_at')->count();
        $emailClicks = $lead->emails->whereNotNull('clicked_at')->count();
        $waResponses = $lead->whatsappMessages->where('direction', 'inbound')->count();
        $callsConnected = $lead->calls->where('outcome', 'connected')->count();

        $daysSince = $lead->last_contacted_at
            ? (int) $lead->last_contacted_at->diffInDays(now())
            : 999;

        return [
            'budget_confirmed' => ($lead->budget_min || $lead->budget_max) ? 1 : 0,
            'timeline_clear' => $lead->timeline && $lead->timeline !== 'later' ? 1 : 0,
            'location_specified' => $lead->preferred_location ? 1 : 0,
            'decision_maker' => $lead->decision_maker ? 1 : 0,
            'interest_level' => $lead->interest_level,
            'source' => $lead->source,
            'contact_verified' => $lead->contact_verified ? 1 : 0,
            'email_opens' => $emailOpens,
            'email_clicks' => $emailClicks,
            'message_responses' => $waResponses,
            'calls_connected' => $callsConnected,
            'contact_attempts' => $lead->contact_attempts,
            'days_since_contact' => $daysSince,
        ];
    }

    /** Recalculate lead score + temperature. Returns breakdown. */
    public function score(Lead $lead): array
    {
        $ctx = $this->context($lead);
        $rules = ScoringRule::where('active', true)->get();

        $breakdown = ['engagement' => 0, 'qualification' => 0, 'responsiveness' => 0, 'recency' => 0, 'source' => 0];

        foreach ($rules as $rule) {
            if ($this->matches($rule, $ctx)) {
                $cat = $rule->category ?: 'engagement';
                $breakdown[$cat] = ($breakdown[$cat] ?? 0) + (int) $rule->points;
            }
        }

        $total = max(0, array_sum($breakdown));
        $temperature = $total >= 70 ? 'hot' : ($total >= 40 ? 'warm' : 'cold');

        return ['total' => $total, 'temperature' => $temperature, 'breakdown' => $breakdown];
    }

    public function apply(Lead $lead): array
    {
        $result = $this->score($lead);
        $lead->forceFill([
            'score' => $result['total'],
            'temperature' => $result['temperature'],
            'engagement_score' => $result['breakdown']['engagement'] ?? 0,
            'qualification_score' => $result['breakdown']['qualification'] ?? 0,
            'responsiveness_score' => $result['breakdown']['responsiveness'] ?? 0,
        ])->save();

        return $result;
    }

    protected function matches(ScoringRule $rule, array $ctx): bool
    {
        $field = $rule->field;
        if (! $field || ! array_key_exists($field, $ctx)) {
            return false;
        }
        $actual = $ctx[$field];
        $expected = $rule->value;
        $op = $rule->operator ?: '=';

        return match ($op) {
            '=' => (string) $actual == (string) $expected,
            '!=' => (string) $actual != (string) $expected,
            '>' => (float) $actual > (float) $expected,
            '>=' => (float) $actual >= (float) $expected,
            '<' => (float) $actual < (float) $expected,
            '<=' => (float) $actual <= (float) $expected,
            'in' => in_array((string) $actual, array_map('trim', explode(',', (string) $expected)), true),
            'exists', 'true' => ! empty($actual),
            default => false,
        };
    }
}
