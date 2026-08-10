<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Chatbot;
use App\Models\ChatbotNode;
use App\Models\ChatbotSession;
use App\Models\Lead;
use App\Services\LeadService;
use App\Services\ActivityService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * ChatbotController (v16.1) — menu-driven chatbot builder.
 *
 * The v16.1 model is simple and matches how estate developers actually use chat widgets:
 * a welcome message + a list of quick-action buttons. Each button carries one of:
 *   • answer  → bot replies with text (+ optional document/image URL)
 *   • form    → renders an inline form; on submit → creates a lead + activity log
 *   • link    → opens an external URL in a new tab (map, brochure PDF, video)
 *
 * The whole configuration lives in Chatbot.settings.menu (JSON), so no schema changes
 * are required. The old node graph (message/quick_reply/collect/end) still works for
 * anyone who prefers a linear flow.
 *
 * ┌────────────────────────────────────────────────────────────────────────────┐
 * │ ADMIN CRUD (Sanctum)                                                       │
 * │   GET/POST/PUT/DELETE /api/v1/chatbots                                     │
 * │ PUBLIC (CORS via form-cors)                                                │
 * │   GET  /api/v1/public/chatbots/{slug}/config         → brand + menu        │
 * │   POST /api/v1/public/chatbots/{slug}/session        → start session       │
 * │   POST /api/v1/public/chatbots/{slug}/session/{uuid}/action                │
 * │                                                       → click option       │
 * │   POST /api/v1/public/chatbots/{slug}/session/{uuid}/form                  │
 * │                                                       → submit form + lead │
 * │   POST /api/v1/public/chatbots/{slug}/session/{uuid}/message               │
 * │                                                       → LEGACY node flow   │
 * └────────────────────────────────────────────────────────────────────────────┘
 */
class ChatbotController extends Controller
{
    public function __construct(protected LeadService $leads, protected ActivityService $activities) {}

    /* ---------- Admin CRUD ---------- */
    public function index(): JsonResponse
    {
        return response()->json(['items' => Chatbot::withCount('nodes')->orderByDesc('id')->get()]);
    }

    public function show(Chatbot $chatbot): JsonResponse
    {
        return response()->json($chatbot->load('nodes'));
    }

    public function store(Request $req): JsonResponse
    {
        $data = $req->validate($this->rules());
        $data['slug'] = Str::slug($data['name']) . '-' . Str::random(6);
        $data['created_by'] = $req->user()->id;
        $data['settings'] = $this->mergeMenuIntoSettings($req);
        $bot = Chatbot::create($data);
        if ($req->has('nodes')) $this->syncNodes($bot, $req->input('nodes', []));
        return response()->json($bot->load('nodes'), 201);
    }

    public function update(Request $req, Chatbot $chatbot): JsonResponse
    {
        $data = $req->validate($this->rules(false));
        $data['settings'] = $this->mergeMenuIntoSettings($req, $chatbot->settings);
        $chatbot->update($data);
        if ($req->has('nodes')) $this->syncNodes($chatbot, $req->input('nodes', []));
        return response()->json($chatbot->load('nodes'));
    }

    public function destroy(Chatbot $chatbot): JsonResponse
    {
        $chatbot->delete();
        return response()->json(['ok' => true]);
    }

