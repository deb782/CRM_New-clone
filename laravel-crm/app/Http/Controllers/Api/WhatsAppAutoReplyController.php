<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\WhatsappAutoReply;
use Illuminate\Http\Request;

class WhatsAppAutoReplyController extends Controller
{
    public function index()
    {
        return response()->json(['rules' => WhatsappAutoReply::latest()->get()]);
    }

    public function store(Request $request)
    {
        return response()->json(['rule' => WhatsappAutoReply::create($this->data($request))], 201);
    }

    public function update(Request $request, WhatsappAutoReply $auto_reply)
    {
        $auto_reply->update($this->data($request));

        return response()->json(['rule' => $auto_reply->fresh()]);
    }

    public function destroy(WhatsappAutoReply $auto_reply)
    {
        $auto_reply->delete();

        return response()->json(['ok' => true]);
    }

    private function data(Request $request): array
    {
        $data = $request->validate([
            'name' => 'required|string|max:120',
            'keyword' => 'required|string|max:120',
            'match_type' => 'required|in:contains,exact,starts',
            'reply_body' => 'nullable|string|max:4096',
            'reply_template' => 'nullable|string',
            'active' => 'boolean',
        ]);
        if (empty($data['reply_body']) && empty($data['reply_template'])) {
            abort(422, 'A reply body or template is required');
        }

        return $data;
    }
}
