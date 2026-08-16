<?php

namespace App\Services;

use App\Models\AppSetting;
use App\Models\User;
use App\Models\WaFlow;
use App\Models\WaInboundRule;
use Carbon\Carbon;

class InboundRouter
{
    const KEY = 'wa_inbound';

    public static function defaults(): array
    {
        $hours = [];
        foreach (['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as $d) {
            $hours[$d] = ['on' => ! in_array($d, ['sun']), 'open' => '09:00', 'close' => '18:00'];
        }

        return [
            'office_hours_enabled' => true,
            'hours' => $hours,
            'away_message' => 'Thanks for messaging Agrocorp Realty! 🙏 Our team is offline right now. We\'ll get back to you during business hours (Mon–Sat, 9am–6pm).',
            'auto_assign_mode' => 'round_robin', // off | round_robin | specific
            'auto_assign_agents' => [],
            'rr_pointer' => 0,
        ];
    }

    public static function settings(): array
    {
        return array_merge(self::defaults(), AppSetting::get(self::KEY, []) ?: []);
    }

    protected function withinHours(array $s, Carbon $dt): bool
    {
        $day = strtolower($dt->format('D')); // Mon -> mon
        $day = substr($day, 0, 3);
        $cfg = $s['hours'][$day] ?? null;
        if (! $cfg || empty($cfg['on'])) {
            return false;
        }
        $t = $dt->format('H:i');

        return $t >= ($cfg['open'] ?? '00:00') && $t <= ($cfg['close'] ?? '23:59');
    }

    /**
     * Evaluate an inbound message and return the actions that would fire.
     * $persist=false is used by the in-app test simulator (no round-robin pointer advance).
     */
    public function evaluate(string $text, ?Carbon $dt = null, bool $persist = false): array
    {
        $dt = $dt ?: now();
        $s = self::settings();
        $text = trim($text);
        $lc = strtolower($text);
        $steps = [];
        $out = ['away' => false, 'reply' => null, 'assigned_to' => null, 'assigned_name' => null, 'bot' => null, 'tags' => [], 'steps' => &$steps];

        $off = $s['office_hours_enabled'] && ! $this->withinHours($s, $dt);
        if ($off) {
            $out['away'] = true;
            $out['reply'] = $s['away_message'];
            $steps[] = 'Outside business hours → send away message';
        }

        // keyword rules by priority (skip bot routing when away; still allow assignment)
        $matched = null;
        foreach (WaInboundRule::where('enabled', true)->orderBy('priority')->orderBy('id')->get() as $rule) {
            $hit = false;
            foreach (($rule->keywords ?? []) as $kw) {
                $kw = strtolower(trim($kw));
                if ($kw === '') {
                    continue;
                }
                if (($rule->match_type === 'exact' && $lc === $kw) || ($rule->match_type !== 'exact' && str_contains($lc, $kw))) {
                    $hit = true;
                    break;
                }
            }
            if (! $hit) {
                continue;
            }
            $matched = $rule;
            $steps[] = 'Matched rule "'.$rule->name.'"';
            if ($rule->action === 'reply' && ! $off) {
                $out['reply'] = $rule->reply_text;
            } elseif ($rule->action === 'tag') {
                $out['tags'][] = $rule->tag;
            } elseif ($rule->action === 'bot' && ! $off) {
                $flow = WaFlow::find($rule->flow_id);
                $out['bot'] = $flow ? ['id' => $flow->id, 'name' => $flow->name] : null;
                $steps[] = $flow ? '→ Start bot "'.$flow->name.'"' : '→ (bot not found)';
            } elseif ($rule->action === 'assign' && $rule->assignee_id) {
                $u = User::find($rule->assignee_id);
                $out['assigned_to'] = $rule->assignee_id;
                $out['assigned_name'] = $u?->name;
                $steps[] = '→ Assign to '.($u?->name ?: 'agent');
            }
            break;
        }

        // fallback auto-assignment
        if (! $out['assigned_to'] && ($s['auto_assign_mode'] ?? 'off') !== 'off') {
            $agentIds = ! empty($s['auto_assign_agents'])
                ? $s['auto_assign_agents']
                : User::whereHas('role', fn ($q) => $q->where('department', 'sales'))->pluck('id')->all();
            if ($agentIds) {
                if (($s['auto_assign_mode'] ?? '') === 'round_robin') {
                    $ptr = (int) ($s['rr_pointer'] ?? 0) % count($agentIds);
                    $chosen = $agentIds[$ptr];
                    if ($persist) {
                        AppSetting::set(self::KEY, array_merge($s, ['rr_pointer' => $ptr + 1]));
                    }
                    $steps[] = 'Auto-assign (round-robin)';
                } else {
                    $chosen = $agentIds[0];
                    $steps[] = 'Auto-assign';
                }
                $out['assigned_to'] = $chosen;
                $out['assigned_name'] = User::find($chosen)?->name;
                $steps[] = '→ '.($out['assigned_name'] ?: 'agent');
            }
        }

        if (! $steps) {
            $steps[] = 'No rule matched — message lands in the inbox unassigned';
        }
        $out['matched_rule'] = $matched?->name;

        return $out;
    }
}