    /**
     * Upload an image (logo, answer illustration, PDF brochure...) and return its
     * public URL. Files are stored under public/uploads/chatbots so they can be
     * served directly by the built-in PHP server without any storage:link setup.
     */
    public function uploadAsset(Request $req): JsonResponse
    {
        $req->validate([
            'file' => ['required', 'file', 'max:8192',  // 8 MB max
                       'mimetypes:image/png,image/jpeg,image/gif,image/webp,image/svg+xml,application/pdf'],
            'kind' => ['nullable', 'in:logo,answer,brochure'],
        ]);
        $kind    = $req->input('kind', 'logo');
        $file    = $req->file('file');
        $ext     = strtolower($file->getClientOriginalExtension() ?: $file->extension());
        $subdir  = $kind === 'brochure' ? 'brochures'
                 : ($kind === 'answer'   ? 'answers'
                 : 'chatbots');
        $name    = 'cb-' . $kind . '-' . now()->format('Ymd-His') . '-' . Str::random(6) . '.' . $ext;

        $target  = public_path("uploads/{$subdir}");
        if (!is_dir($target)) @mkdir($target, 0755, true);
        $file->move($target, $name);

        $url = url("/uploads/{$subdir}/{$name}");
        return response()->json([
            'ok'      => true,
            'url'     => $url,
            'kind'    => $kind,
            'name'    => $name,
            'size'    => filesize("{$target}/{$name}") ?: null,
            'mime'    => $file->getClientMimeType() ?: mime_content_type("{$target}/{$name}"),
        ]);
    }

    private function rules(bool $creating = true): array
    {
        return [
            'name'                  => [$creating ? 'required' : 'sometimes', 'string', 'max:120'],
            'project_id'            => ['nullable', 'integer', 'exists:projects,id'],
            'brand_name'            => ['nullable', 'string', 'max:80'],
            'brand_color'           => ['nullable', 'string', 'max:20'],
            'welcome_message'       => ['nullable', 'string', 'max:2000'],
            'start_node_key'        => ['nullable', 'string', 'max:60'],
            'is_active'             => ['nullable', 'boolean'],
            'escalate_on_qualified' => ['nullable', 'boolean'],
            'logo_url'              => ['nullable', 'string', 'max:2048'],
            'menu_options'          => ['nullable', 'array'],
            'menu_options.*.id'     => ['required_with:menu_options', 'string', 'max:60'],
            'menu_options.*.label'  => ['required_with:menu_options', 'string', 'max:80'],
            'menu_options.*.icon'   => ['nullable', 'string', 'max:8'],
            'menu_options.*.action' => ['required_with:menu_options', 'in:answer,form,link'],
            'menu_options.*.answer' => ['nullable', 'string', 'max:4000'],
            'menu_options.*.answer_image' => ['nullable', 'string', 'max:500'],
            // v17: rich answers — image gallery + PDF brochure alongside the reply text.
            'menu_options.*.answer_images'   => ['nullable', 'array'],
            'menu_options.*.answer_images.*' => ['string', 'max:500'],
            'menu_options.*.answer_pdf'      => ['nullable', 'string', 'max:500'],
            'menu_options.*.answer_pdf_label'=> ['nullable', 'string', 'max:120'],
            'menu_options.*.url'    => ['nullable', 'string', 'max:500'],
            'menu_options.*.form_title'      => ['nullable', 'string', 'max:120'],
            'menu_options.*.thank_you'       => ['nullable', 'string', 'max:500'],
            'menu_options.*.mark_qualified'  => ['nullable', 'boolean'],
            'menu_options.*.form_fields'     => ['nullable', 'array'],
            'menu_options.*.form_fields.*.slug'     => ['required_with:menu_options.*.form_fields', 'string', 'max:60'],
            'menu_options.*.form_fields.*.label'    => ['required_with:menu_options.*.form_fields', 'string', 'max:120'],
            'menu_options.*.form_fields.*.type'     => ['required_with:menu_options.*.form_fields', 'in:name,text,email,phone,number,textarea,dropdown'],
            'menu_options.*.form_fields.*.required' => ['nullable', 'boolean'],
            'menu_options.*.form_fields.*.options'  => ['nullable', 'array'],
            'settings'              => ['nullable', 'array'],
            'nodes'                 => ['nullable', 'array'],
        ];
    }

    private function mergeMenuIntoSettings(Request $req, ?array $existing = null): array
    {
        $settings = $req->input('settings', $existing ?? []);
        if ($req->has('menu_options')) $settings['menu'] = $req->input('menu_options', []);
        if ($req->has('logo_url'))     $settings['logo_url'] = $req->input('logo_url');
        return is_array($settings) ? $settings : [];
    }

