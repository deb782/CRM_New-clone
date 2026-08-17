<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\ChannelPartner;
use App\Models\CpDocument;
use App\Models\CpLead;
use App\Models\CpTicket;
use App\Models\CpTicketMessage;
use App\Services\CpAuthService;
use App\Services\CpLeadService;
use App\Services\ObjectStorage;
use Illuminate\Http\Request;

class PartnerAdminController extends Controller
{
    public function __construct(private CpAuthService $auth, private CpLeadService $leadSvc) {}

    // ---- Partners ----
    public function partners(Request $request)
    {
        $q = ChannelPartner::query()->withCount(['cpLeads', 'representatives']);
        if ($status = $request->query('status')) {
            $q->where('status', $status);
        }
        return response()->json(['data' => $q->orderByDesc('created_at')->get()]);
    }

    public function invite(Request $request)
    {
        $data = $request->validate([
            'name' => 'required|string|max:200',
            'company' => 'nullable|string|max:200',
            'contact_name' => 'required|string|max:150',
            'contact_email' => 'required|email|unique:channel_partners,contact_email',
            'contact_designation' => 'nullable|string|max:150',
            'phone' => 'nullable|string|max:20',
            'commission_rate' => 'nullable|numeric|min:0|max:100',
        ]);
        $result = $this->auth->invite($data);
        return response()->json([
            'partner' => $result['partner'],
            'temp_password' => $result['temp_password'],
            'message' => 'Partner invited. Credentials emailed to ' . $data['contact_email'],
        ], 201);
    }

    public function showPartner(ChannelPartner $partner)
    {
        return response()->json(['partner' => $partner->loadCount(['cpLeads', 'representatives'])]);
    }

    public function setStatus(Request $request, ChannelPartner $partner)
    {
        $data = $request->validate(['status' => 'required|in:pending,approved,suspended']);
        $partner->forceFill(['status' => $data['status'], 'active' => $data['status'] === 'approved'])->save();
        return response()->json(['partner' => $partner->fresh()]);
    }

    public function approveKyc(ChannelPartner $partner)
    {
        $partner->forceFill(['kyc_status' => 'approved', 'kyc_approved_at' => now()])->save();
        return response()->json(['partner' => $partner->fresh()]);
    }

    // ---- CP Leads ----
    public function cpLeads(Request $request)
    {
        $q = CpLead::with(['partner:id,cp_code,name', 'representative:id,name', 'project:id,name', 'convertedLead:id,name,status']);
        if ($status = $request->query('status')) {
            if ($status !== 'all') {
                $q->where('status', $status);
            }
        }
        if ($cp = $request->query('channel_partner_id')) {
            $q->where('channel_partner_id', $cp);
        }
        if ($search = $request->query('search')) {
            $s = '%' . $search . '%';
            $q->where(fn ($w) => $w->where('customer_name', 'like', $s)->orWhere('phone', 'like', $s));
        }
        $q->orderByDesc('created_at');
        return response()->json($q->paginate((int) $request->query('per_page', 20)));
    }

    public function acceptCpLead(Request $request, CpLead $cpLead)
    {
        $lead = $this->leadSvc->acceptIntoCrm($cpLead, $request->user()->id);
        return response()->json(['cp_lead' => $lead, 'message' => 'Lead accepted into CRM pipeline']);
    }

    public function rejectCpLead(Request $request, CpLead $cpLead)
    {
        $data = $request->validate(['reason' => 'required|string|max:300']);
        if ($cpLead->status === 'converted') {
            return response()->json(['message' => 'Already accepted into CRM.'], 422);
        }
        $old = $cpLead->status;
        $cpLead->forceFill(['status' => 'rejected', 'admin_notes' => $data['reason']])->save();
        $this->leadSvc->logEvent($cpLead, $old, 'rejected', 'admin', $request->user()->id, $data['reason']);
        return response()->json(['cp_lead' => $cpLead->fresh()]);
    }

    // ---- Documents ----
    public function documents()
    {
        return response()->json(['data' => CpDocument::orderByDesc('created_at')->get()]);
    }

    public function uploadDocument(Request $request, ObjectStorage $storage)
    {
        $request->validate([
            'title' => 'required|string|max:200',
            'category' => 'nullable|string|max:100',
            'file' => 'required|file|max:20480',
        ]);
        $file = $request->file('file');
        $path = 'cp-documents/' . time() . '-' . preg_replace('/[^A-Za-z0-9._-]/', '_', $file->getClientOriginalName());
        $url = $storage->put($path, file_get_contents($file->getRealPath()), $file->getMimeType() ?: 'application/octet-stream');
        $doc = CpDocument::create([
            'title' => $request->input('title'),
            'category' => $request->input('category'),
            'file_path' => $url,
            'active' => true,
            'uploaded_by' => $request->user()->id,
        ]);
        return response()->json(['document' => $doc], 201);
    }

    public function deleteDocument(CpDocument $document)
    {
        $document->delete();
        return response()->json(['message' => 'Deleted']);
    }

    // ---- Tickets ----
    public function tickets(Request $request)
    {
        $q = CpTicket::with('partner:id,cp_code,name')->withCount('messages');
        if ($status = $request->query('status')) {
            $q->where('status', $status);
        }
        return response()->json(['data' => $q->orderByDesc('updated_at')->get()]);
    }

    public function ticket(CpTicket $ticket)
    {
        return response()->json(['ticket' => $ticket->load(['messages', 'partner:id,cp_code,name'])]);
    }

    public function replyTicket(Request $request, CpTicket $ticket)
    {
        $data = $request->validate(['body' => 'required|string', 'status' => 'nullable|in:open,in_progress,resolved,closed']);
        CpTicketMessage::create(['cp_ticket_id' => $ticket->id, 'sender_type' => 'admin', 'sender_id' => $request->user()->id, 'body' => $data['body']]);
        $ticket->forceFill(['last_reply_at' => now(), 'status' => $data['status'] ?? 'in_progress'])->save();
        return response()->json(['ticket' => $ticket->fresh('messages')]);
    }

    public function setTicketStatus(Request $request, CpTicket $ticket)
    {
        $data = $request->validate(['status' => 'required|in:open,in_progress,resolved,closed']);
        $ticket->forceFill(['status' => $data['status']])->save();
        return response()->json(['ticket' => $ticket->fresh()]);
    }
}
