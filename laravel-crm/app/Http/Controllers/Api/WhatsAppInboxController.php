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
            'type' => 'nullable|in:text,template,image,document,video,interactive',
            'body' => 'nullable|string|max:4096',
            'template' => 'nullable|string',
            'media_url' => 'nullable|string|max:2048',
            'buttons' => 'nullable|array|max:3',
            'buttons.*.title' => 'required_with:buttons|string|max:20',
            'variables' => 'nullable|array|max:20',
            'variables.*' => 'nullable|string|max:500',
        ]);
        $type = $data['type'] ?? 'text';
        if ($type === 'text' && empty($data['body'])) {
            return response()->json(['message' => 'Message body is required'], 422);
        }
        if (in_array($type, ['image', 'document', 'video']) && empty($data['media_url'])) {
            return response()->json(['message' => 'Media URL is required'], 422);
        }
        if ($type === 'template' && empty($data['template'])) {
            return response()->json(['message' => 'Template name is required'], 422);
        }
        if ($type === 'interactive' && (empty($data['body']) || empty($data['buttons']))) {
            return response()->json(['message' => 'Body and at least one button are required'], 422);
        }
        try {
            $msg = $inbox->reply($conversation, $data, $request->user());
        } catch (\DomainException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['message' => $msg, 'conversation' => $this->present($conversation->fresh())]);
    }

    /** Upload an image/document for sending; stored on the public disk (mock-ready; Meta media upload happens at go-live). */
    public function uploadMedia(Request $request)
    {
        $request->validate(['file' => 'required|file|max:16384|mimes:jpg,jpeg,png,webp,pdf,doc,docx,xls,xlsx']);
        $file = $request->file('file');
        $path = $file->store('wa-media', 'public');
        $mime = $file->getMimeType();
        $type = str_starts_with((string) $mime, 'image/') ? 'image' : 'document';

        return response()->json([
            'url' => url(\Illuminate\Support\Facades\Storage::url($path)),
            'type' => $type,
            'name' => $file->getClientOriginalName(),
        ], 201);
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

    /** Inbox analytics for managers: backlog, response time, per-agent volume, 7-day trend. */
    public function analytics()
    {
        $open = WhatsappConversation::where('status', 'open')->count();
        $unreadBacklog = (int) WhatsappConversation::where('unread_count', '>', 0)->count();
        $unreadTotal = (int) WhatsappConversation::sum('unread_count');
        $unassigned = WhatsappConversation::whereNull('assigned_to')->where('status', 'open')->count();

        // Avg first-response time: for each inbound, gap to the first outbound after it in the same conversation.
        $msgs = \App\Models\WhatsappMessage::whereNotNull('conversation_id')
            ->orderBy('conversation_id')->orderBy('id')
            ->get(['conversation_id', 'direction', 'sender_name', 'created_at']);
        $byConv = $msgs->groupBy('conversation_id');
        $gaps = [];
        foreach ($byConv as $list) {
            $pendingInbound = null;
            foreach ($list as $m) {
                if ($m->direction === 'inbound' && ! $pendingInbound) {
                    $pendingInbound = $m->created_at;
                } elseif ($m->direction === 'outbound' && $pendingInbound) {
                    $gaps[] = $pendingInbound->diffInSeconds($m->created_at);
                    $pendingInbound = null;
                }
            }
        }
        $avgResponseMin = count($gaps) ? round((array_sum($gaps) / count($gaps)) / 60, 1) : null;

        $perAgent = \App\Models\WhatsappMessage::where('direction', 'outbound')
            ->selectRaw('sender_name, COUNT(*) as sent')
            ->groupBy('sender_name')->orderByDesc('sent')->limit(20)->get();

        $since = now()->subDays(6)->startOfDay();
        $trend = \App\Models\WhatsappMessage::where('created_at', '>=', $since)
            ->selectRaw("DATE(created_at) as day, direction, COUNT(*) as c")
            ->groupBy('day', 'direction')->get();

        return response()->json([
            'open_conversations' => $open,
            'unread_backlog' => $unreadBacklog,
            'unread_total' => $unreadTotal,
            'unassigned' => $unassigned,
            'avg_response_minutes' => $avgResponseMin,
            'per_agent' => $perAgent,
            'trend' => $trend,
        ]);
    }

    /** Auto-assignment settings (managers). */
    public function settings()
    {
        return response()->json(['settings' => \App\Models\WhatsappSetting::current()]);
    }

    public function updateSettings(Request $request)
    {
        $data = $request->validate(['auto_assign' => 'required|boolean']);
        $s = \App\Models\WhatsappSetting::current();
        $s->update($data);

        return response()->json(['settings' => $s->fresh()]);
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
