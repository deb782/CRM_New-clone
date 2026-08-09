<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Lead;
use App\Models\WhatsappBroadcast;
use App\Services\WhatsAppService;
use Illuminate\Http\Request;

class WhatsAppBroadcastController extends Controller
{
    public function index()
    {
        return response()->json(['broadcasts' => WhatsappBroadcast::latest()->limit(100)->get()]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => 'required|string|max:120',
            'body' => 'nullable|string|max:4096',
            'template' => 'nullable|string',
            'audience_type' => 'required|in:all,status,temperature,source',
            'audience_value' => 'nullable|string',
        ]);
        if (empty($data['body']) && empty($data['template'])) {
            return response()->json(['message' => 'Message body or template is required'], 422);
        }
        $data['created_by'] = $request->user()->id;
        $data['recipients'] = $this->audience($data)->count();

        return response()->json(['broadcast' => WhatsappBroadcast::create($data)], 201);
    }

    public function send(WhatsappBroadcast $broadcast, WhatsAppService $wa)
    {
        if ($broadcast->status === 'sent') {
            return response()->json(['message' => 'Broadcast already sent'], 422);
        }
        $broadcast->update(['status' => 'sending']);

        $targets = $this->audience($broadcast->toArray())->get();
        $sent = 0;
        $failed = 0;
        foreach ($targets as $lead) {
            $msg = $wa->send($lead, $broadcast->body ?: "[Template: {$broadcast->template}]", $broadcast->template);
            $msg->status === 'sent' ? $sent++ : $failed++;
        }

        $broadcast->update([
            'status' => 'sent',
            'recipients' => $targets->count(),
            'sent_count' => $sent,
            'failed_count' => $failed,
            'sent_at' => now(),
        ]);

        return response()->json(['broadcast' => $broadcast->fresh(), 'sent' => $sent, 'failed' => $failed, 'total' => $targets->count()]);
    }

    private function audience(array $b)
    {
        $q = Lead::whereNotNull('phone')->where('phone', '!=', '')
            ->where('do_not_contact', false)->where('whatsapp_opt_out', false);

        return match ($b['audience_type']) {
            'status' => $q->where('status', $b['audience_value']),
            'temperature' => $q->where('temperature', $b['audience_value']),
            'source' => $q->where('source', $b['audience_value']),
            default => $q,
        };
    }
}
