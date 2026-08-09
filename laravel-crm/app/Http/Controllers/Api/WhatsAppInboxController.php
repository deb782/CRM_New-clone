<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Lead;
use App\Models\WhatsappConversation;
use App\Services\InboxService;
use Illuminate\Http\Request;

class WhatsAppInboxController extends Controller
{
    public function conversations(Request $request)
    {
        $q = WhatsappConversation::with(['lead:id,name,status,temperature', 'agent:id,name']);

        if ($request->boolean('mine')) {
            $q->where('assigned_to', $request->user()->id);
        }
        if ($status = $request->query('status')) {
            $q->where('status', $status);
        }
        if ($request->boolean('unread')) {
            $q->where('unread_count', '>', 0);
        }
        if ($search = $request->query('q')) {
            $q->where(fn ($w) => $w->where('contact_name', 'like', "%{$search}%")->orWhere('contact_phone', 'like', "%{$search}%"));
        }

        $items = $q->orderByDesc('last_message_at')->orderByDesc('id')->limit(200)->get()
            ->map(fn ($c) => $this->present($c));

        return response()->json([
            'conversations' => $items,
            'unread_total' => WhatsappConversation::sum('unread_count'),
            'agents' => \App\Models\User::where('is_active', true)->get(['id', 'name']),
        ]);
    }

    public function messages(WhatsappConversation $conversation)
    {
        $conversation->load(['lead:id,name,status,temperature,phone,do_not_contact,whatsapp_opt_out', 'agent:id,name']);

        return response()->json([
            'conversation' => $this->present($conversation),
            'within_window' => $conversation->withinWindow(),
            'messages' => $conversation->messages()->get(),
        ]);
    }

    public function reply(Request $request, WhatsappConversation $conversation, InboxService $inbox)
    {
        $data = $request->validate([
            'type' => 'nullable|in:text,template',
            'body' => 'nullable|string|max:4096',
            'template' => 'nullable|string',
        ]);
        if (empty($data['body']) && empty($data['template'])) {
            return response()->json(['message' => 'Message body or template is required'], 422);
        }
        try {
            $msg = $inbox->reply($conversation, $data, $request->user());
        } catch (\DomainException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['message' => $msg, 'conversation' => $this->present($conversation->fresh())]);
    }

    public function assign(Request $request, WhatsappConversation $conversation)
    {
        $data = $request->validate(['assigned_to' => 'nullable|exists:users,id']);
        $conversation->update(['assigned_to' => $data['assigned_to'] ?? null]);

        return response()->json(['conversation' => $this->present($conversation->fresh()->load('agent:id,name'))]);
    }

    public function read(WhatsappConversation $conversation, InboxService $inbox)
    {
        $inbox->markRead($conversation);

        return response()->json(['conversation' => $this->present($conversation->fresh())]);
    }

    public function toggle(WhatsappConversation $conversation)
    {
        $conversation->update(['status' => $conversation->status === 'open' ? 'closed' : 'open']);

        return response()->json(['conversation' => $this->present($conversation->fresh())]);
    }

    /** Mock/testing tool: inject a fake inbound message so the inbox can be exercised without live Meta webhooks. */
    public function simulateInbound(Request $request, InboxService $inbox)
    {
        $data = $request->validate([
            'lead_id' => 'required|exists:leads,id',
            'body' => 'required|string|max:1000',
        ]);
        $lead = Lead::findOrFail($data['lead_id']);
        $conv = $inbox->getOrCreateForLead($lead);
        $inbox->recordInbound($conv, $data['body']);
        $auto = $inbox->runAutoReplies($conv, $data['body']);

        return response()->json([
            'conversation' => $this->present($conv->fresh()),
            'auto_reply' => $auto,
        ], 201);
    }

    private function present(WhatsappConversation $c): array
    {
        return [
            'id' => $c->id,
            'lead_id' => $c->lead_id,
            'contact_name' => $c->contact_name ?: ($c->lead?->name ?? $c->contact_phone),
            'contact_phone' => $c->contact_phone,
            'status' => $c->status,
            'unread_count' => $c->unread_count,
            'assigned_to' => $c->assigned_to,
            'agent' => $c->relationLoaded('agent') && $c->agent ? ['id' => $c->agent->id, 'name' => $c->agent->name] : null,
            'lead' => $c->relationLoaded('lead') && $c->lead ? ['id' => $c->lead->id, 'name' => $c->lead->name, 'status' => $c->lead->status, 'temperature' => $c->lead->temperature] : null,
            'last_message_preview' => $c->last_message_preview,
            'last_message_at' => $c->last_message_at,
            'within_window' => $c->withinWindow(),
        ];
    }
}
