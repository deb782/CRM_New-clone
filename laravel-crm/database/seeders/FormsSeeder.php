<?php

namespace Database\Seeders;

use App\Models\Form;
use App\Models\FormField;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

/**
 * Default public "Website Lead" form so the embeddable form + /public/forms/{slug}/schema
 * work out-of-the-box on a fresh deployment (fixes the 404 "No query results for model [Form]").
 */
class FormsSeeder extends Seeder
{
    public function run(): void
    {
        $form = Form::firstOrNew(['slug' => 'website-lead']);
        $form->fill([
            'uuid' => $form->uuid ?: (string) Str::uuid(),
            'name' => 'Website Enquiry',
            'redirect_url' => null,
            'settings' => [
                'button_config' => ['label' => 'Submit Enquiry'],
                'thank_you_msg' => 'Thank you! Our team will reach out to you shortly.',
            ],
            'is_active' => true,
        ]);
        $form->save();

        if ($form->fields()->count() === 0) {
            $fields = [
                ['name', 'Full Name', 'text', true, 'name'],
                ['phone', 'Phone Number', 'tel', true, 'phone'],
                ['email', 'Email', 'email', false, 'email'],
                ['message', 'Message', 'textarea', false, 'notes'],
            ];
            foreach ($fields as $i => [$slug, $label, $type, $req, $maps]) {
                FormField::create([
                    'form_id' => $form->id,
                    'slug' => $slug,
                    'label' => $label,
                    'type' => $type,
                    'options' => null,
                    'placeholder' => null,
                    'is_required' => $req,
                    'maps_to_field' => $maps,
                    'sort_order' => $i,
                ]);
            }
        }
    }
}
