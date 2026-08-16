<?php

namespace App\Services;

use App\Models\WaFlow;
use App\Models\WaFlowEvent;

class WaFlowEngine
{
    /** Find the active flow that matches an inbound text (keyword flows first, then default). */
    public function matchFlow(string $text): ?WaFlow
    {
        $text = strtolower(trim($text));
        foreach (WaFlow::where('status', 'active')->where('trigger_type', 'keyword')->get() as $f) {
            foreach (($f->keywords ?? []) as $kw) {
                if ($kw && str_contains($text, strtolower(trim($kw)))) {
                    return $f;
                }
            }
        }

        return WaFlow::where('status', 'active')->where('trigger_type', 'default')->first();
    }

    /** Begin a flow: returns messages + state, auto-advancing through message nodes. */
    public function start(WaFlow $flow, ?int $convId = null, bool $track = false): array
    {
        $graph = $flow->graph ?? [];
        $state = ['node' => $graph['entry'] ?? null, 'data' => []];
        $ctx = $track ? ['flow' => $flow, 'conv' => $convId] : null;
        if ($ctx) {
            $this->track($flow, $convId, 'enter', $graph['entry'] ?? null);
        }

        return $this->run($graph, $state, $ctx);
    }

    /** Advance a flow given the user's input at the current interactive node. */
    public function step(WaFlow $flow, array $state, string $input, ?int $convId = null, bool $track = false): array
    {
        $graph = $flow->graph ?? [];
        $nodes = $graph['nodes'] ?? [];
        $cur = $nodes[$state['node'] ?? ''] ?? null;
        if (! $cur) {
            return ['messages' => [], 'state' => $state, 'done' => true];
        }

        $cfg = $cur['config'] ?? [];
        $next = null;
        $chosen = null;
        $type = $cur['type'] ?? 'message';
        $ctx = $track ? ['flow' => $flow, 'conv' => $convId] : null;

        if ($type === 'buttons' || $type === 'list') {
            $opts = $type === 'buttons' ? ($cfg['buttons'] ?? []) : ($cfg['rows'] ?? []);
            foreach ($opts as $o) {
                if ((string) ($o['id'] ?? '') === $input || strcasecmp(trim($o['label'] ?? ''), trim($input)) === 0) {
                    $next = $o['next'] ?? null;
                    $chosen = (string) ($o['id'] ?? '');
                    break;
                }
            }
            if ($next === null) {
                // invalid choice — re-prompt the same node
                return array_merge($this->run($graph, ['node' => $state['node'], 'data' => $state['data'] ?? []], $ctx), ['invalid' => true]);
            }
            if ($ctx) {
                $this->track($flow, $convId, 'choose', $state['node'], $chosen);
            }
        } elseif ($type === 'capture') {
            $field = $cfg['field'] ?? 'note';
            $state['data'][$field] = $input;
            $next = $cfg['next'] ?? null;
        } else {
            $next = $cfg['next'] ?? null;
        }

        $state['node'] = $next;

        return $this->run($graph, $state, $ctx);
    }

    /** Auto-run from the current node, collecting messages until an interactive node or the end. */
    protected function run(array $graph, array $state, ?array $ctx = null): array
    {
        $nodes = $graph['nodes'] ?? [];
        $messages = [];
        $done = false;
        $action = null;
        $guard = 0;
        $lastKey = null;

        while (($key = $state['node'] ?? null) !== null && $guard++ < 40) {
            $node = $nodes[$key] ?? null;
            if (! $node) {
                $done = true;
                break;
            }
            $type = $node['type'] ?? 'message';
            $cfg = $node['config'] ?? [];
            $lastKey = $key;
            if ($ctx) {
                $this->track($ctx['flow'], $ctx['conv'], 'reach', $key);
            }

            if ($type === 'message') {
                $messages[] = ['type' => 'text', 'text' => $cfg['text'] ?? ''];
                $state['node'] = $cfg['next'] ?? null;

                continue;
            }
            if ($type === 'buttons') {
                $messages[] = [
                    'type' => 'buttons',
                    'text' => $cfg['text'] ?? '',
                    'buttons' => array_map(fn ($b) => ['id' => $b['id'] ?? '', 'label' => $b['label'] ?? ''], $cfg['buttons'] ?? []),
                ];
                break;
            }
            if ($type === 'list') {
                $messages[] = [
                    'type' => 'list',
                    'text' => $cfg['text'] ?? '',
                    'button_label' => $cfg['button_label'] ?? 'Choose',
                    'rows' => array_map(fn ($r) => ['id' => $r['id'] ?? '', 'label' => $r['label'] ?? '', 'description' => $r['description'] ?? ''], $cfg['rows'] ?? []),
                ];
                break;
            }
            if ($type === 'capture') {
                $messages[] = ['type' => 'text', 'text' => $cfg['text'] ?? ''];
                break; // wait for the user's reply
            }
            if ($type === 'handoff') {
                $messages[] = ['type' => 'text', 'text' => $cfg['note'] ?? 'Connecting you to an agent…'];
                if ($ctx) {
                    $this->track($ctx['flow'], $ctx['conv'], 'handoff', $key);
                }
                $done = true;
                $action = 'handoff';
                break;
            }
            // end or unknown
            if (! empty($cfg['text'])) {
                $messages[] = ['type' => 'text', 'text' => $cfg['text']];
            }
            $done = true;
            break;
        }

        if ($done && $ctx) {
            $this->track($ctx['flow'], $ctx['conv'], 'complete', $lastKey);
        }

        return ['messages' => $messages, 'state' => $state, 'done' => $done, 'action' => $action];
    }

    /** Persist an analytics event (best-effort; never breaks the conversation). */
    private function track(?WaFlow $flow, ?int $convId, string $event, ?string $node = null, ?string $option = null): void
    {
        if (! $flow) {
            return;
        }
        try {
            WaFlowEvent::create([
                'flow_id' => $flow->id,
                'conversation_id' => $convId,
                'node_key' => $node,
                'event' => $event,
                'option_id' => $option,
            ]);
        } catch (\Throwable $e) {
            // analytics is non-critical
        }
    }
}
