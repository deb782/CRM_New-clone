<?php

namespace App\Http\Controllers\Api\Cp;

use App\Http\Controllers\Controller;
use App\Models\CpTicket;
use App\Models\CpTicketMessage;
use Illuminate\Http\Request;

class TicketController extends Controller
{
    private function cp(Request $r)
    {
        return $r->attributes->get('cp');
    }

    public function index(Request $request)
    {
        $cp = $this->cp($request);
        return response()->json(['data' => CpTicket::where('channel_partner_id', $cp->id)->withCount('messages')->orderByDesc('updated_at')->get()]);
    }

    public function store(Request $request)
    {
        $cp = $this->cp($request);
        $data = $request->validate([
            'subject' => 'required|string|max:200',
            'priority' => 'nullable|in:low,normal,high',
            'body' => 'required|string',
        ]);
        $ticket = CpTicket::create([
            'channel_partner_id' => $cp->id,
            'subject' => $data['subject'],
            'priority' => $data['priority'] ?? 'normal',
            'status' => 'open',
            'last_reply_at' => now(),
        ]);
        CpTicketMessage::create(['cp_ticket_id' => $ticket->id, 'sender_type' => 'partner', 'sender_id' => $cp->id, 'body' => $data['body']]);
        return response()->json(['ticket' => $ticket->load('messages')], 201);
    }

    public function show(Request $request, CpTicket $ticket)
    {
        abort_if($ticket->channel_partner_id !== $this->cp($request)->id, 404);
        return response()->json(['ticket' => $ticket->load('messages')]);
    }

    public function reply(Request $request, CpTicket $ticket)
    {
        $cp = $this->cp($request);
        abort_if($ticket->channel_partner_id !== $cp->id, 404);
        $data = $request->validate(['body' => 'required|string']);
        CpTicketMessage::create(['cp_ticket_id' => $ticket->id, 'sender_type' => 'partner', 'sender_id' => $cp->id, 'body' => $data['body']]);
        $ticket->forceFill(['last_reply_at' => now(), 'status' => $ticket->status === 'resolved' ? 'open' : $ticket->status])->save();
        return response()->json(['ticket' => $ticket->fresh('messages')]);
    }
}
