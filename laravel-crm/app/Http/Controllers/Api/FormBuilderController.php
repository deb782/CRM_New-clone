<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Form;
use App\Models\FormField;
use App\Services\LeadService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Website Form Builder admin API + public submit/schema.
 * Admin creates forms → CRM returns embed script → admin pastes on their website.
 * Submissions flow through LeadService::capture (dedupe, routing, ack, automation).
 */
class FormBuilderController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json([
            'items' => Form::with('fields')->orderByDesc('id')->get(),
        ]);
    }

    public function show(Form $form): JsonResponse
    {
        $form->load('fields');
        $form->embed_script = $form->embedScript(config('app.url'));
        return response()->json($form);
    }

    public function store(Request $req): JsonResponse
    {
        $data = $req->validate([
            'name'              => ['required', 'string', 'min:2', 'max:200'],
            'project_id'        => ['nullable', 'integer', 'exists:projects,id'],
            'redirect_url'      => ['nullable', 'string', 'max:500'],   // accept blank
            'settings'          => ['nullable', 'array'],
            'fields'            => ['required', 'array', 'min:1'],
            'fields.*.slug'     => ['required', 'string', 'max:100'],
            'fields.*.label'    => ['required', 'string', 'max:200'],
            'fields.*.type'     => ['required', 'in:name,text,number,dropdown,checkbox,date,textarea,email,phone,hidden,radio,checkbox_group,multiselect'],
            'fields.*.is_required' => ['nullable', 'boolean'],
            'fields.*.options'  => ['nullable', 'array'],
            'fields.*.placeholder' => ['nullable', 'string', 'max:200'],
            'fields.*.maps_to_field' => ['nullable', 'string', 'max:60'],
        ]);
        // Clean up empty strings -> null
        foreach (['redirect_url'] as $k) {
            if (isset($data[$k]) && trim($data[$k]) === '') $data[$k] = null;
        }

        return DB::transaction(function () use ($data, $req) {
            $form = Form::create([
                'name'              => $data['name'],
                'project_id'        => $data['project_id']        ?? null,
                'redirect_url'      => $data['redirect_url']      ?? null,
                'settings'          => $data['settings']          ?? null,
                'created_by'        => $req->user()->id,
            ]);
            foreach ($data['fields'] as $i => $f) {
                FormField::create([
                    'form_id'      => $form->id,
                    'slug'         => $f['slug'],
                    'label'        => $f['label'],
                    'type'         => $f['type'],
                    'is_required'  => $f['is_required'] ?? false,
                    'options'      => $f['options']     ?? null,
                    'placeholder'  => $f['placeholder'] ?? null,
                    'maps_to_field'=> $f['maps_to_field'] ?? null,
                    'sort_order'   => $i,
                ]);
            }
            return response()->json([
                'id'           => $form->id,
                'slug'         => $form->slug,
                'embed_script' => $form->embedScript(config('app.url')),
            ], 201);
        });
    }

    public function update(Request $req, Form $form): JsonResponse
    {
        $form->update($req->only(['name','project_id','redirect_url','settings','is_active']));

        if ($req->has('fields') && is_array($req->input('fields'))) {
            $form->fields()->delete();
            foreach ($req->input('fields') as $i => $f) {
                FormField::create([
                    'form_id'      => $form->id,
                    'slug'         => $f['slug'],
                    'label'        => $f['label'],
                    'type'         => $f['type'],
                    'is_required'  => $f['is_required'] ?? false,
                    'options'      => $f['options']     ?? null,
                    'placeholder'  => $f['placeholder'] ?? null,
                    'maps_to_field'=> $f['maps_to_field'] ?? null,
                    'sort_order'   => $i,
                ]);
            }
        }
        return response()->json(['ok' => true]);
    }

    public function destroy(Form $form): JsonResponse
    {
        $form->delete();
        return response()->json(['ok' => true]);
    }

    /* ---------- Public (embed) ---------- */

    /** Public form schema — consumed by /assets/js/form-embed.js to render the form. */
    public function schema(string $slug): JsonResponse
    {
        $form = Form::with('fields')->where('slug', $slug)->where('is_active', true)->first();
        if (! $form) {
            return response()->json(['message' => 'This form is not available. It may be inactive or the link is incorrect.'], 404);
        }
        return response()->json([
            'name'          => $form->name,
            'slug'          => $form->slug,
            'button_label'  => $form->settings['button_config']['label'] ?? 'Submit',
            'fields'        => $form->fields->map(fn ($f) => [
                'slug'        => $f->slug,
                'label'       => $f->label,
                'type'        => $f->type,
                'options'     => $f->options,
                'placeholder' => $f->placeholder,
                'is_required' => (bool) $f->is_required,
            ]),
            'thank_you_msg' => $form->settings['thank_you_msg'] ?? null,
            'redirect_url'  => $form->redirect_url,
        ]);
    }

    /** Public form submit → captures a CRM lead via LeadService. */
    public function submit(Request $req, string $slug, LeadService $leads): JsonResponse
    {
        $form = Form::with('fields')->where('slug', $slug)->where('is_active', true)->firstOrFail();

        $errors = $this->validateFormPayload($form->fields, $req->all());
        if (! empty($errors)) {
            return response()->json(['errors' => $errors, 'message' => 'Validation failed'], 422);
        }

        $payload = $this->mapToLead($form, $req->all());
        $res = $leads->capture($payload);
        $lead = $res['lead'] ?? null;
        if (! $lead && ($key = $leads->dedupeKey($payload['phone'] ?? null, $payload['email'] ?? null))) {
            $lead = \App\Models\Lead::where('dedupe_key', $key)->first();
        }
        if (! $lead) {
            $lead = $leads->capture($payload, true)['lead'];
        }

        $form->increment('submission_count');

        return response()->json([
            'ok'           => true,
            'redirect_url' => $form->redirect_url,
            'message'      => $form->settings['thank_you_msg'] ?? 'Thank you! We will reach out shortly.',
        ]);
    }

    /** Map submitted field values onto a LeadService capture payload using each field's maps_to_field. */
    private function mapToLead(Form $form, array $values): array
    {
        $direct = ['email', 'phone', 'city', 'budget_min', 'budget_max', 'preferred_location', 'property_type'];
        $payload = [];
        $nameParts = ['first_name' => '', 'last_name' => ''];
        $notes = [];

        foreach ($form->fields as $f) {
            $v = trim((string) ($values[$f->slug] ?? ''));
            if ($v === '') continue;
            $map = $f->maps_to_field;
            if ($map === 'first_name' || $map === 'last_name') {
                $nameParts[$map] = $v;
            } elseif (in_array($map, $direct, true)) {
                $payload[$map] = $v;
            } else {
                $notes[] = $f->label . ': ' . $v;
            }
        }

        $name = trim($nameParts['first_name'] . ' ' . $nameParts['last_name']);
        $payload['name'] = $name !== '' ? $name : 'Website Lead';
        $payload['source'] = $form->settings['sub_source'] ?? ($form->settings['source'] ?? 'Website Form');
        $payload['campaign'] = $form->name;
        if ($form->project_id) $payload['project_id'] = $form->project_id;
        if ($notes) $payload['intent_notes'] = implode(' | ', $notes);

        return $payload;
    }

    /** Server-side per-field validation mirroring the embed's client rules. */
    private function validateFormPayload($fields, array $values): array
    {
        $errors = [];
        foreach ($fields as $f) {
            $slug = $f->slug;
            $label = $f->label ?: $slug;
            $type = $f->type;
            $required = (bool) $f->is_required;
            $v = trim((string) ($values[$slug] ?? ''));

            if ($v === '') {
                if ($required) $errors[$slug] = "{$label} is required.";
                continue;
            }
            switch ($type) {
                case 'name':
                    if (mb_strlen($v) < 2 || mb_strlen($v) > 60) {
                        $errors[$slug] = "{$label} must be 2-60 characters.";
                    } elseif (! preg_match('/^[\p{L}][\p{L}\s.\'\-]{1,59}$/u', $v)) {
                        $errors[$slug] = "{$label} should only contain letters.";
                    }
                    break;
                case 'email':
                    if (! filter_var($v, FILTER_VALIDATE_EMAIL)) {
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
                    if (! is_numeric($v)) $errors[$slug] = "{$label} must be a number.";
                    break;
            }
        }
        return $errors;
    }
}
