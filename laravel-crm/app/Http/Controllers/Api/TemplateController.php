<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Template;
use Illuminate\Http\Request;

class TemplateController extends Controller
{
    public function index(Request $request)
    {
        $q = Template::query();
        if ($channel = $request->query('channel')) {
            $q->where('channel', $channel);
        }
        return response()->json(['data' => $q->orderBy('name')->get()]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => 'required|string',
            'slug' => 'required|string|unique:templates,slug',
            'channel' => 'required|in:email,sms,whatsapp',
            'subject' => 'nullable|string',
            'body' => 'required|string',
            'variables' => 'nullable|array',
            'active' => 'nullable|boolean',
        ]);
        return response()->json(['template' => Template::create($data)], 201);
    }

    public function update(Request $request, Template $template)
    {
        $template->update($request->only(['name', 'channel', 'subject', 'body', 'variables', 'active']));
        return response()->json(['template' => $template->fresh()]);
    }

    public function destroy(Template $template)
    {
        $template->delete();
        return response()->json(['message' => 'deleted']);
    }
}