    private function syncNodes(Chatbot $bot, array $nodes): void
    {
        $bot->nodes()->delete();
        foreach ($nodes as $i => $n) {
            ChatbotNode::create([
                'chatbot_id'        => $bot->id,
                'key'               => $n['key'] ?? 'n' . $i,
                'type'              => $n['type'] ?? 'message',
                'content'           => $n['content'] ?? '',
                'collect_field'     => $n['collect_field']     ?? null,
                'collect_validator' => $n['collect_validator'] ?? null,
                'options'           => $n['options']           ?? null,
                'next_key'          => $n['next_key']          ?? null,
                'marks_qualified'   => (bool)($n['marks_qualified'] ?? false),
                'sort_order'        => $i,
            ]);
        }
    }

    /* ---------- Public runtime (visitor-facing) ---------- */
    public function publicConfig(string $slug): JsonResponse
    {
        $bot = Chatbot::where('slug', $slug)->where('is_active', true)->firstOrFail();
        // Strip internal-only fields per menu option (e.g. mark_qualified is server-side).
        $menu = collect($bot->settings['menu'] ?? [])->map(fn ($o) => [
            'id'          => $o['id'] ?? null,
            'label'       => $o['label'] ?? '',
            'icon'        => $o['icon'] ?? '',
            'action'      => $o['action'] ?? 'answer',
        ])->values();
        return response()->json([
            'chatbot' => [
                'name'            => $bot->name,
                'brand_name'      => $bot->brand_name,
                'brand_color'     => $bot->brand_color,
                'welcome_message' => $bot->welcome_message,
                'logo_url'        => $bot->settings['logo_url'] ?? null,
                'slug'            => $bot->slug,
            ],
            'menu'    => $menu,
            // Legacy node-flow start (for backward compat)
            'start'   => $this->publicNodeShape($bot->nodes()->where('key', $bot->start_node_key)->first()),
        ]);
    }

    public function startSession(Request $req, string $slug): JsonResponse
    {
        $bot = Chatbot::where('slug', $slug)->where('is_active', true)->firstOrFail();
        $sess = ChatbotSession::create([
            'chatbot_id'       => $bot->id,
            'current_node_key' => $bot->start_node_key,
            'visitor_data'     => [],
            'transcript'       => [],
            'ip'               => $req->ip(),
            'user_agent'       => substr((string)$req->userAgent(), 0, 250),
        ]);
        return response()->json([
            'session_uuid' => $sess->uuid,
            'node'         => $this->publicNodeShape($bot->nodes()->where('key', $bot->start_node_key)->first()),
        ]);
    }

