<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Integrations\WhatsApp\Contract;
use App\Models\WhatsappTemplate;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class WhatsAppTemplateController extends Controller
{
    public function index()
    {
        return response()->json(['templates' => WhatsappTemplate::orderByDesc('id')->get()]);
    }

    public function store(Request $r)
    {
        $data = $this->validated($r);
        $data['status'] = 'DRAFT';
        $data['created_by'] = $r->user()->id;
        $tpl = WhatsappTemplate::create($data);

        return response()->json(['template' => $tpl], 201);
    }

    public function update(Request $r, WhatsappTemplate $template)
    {
        abort_if(in_array($template->status, ['PENDING', 'APPROVED']), 422, 'Approved or in-review templates cannot be edited. Duplicate it instead.');
        $template->update($this->validated($r));

        return response()->json(['template' => $template]);
    }

    public function destroy(WhatsappTemplate $template)
    {
        $template->delete();

        return response()->json(['deleted' => true]);
    }

    /** Submit a draft to Meta for approval (live), or auto-approve in mock/sandbox mode. */
    public function submit(WhatsappTemplate $template)
    {
        if ($this->isLive()) {
            $res = $this->submitToMeta($template);
            $template->update([
                'status' => $res['ok'] ? 'PENDING' : 'REJECTED',
                'rejection_reason' => $res['ok'] ? null : $res['error'],
                'provider_id' => $res['id'] ?? null,
                'submitted_at' => now(),
            ]);

            return response()->json([
                'template' => $template,
                'message' => $res['ok'] ? 'Submitted to Meta — awaiting approval.' : ('Meta rejected the submission: '.$res['error']),
            ], $res['ok'] ? 200 : 422);
        }

        // Sandbox: no live Meta connection — auto-approve so it is usable immediately.
        $template->update(['status' => 'APPROVED', 'submitted_at' => now(), 'rejection_reason' => null]);

        return response()->json([
            'template' => $template,
            'message' => 'Sandbox mode: template auto-approved. It will need real Meta approval once WhatsApp is connected.',
        ]);
    }

    /** Pull templates from the provider (Meta live, or mock samples) and upsert locally. */
    public function sync(Contract $driver)
    {
        $count = 0;
        foreach ($driver->fetchTemplates() as $t) {
            WhatsappTemplate::updateOrCreate(
                ['name' => $t['name'], 'language' => $t['language'] ?? 'en_US'],
                [
                    'category' => $t['category'] ?? 'UTILITY',
                    'body' => $t['body'] ?? null,
                    'status' => $t['status'] ?? 'APPROVED',
                    'synced_at' => now(),
                ]
            );
            $count++;
        }

        return response()->json(['synced' => $count, 'templates' => WhatsappTemplate::orderByDesc('id')->get()]);
    }

    private function validated(Request $r): array
    {
        return $r->validate([
            'name' => 'required|string|regex:/^[a-z0-9_]+$/|max:512',
            'language' => 'required|string|max:10',
            'category' => 'required|in:MARKETING,UTILITY,AUTHENTICATION',
            'header_type' => 'required|in:none,text,image,document,video',
            'header_text' => 'nullable|string|max:60',
            'body' => 'required|string|max:1024',
            'footer' => 'nullable|string|max:60',
            'buttons' => 'nullable|array|max:10',
            'buttons.*.type' => 'required_with:buttons|in:QUICK_REPLY,URL,PHONE_NUMBER',
            'buttons.*.text' => 'required_with:buttons|string|max:25',
            'buttons.*.value' => 'nullable|string|max:2000',
            'example' => 'nullable|array',
        ]);
    }

    private function isLive(): bool
    {
        return (bool) (config('integrations.whatsapp.cloud.token') && config('integrations.whatsapp.cloud.waba_id'));
    }

    /** Build Meta component payload and POST to the WABA message_templates endpoint. */
    private function submitToMeta(WhatsappTemplate $t): array
    {
        $components = [];
        if ($t->header_type && $t->header_type !== 'none') {
            $h = ['type' => 'HEADER', 'format' => strtoupper($t->header_type)];
            if ($t->header_type === 'text') {
                $h['text'] = $t->header_text;
            }
            $components[] = $h;
        }
        $body = ['type' => 'BODY', 'text' => $t->body];
        if (! empty($t->example['body'] ?? null)) {
            $body['example'] = ['body_text' => [array_values($t->example['body'])]];
        }
        $components[] = $body;
        if ($t->footer) {
            $components[] = ['type' => 'FOOTER', 'text' => $t->footer];
        }
        if (! empty($t->buttons)) {
            $btns = array_map(function ($b) {
                $out = ['type' => $b['type'], 'text' => $b['text']];
                if ($b['type'] === 'URL') {
                    $out['url'] = $b['value'] ?? '';
                }
                if ($b['type'] === 'PHONE_NUMBER') {
                    $out['phone_number'] = $b['value'] ?? '';
                }

                return $out;
            }, $t->buttons);
            $components[] = ['type' => 'BUTTONS', 'buttons' => $btns];
        }

        $base = rtrim((string) config('integrations.whatsapp.cloud.base_url', 'https://graph.facebook.com'), '/');
        $version = config('integrations.whatsapp.cloud.version', 'v23.0');
        $waba = config('integrations.whatsapp.cloud.waba_id');
        try {
            $res = Http::withToken(config('integrations.whatsapp.cloud.token'))
                ->post("{$base}/{$version}/{$waba}/message_templates", [
                    'name' => $t->name,
                    'language' => $t->language,
                    'category' => $t->category,
                    'components' => $components,
                ]);
            if ($res->successful()) {
                return ['ok' => true, 'id' => data_get($res->json(), 'id')];
            }

            return ['ok' => false, 'error' => data_get($res->json(), 'error.message', 'Unknown Meta error')];
        } catch (\Throwable $e) {
            Log::error('Template submit failed: '.$e->getMessage());

            return ['ok' => false, 'error' => $e->getMessage()];
        }
    }
}
