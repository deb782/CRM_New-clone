<?php

namespace Database\Seeders;

use App\Models\LeadStatus;
use Illuminate\Database\Seeder;

/**
 * BDE-led lead journey (Agrocorp — Stages 1-2 of the Operating Guidebook):
 *   STAGE 1 Lead Entry -> STAGE 2 Qualification -> FollowUp -> Meeting & Site Visit (conversion).
 *
 * Each status can auto-fire on entering (see FlowEngine::applyStatus):
 *   - a customer WhatsApp (free text in mock; approved template `wa_template` on the live Cloud API)
 *   - a customer email (email_subject / email_body)
 *   - an ownership hand-off (owner_role)
 *   - a follow-up task (FlowEngine::createFollowUpTask)
 *
 * WhatsApp templates all use a single variable {{1}} = customer first name.
 * See docs/WHATSAPP_TEMPLATES_TO_CREATE.md for the list to create in Meta Business Manager.
 */
class LeadJourneySeeder extends Seeder
{
    public function run(): void
    {
        $laneName = [
            'S1' => 'Lead Entry',
            'S2' => 'Qualification',
            'S2F' => 'FollowUp Stage',
            'S3' => 'Meeting & Site Visit',
        ];
        $laneSla = ['S1' => 120, 'S2' => 1440, 'S2F' => 2880, 'S3' => 2880];

        // code => [stage, display, color, next[], pipeline_slug, gate[], disposition, terminal,
        //          wa_message, wa_template, email_subject, email_body, owner_role]
        $rows = [
            // STAGE 1 — Lead Entry
            'NOT_CONTACTED' => ['S1', 'Not Contacted', '#E0A63C',
                ['CONTACTED', 'JUNK_INVALID', 'NO_RESPONSE', 'LOST'], 'new_lead', [], null, false,
                'Hi {name}, thank you for your interest in Agrocorp. Our team will reach out to you shortly. 🌱',
                'lead_acknowledgement',
                'Thank you for your interest in Agrocorp',
                "Hi {name},\n\nThank you for reaching out to Agrocorp about {project}. Your enquiry has been received and one of our advisors will contact you shortly.\n\nWarm regards,\nTeam Agrocorp",
                null],

            // STAGE 2 — Qualification
            'CONTACTED' => ['S2', 'Contacted', '#7C5CC4',
                ['FOLLOWUP_1', 'JUNK_INVALID', 'NO_RESPONSE', 'UNRESPONSIVE', 'CONVERTED_OPPORTUNITY', 'LOST'], 'contacted', [], null, false,
                'Hi {name}, great speaking with you! Sharing the details & collaterals we discussed.',
                'lead_collateral',
                'Your Agrocorp collaterals & brochure',
                "Hi {name},\n\nThank you for your time today. As discussed, please find our brochure, floor plans and price list for {project} attached. Do let us know if you'd like to schedule a visit.\n\nWarm regards,\nTeam Agrocorp",
                null],
            'JUNK_INVALID' => ['S2', 'Junk/Invalid', '#7A211B',
                [], 'not_interested', [], 'lost', true, null, null, null, null, null],
            'NO_RESPONSE' => ['S2', 'No Response', '#E08A2B',
                ['CONTACTED', 'UNRESPONSIVE', 'LOST'], 'no_response', [], null, false,
                'Hi {name}, we tried reaching you regarding your interest in Agrocorp but couldn\'t connect. We\'ll try again soon!',
                'lead_no_response',
                'We tried reaching you — Agrocorp',
                "Hi {name},\n\nWe tried contacting you regarding your interest in {project} but couldn't reach you. Please let us know a convenient time to connect.\n\nWarm regards,\nTeam Agrocorp",
                null],
            'UNRESPONSIVE' => ['S2', 'Unresponsive', '#1B2338',
                [], 'no_response', [], 'lost', true, null, null, null, null, null],

            // FollowUp
            'FOLLOWUP_1' => ['S2F', 'General Follow-Up 1', '#2F6FED',
                ['FOLLOWUP_2', 'CONVERTED_OPPORTUNITY', 'NO_RESPONSE', 'LOST'], 'interested', [], null, false,
                'Hi {name}, just following up on your interest in our projects. Would you like to schedule a visit?',
                'lead_followup',
                'Following up on your Agrocorp enquiry',
                "Hi {name},\n\nJust following up on your interest in {project}. We'd love to help you find the perfect fit — shall we schedule a site visit?\n\nWarm regards,\nTeam Agrocorp",
                null],
            'FOLLOWUP_2' => ['S2F', 'General Follow-Up 2', '#4A9D5B',
                ['FOLLOWUP_3', 'CONVERTED_OPPORTUNITY', 'NO_RESPONSE', 'LOST'], 'interested', [], null, false,
                'Hi {name}, we have a few great options that match what you\'re looking for. Shall we set up a site visit?',
                'lead_followup',
                'A few options you\'ll love — Agrocorp',
                "Hi {name},\n\nWe have a few great options at {project} that match what you're looking for. Shall we set up a site visit at your convenience?\n\nWarm regards,\nTeam Agrocorp",
                null],
            'FOLLOWUP_3' => ['S2F', 'General Follow-Up 3', '#D6437F',
                ['CONVERTED_OPPORTUNITY', 'UNRESPONSIVE', 'LOST'], 'interested', [], null, false,
                'Hi {name}, a quick final check-in — our advisor would love to show you the site at your convenience.',
                'lead_followup',
                'A quick check-in from Agrocorp',
                "Hi {name},\n\nA quick final check-in on your interest in {project}. Our advisor would be delighted to show you the site whenever you're ready.\n\nWarm regards,\nTeam Agrocorp",
                null],

            // STAGE 3 — Meeting & Site Visit (conversion -> handed to BDM)
            'CONVERTED_OPPORTUNITY' => ['S3', 'Converted to Opportunity', '#3CBA9A',
                ['OPP_NOT_CONTACTED', 'LOST'], 'opportunity', [], null, false,
                'Hi {name}, your site visit is confirmed! Our team looks forward to meeting you. 📍',
                'site_visit_confirmation',
                'Your site visit is confirmed — Agrocorp',
                "Hi {name},\n\nYour site visit for {project} is confirmed. Our team looks forward to welcoming you. You'll receive the schedule details shortly.\n\nWarm regards,\nTeam Agrocorp",
                'sales_bdm'],

            // Global terminal
            'LOST' => ['S3', 'Lost', '#E0483D', [], 'lost', [], 'lost', true,
                null,
                'lead_lost_thankyou',
                'Thank you for reaching out to Agrocorp',
                "Hi {name},\n\nThank you for considering Agrocorp for {project}. Although the timing may not be right now, we're always here whenever you'd like to explore again.\n\nWarm regards,\nTeam Agrocorp",
                null],
        ];

        $keep = [];
        $i = 0;
        foreach ($rows as $code => [$stage, $name, $color, $next, $pipe, $gates, $disp, $terminal, $wa, $waTpl, $emSubj, $emBody, $ownerRole]) {
            $keep[] = $code;
            LeadStatus::updateOrCreate(['code' => $code], [
                'status_group' => 'bde',
                'stage_key' => $stage,
                'stage_name' => $laneName[$stage],
                'display_name' => $name,
                'color' => $color,
                'wa_message' => $wa,
                'wa_enabled' => ($wa !== null || $waTpl !== null),
                'wa_template' => $waTpl,
                'email_enabled' => $emSubj !== null,
                'email_subject' => $emSubj,
                'email_body' => $emBody,
                'owner_role' => $ownerRole,
                'sort' => $i++,
                'is_terminal' => $terminal,
                'disposition' => $disp,
                'allowed_next' => $next,
                'gate_fields' => $gates,
                'sla_minutes' => null,
                'pipeline_slug' => $pipe,
                'lane_sla_minutes' => $laneSla[$stage],
            ]);
        }

        // Demo quick-reply buttons on follow-up messages (one-tap customer responses).
        $btnMap = [
            'FOLLOWUP_1' => [['label' => 'Book a visit', 'next_code' => 'CONVERTED_OPPORTUNITY'], ['label' => 'Not interested', 'next_code' => 'LOST']],
            'FOLLOWUP_2' => [['label' => 'Book a visit', 'next_code' => 'CONVERTED_OPPORTUNITY'], ['label' => 'Not interested', 'next_code' => 'LOST']],
            'FOLLOWUP_3' => [['label' => 'Book a visit', 'next_code' => 'CONVERTED_OPPORTUNITY'], ['label' => 'Not interested', 'next_code' => 'LOST']],
            'CONTACTED' => [['label' => 'Interested', 'next_code' => 'FOLLOWUP_1'], ['label' => 'Book a visit', 'next_code' => 'CONVERTED_OPPORTUNITY']],
        ];
        foreach ($btnMap as $code => $btns) {
            LeadStatus::where('code', $code)->update(['wa_buttons' => json_encode($btns)]);
        }

        // Remove legacy statuses no longer part of the journey (BDE group only).
        LeadStatus::where('status_group', 'bde')->whereNotIn('code', $keep)->delete();
    }
}