    /**
     * Handle a menu-option click.  Returns the payload the widget should render:
     *   • action=answer → { action:'answer', text, image?, back_to_menu:true }
     *   • action=form   → { action:'form', title, fields:[…], option_id }
     *   • action=link   → { action:'link', url, text? }
     */
    public function submitAction(Request $req, string $slug, string $sessionUuid): JsonResponse
    {
        $data = $req->validate(['option_id' => 'required|string']);
        $bot  = Chatbot::where('slug', $slug)->where('is_active', true)->firstOrFail();
        $sess = ChatbotSession::where('uuid', $sessionUuid)->where('chatbot_id', $bot->id)->firstOrFail();
        $opt  = $this->findOption($bot, $data['option_id']);
        if (!$opt) abort(404, 'Unknown option');

        // Record the click in the transcript so BDE can see what the visitor tapped.
        $tx = $sess->transcript ?? [];
        $tx[] = ['role' => 'visitor', 'text' => '▸ ' . ($opt['label'] ?? $data['option_id']), 'at' => now()->toISOString()];
        $sess->transcript = $tx;
        $sess->save();

        $action = $opt['action'] ?? 'answer';
        if ($action === 'answer') {
            $tx[] = ['role' => 'bot', 'text' => $opt['answer'] ?? '', 'at' => now()->toISOString()];
            $sess->transcript = $tx; $sess->save();
            return response()->json([
                'action'        => 'answer',
                'text'          => $opt['answer'] ?? '',
                'image'         => $opt['answer_image'] ?? null,
                'images'        => $opt['answer_images'] ?? [],
                'pdf'           => $opt['answer_pdf'] ?? null,
                'pdf_label'     => $opt['answer_pdf_label'] ?? null,
                'back_to_menu'  => true,
            ]);
        }

        if ($action === 'link') {
            $tx[] = ['role' => 'bot', 'text' => '↗ ' . ($opt['url'] ?? ''), 'at' => now()->toISOString()];
            $sess->transcript = $tx; $sess->save();
            return response()->json([
                'action'       => 'link',
                'url'          => $opt['url'] ?? '',
                'text'         => $opt['answer'] ?? null,
                'back_to_menu' => true,
            ]);
        }

        // action=form
        return response()->json([
            'action'      => 'form',
            'option_id'   => $opt['id'],
            'title'       => $opt['form_title'] ?? $opt['label'] ?? 'Please fill in your details',
            'fields'      => $opt['form_fields'] ?? [],
            'submit_label'=> 'Submit',
        ]);
    }

    /**
     * Handle a menu-option form submission → create/merge lead + log transcript.
     */
    public function submitForm(Request $req, string $slug, string $sessionUuid): JsonResponse
    {
        $data = $req->validate([
            'option_id' => 'required|string',
            'values'    => 'required|array',
        ]);
        $bot  = Chatbot::where('slug', $slug)->where('is_active', true)->firstOrFail();
        $sess = ChatbotSession::where('uuid', $sessionUuid)->where('chatbot_id', $bot->id)->firstOrFail();
        $opt  = $this->findOption($bot, $data['option_id']);
        if (!$opt || ($opt['action'] ?? '') !== 'form') abort(404, 'Unknown form');

        // Enforce per-field validation (name, email, phone, number, dropdown, required).
        $errors = $this->validateFormValues($opt['form_fields'] ?? [], $data['values'] ?? []);
        if (!empty($errors)) {
            return response()->json(['errors' => $errors, 'message' => 'Validation failed'], 422);
        }

        // Persist values into the session's visitor_data (accumulated across multiple forms).
        $vd = array_merge((array)$sess->visitor_data, $data['values']);
        $sess->visitor_data = $vd;

        // Append a human-readable form fill to the transcript.
        $tx = $sess->transcript ?? [];
        $summary = collect($data['values'])
            ->map(fn ($v, $k) => is_array($v) ? "$k: " . json_encode($v) : "$k: $v")
            ->join(', ');
        $tx[] = ['role' => 'visitor', 'text' => 'FORM ' . ($opt['label'] ?? 'Form') . ' -> ' . $summary, 'at' => now()->toISOString()];
        // Also record the thank-you the bot will say so the transcript includes both sides.
        $tx[] = ['role' => 'bot', 'text' => $opt['thank_you'] ?? 'Thanks! We\'ll be in touch shortly.', 'at' => now()->toISOString()];
        // Assign BEFORE convertToLead so the activity body contains the full journey.
        $sess->transcript = $tx;

        // If this option can mark the lead qualified (e.g. brochure or site-visit form).
        if (!empty($opt['mark_qualified'])) $sess->is_qualified = true;

        // Build the intake payload (reuse existing dedupe + round-robin + drip logic).
        $lead = $this->convertToLead($bot, $sess, $vd, $opt);
        $sess->lead_id = $lead->id;
        $sess->save();

        return response()->json([
            'action'       => 'thank_you',
            'text'         => $opt['thank_you'] ?? 'Thanks! We\'ll be in touch shortly.',
            'lead_code'    => 'REF-' . $lead->id,
            'back_to_menu' => true,
        ]);
    }

