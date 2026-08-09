<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\EmailTemplate;
use Illuminate\Http\Request;

class EmailTemplateController extends Controller
{
    public function index()
    {
        return response()->json(['templates' => EmailTemplate::latest()->get()]);
    }

    public function show(EmailTemplate $email_template)
    {
        return response()->json(['template' => $email_template]);
    }

    public function store(Request $request)
    {
        $data = $this->data($request);
        $data['created_by'] = $request->user()->id;

        return response()->json(['template' => EmailTemplate::create($data)], 201);
    }

    public function update(Request $request, EmailTemplate $email_template)
    {
        $email_template->update($this->data($request));

        return response()->json(['template' => $email_template->fresh()]);
    }

    public function destroy(EmailTemplate $email_template)
    {
        $email_template->delete();

        return response()->json(['ok' => true]);
    }

    /** Starter templates for the gallery (static, ready-to-edit). */
    public function starters()
    {
        $wrap = fn ($inner) => '<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;background:#ffffff">'.$inner.'</div>';
        $btn = fn ($t) => '<a href="https://example.com" style="display:inline-block;background:#2f6df6;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600">'.$t.'</a>';

        return response()->json(['starters' => [
            ['name' => 'Welcome', 'subject' => 'Welcome to {{project}}, {{name}}!', 'category' => 'Onboarding',
                'html' => $wrap('<div style="padding:32px"><h1 style="color:#1a2036;margin:0 0 12px">Welcome, {{name}}!</h1><p style="color:#4a5568;line-height:1.6">Thanks for your interest in our projects. Our team will reach out shortly to help you find your perfect home.</p><p style="margin:24px 0">'.$btn('Explore Projects').'</p><p style="color:#94a3b8;font-size:12px">You are receiving this because you enquired with us.</p></div>')],
            ['name' => 'New Launch Announcement', 'subject' => 'New Launch: {{project}} is now open', 'category' => 'Marketing',
                'html' => $wrap('<div style="background:#1a2036;color:#fff;padding:40px 32px;text-align:center"><h1 style="margin:0">A New Landmark Awaits</h1><p style="opacity:.85">Premium residences now open for booking</p></div><div style="padding:32px"><p style="color:#4a5568;line-height:1.6">Hi {{name}}, we are excited to announce our newest project. Limited units available with early-bird pricing.</p><p style="margin:24px 0">'.$btn('Book a Site Visit').'</p></div>')],
            ['name' => 'Site Visit Reminder', 'subject' => 'Reminder: your site visit', 'category' => 'Transactional',
                'html' => $wrap('<div style="padding:32px"><h2 style="color:#1a2036">Hi {{name}}, see you soon!</h2><p style="color:#4a5568;line-height:1.6">This is a friendly reminder about your upcoming site visit. Reply to this email if you need to reschedule.</p></div>')],
            ['name' => 'Festive Offer', 'subject' => 'A special offer just for you, {{name}}', 'category' => 'Marketing',
                'html' => $wrap('<div style="padding:32px;text-align:center"><h1 style="color:#c0392b">Festive Special</h1><p style="color:#4a5568;line-height:1.6">Enjoy exclusive benefits on select units this season. Offer valid for a limited time.</p><p style="margin:24px 0">'.$btn('Claim Offer').'</p></div>')],
            ['name' => 'Blank', 'subject' => '', 'category' => 'General',
                'html' => $wrap('<div style="padding:32px"><p style="color:#4a5568">Start writing your email here…</p></div>')],
        ]]);
    }

    private function data(Request $request): array
    {
        return $request->validate([
            'name' => 'required|string|max:150',
            'subject' => 'nullable|string|max:200',
            'category' => 'nullable|string|max:60',
            'html' => 'nullable|string',
        ]);
    }
}
