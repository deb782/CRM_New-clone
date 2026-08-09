<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\WhatsappCannedReply;
use Illuminate\Http\Request;

class WhatsAppCannedReplyController extends Controller
{
    public function index()
    {
        return response()->json(['replies' => WhatsappCannedReply::orderBy('title')->get()]);
    }

    public function store(Request $request)
    {
        $data = $this->data($request);
        $data['created_by'] = $request->user()->id;

        return response()->json(['reply' => WhatsappCannedReply::create($data)], 201);
    }

    public function update(Request $request, WhatsappCannedReply $canned_reply)
    {
        $canned_reply->update($this->data($request));

        return response()->json(['reply' => $canned_reply->fresh()]);
    }

    public function destroy(WhatsappCannedReply $canned_reply)
    {
        $canned_reply->delete();

        return response()->json(['ok' => true]);
    }

    private function data(Request $request): array
    {
        return $request->validate([
            'title' => 'required|string|max:120',
            'shortcut' => 'nullable|string|max:40',
            'body' => 'required|string|max:4096',
        ]);
    }
}