    /**
     * Validate {slug: value} pairs against the option's declared form_fields.
     * Returns an array keyed by field slug with a single error string per bad field.
     */
    private function validateFormValues(array $fields, array $values): array
    {
        $errors = [];
        foreach ($fields as $f) {
            $slug     = $f['slug'] ?? '';
            $label    = $f['label'] ?? $slug;
            $type     = $f['type'] ?? 'text';
            $required = (bool)($f['required'] ?? false);
            $v        = trim((string)($values[$slug] ?? ''));

            if ($v === '') {
                if ($required) $errors[$slug] = "{$label} is required.";
                continue;
            }
            switch ($type) {
                case 'name':
                    // Letters (unicode), spaces, apostrophe, dot, hyphen. 2–60 chars.
                    if (mb_strlen($v) < 2 || mb_strlen($v) > 60) {
                        $errors[$slug] = "{$label} must be 2–60 characters.";
                    } elseif (!preg_match('/^[\p{L}][\p{L}\s.\'\-]{1,59}$/u', $v)) {
                        $errors[$slug] = "{$label} should only contain letters.";
                    }
                    break;
                case 'email':
                    if (!filter_var($v, FILTER_VALIDATE_EMAIL)) {
                        $errors[$slug] = 'Please enter a valid email address.';
                    }
                    break;
                case 'phone':
                    $digits = preg_replace('/\D/', '', $v);
                    if (strlen($digits) < 7 || strlen($digits) > 15) {
                        $errors[$slug] = 'Please enter a valid phone number.';
                    }
                    break;
                case 'number':
                    if (!is_numeric($v)) $errors[$slug] = "{$label} must be a number.";
                    break;
                case 'dropdown':
                    $opts = is_array($f['options'] ?? null) ? $f['options'] : [];
                    if (!empty($opts) && !in_array($v, $opts, true)) {
                        $errors[$slug] = "Please pick a valid option for {$label}.";
                    }
                    break;
            }
        }
        return $errors;
    }

    /* ---------- Legacy node-flow runtime (kept for backward compat) ---------- */
    public function submitMessage(Request $req, string $slug, string $sessionUuid): JsonResponse
    {
        $bot  = Chatbot::where('slug', $slug)->where('is_active', true)->firstOrFail();
        $sess = ChatbotSession::where('uuid', $sessionUuid)->where('chatbot_id', $bot->id)->firstOrFail();
        if ($sess->completed_at) abort(409, 'Session already completed');

        $answer = (string) $req->input('answer', '');
        $currentNode = $bot->nodes()->where('key', $sess->current_node_key)->first();
        if (!$currentNode) abort(400, 'Invalid session state');

        $tx = $sess->transcript ?? [];
        $tx[] = ['role' => 'visitor', 'text' => $answer, 'at' => now()->toISOString()];

        $vd = $sess->visitor_data ?? [];
        if ($currentNode->type === 'collect' && $currentNode->collect_field) {
            $vd[$currentNode->collect_field] = $answer;
        }

        $nextKey = null;
        if ($currentNode->type === 'quick_reply') {
            foreach ((array)$currentNode->options as $opt) {
                if (strcasecmp($opt['label'] ?? '', $answer) === 0) { $nextKey = $opt['next'] ?? null; break; }
            }
            $nextKey ??= $currentNode->next_key;
        } else {
            $nextKey = $currentNode->next_key;
        }
        $nextNode = $nextKey ? $bot->nodes()->where('key', $nextKey)->first() : null;
        if ($nextNode?->marks_qualified) $sess->is_qualified = true;
        if ($nextNode) $tx[] = ['role' => 'bot', 'text' => $nextNode->content, 'at' => now()->toISOString()];
        $sess->transcript = $tx; $sess->visitor_data = $vd;
        $sess->current_node_key = $nextNode?->key;

        if (!$nextNode || $nextNode->type === 'end') {
            $lead = $this->convertToLead($bot, $sess, $vd);
            $sess->lead_id = $lead->id;
            $sess->completed_at = now();
        }
        $sess->save();

        return response()->json([
            'node'      => $nextNode ? $this->publicNodeShape($nextNode) : null,
            'completed' => (bool)$sess->completed_at,
            'lead_code' => $sess->lead ? ('REF-' . $sess->lead->id) : null,
            'qualified' => (bool)$sess->is_qualified,
        ]);
    }

    /* ---------- Helpers ---------- */
    private function findOption(Chatbot $bot, string $id): ?array
    {
        foreach ((array)($bot->settings['menu'] ?? []) as $o) {
            if (($o['id'] ?? null) === $id) return $o;
        }
        return null;
    }

    private function publicNodeShape(?ChatbotNode $n): ?array
    {
        if (!$n) return null;
        return [
            'key' => $n->key, 'type' => $n->type, 'content' => $n->content,
            'collect_field' => $n->collect_field, 'collect_validator' => $n->collect_validator,
            'options' => $n->options, 'is_end' => $n->type === 'end',
        ];
    }

    /**
     * Convert accumulated visitor data into a CRM lead + activity transcript.
     * Uses LeadService::capture so we get dedupe, round-robin assignment, ack + automation.
     */
    private function convertToLead(Chatbot $bot, ChatbotSession $sess, array $vd, ?array $opt = null): Lead
    {
        $name = trim(($vd['first_name'] ?? '') . ' ' . ($vd['last_name'] ?? ''));
        if ($name === '') $name = $vd['name'] ?? 'Chatbot Visitor';

        // Extra answers (anything that isn't a core contact field) → readable notes.
        $notes = [];
        foreach ($vd as $k => $v) {
            if (in_array($k, ['first_name', 'last_name', 'name', 'phone', 'mobile', 'email', 'city'], true)) continue;
            if ($v === null || $v === '' || (is_array($v) && ! count($v))) continue;
            $notes[] = ucwords(str_replace(['_', '-'], ' ', (string) $k)) . ': ' . (is_array($v) ? implode(', ', $v) : $v);
        }

        $payload = [
            'name'       => $name,
            'phone'      => $vd['phone'] ?? $vd['mobile'] ?? null,
            'email'      => $vd['email'] ?? null,
            'city'       => $vd['city'] ?? null,
            'source'     => 'Chatbot',
            'project_id' => $bot->project_id,
            'campaign'   => 'chatbot:' . $bot->name . ($opt ? (' → ' . ($opt['label'] ?? $opt['id'] ?? '')) : ''),
        ];
        if ($notes) $payload['intent_notes'] = implode(' | ', $notes);

        $res  = $this->leads->capture($payload);
        $lead = $res['lead'] ?? null;
        if (! $lead && ($key = $this->leads->dedupeKey($payload['phone'] ?? null, $payload['email'] ?? null))) {
            $lead = Lead::where('dedupe_key', $key)->first();
        }
        if (! $lead) {
            $lead = $this->leads->capture($payload, true)['lead'];
        }

        // Log the transcript so BDE sees the full menu journey on the lead detail page.
        $body = collect($sess->transcript ?? [])
            ->map(fn ($m) => strtoupper($m['role']) . ': ' . $m['text'])
            ->join("\n");
        $this->activities->log(
            $lead,
            'note',
            'Chatbot conversation (' . $bot->name . ')' . ($sess->is_qualified ? ' — QUALIFIED' : ''),
            $body,
            [
                'chatbot_id'   => $bot->id,
                'session_uuid' => $sess->uuid,
                'qualified'    => $sess->is_qualified,
                'menu_option'  => $opt['id'] ?? null,
            ]
        );

        if ($sess->is_qualified && $bot->escalate_on_qualified) {
            $lead->update(['temperature' => 'hot']);
        }
        return $lead;
    }
}
