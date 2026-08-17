<?php

namespace Database\Seeders;

use App\Models\LeadStatus;
use Illuminate\Database\Seeder;

/**
 * Simplified BDE-led lead journey (Agrocorp demo):
 *   STAGE 1 Lead Entry -> STAGE 2 Qualification -> STAGE 3 FollowUp -> STAGE 4 Meeting & Site Visit.
 * Statuses & colours mirror the CRM board. Each status can carry a customer WhatsApp message
 * that fires automatically on entering the status (see FlowEngine::applyStatus).
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

        // stage, code, display, color, next[], pipeline_slug, gate[], disposition, terminal, wa_message
        $rows = [
            // STAGE 1 — Lead Entry
            ['S1', 'NOT_CONTACTED', 'Not Contacted', '#E0A63C',
                ['CONTACTED', 'JUNK_INVALID', 'NO_RESPONSE', 'LOST'], 'new_lead', [], null, false,
                'Hi {name}, thank you for your interest in Agrocorp. Our team will reach out to you shortly. 🌱'],

            // STAGE 2 — Qualification (BDE initial call + authenticity check)
            ['S2', 'CONTACTED', 'Contacted', '#7C5CC4',
                ['FOLLOWUP_1', 'JUNK_INVALID', 'NO_RESPONSE', 'UNRESPONSIVE', 'CONVERTED_OPPORTUNITY', 'LOST'], 'contacted', [], null, false,
                'Hi {name}, great speaking with you! We\'ll share the details we discussed and stay in touch.'],
            ['S2', 'JUNK_INVALID', 'Junk/Invalid', '#7A211B',
                [], 'not_interested', [], 'lost', true, null],
            ['S2', 'NO_RESPONSE', 'No Response', '#E08A2B',
                ['CONTACTED', 'UNRESPONSIVE', 'LOST'], 'no_response', [], null, false, null],
            ['S2', 'UNRESPONSIVE', 'Unresponsive', '#1B2338',
                [], 'no_response', [], 'lost', true, null],

            // STAGE 3 — FollowUp
            ['S2F', 'FOLLOWUP_1', 'General Follow-Up 1', '#2F6FED',
                ['FOLLOWUP_2', 'CONVERTED_OPPORTUNITY', 'NO_RESPONSE', 'LOST'], 'interested', [], null, false,
                'Hi {name}, just following up on your interest in our projects. Would you like to schedule a visit?'],
            ['S2F', 'FOLLOWUP_2', 'General Follow-Up 2', '#4A9D5B',
                ['FOLLOWUP_3', 'CONVERTED_OPPORTUNITY', 'NO_RESPONSE', 'LOST'], 'interested', [], null, false,
                'Hi {name}, we have a few great options that match what you\'re looking for. Shall we set up a site visit?'],
            ['S2F', 'FOLLOWUP_3', 'General Follow-Up 3', '#D6437F',
                ['CONVERTED_OPPORTUNITY', 'UNRESPONSIVE', 'LOST'], 'interested', [], null, false,
                'Hi {name}, a quick final check-in — our advisor would love to show you the site at your convenience.'],

            // STAGE 4 — Meeting & Site Visit (site visit booked -> handed to BDM)
            ['S3', 'CONVERTED_OPPORTUNITY', 'Converted to Opportunity', '#3CBA9A',
                ['LOST'], 'opportunity', [], null, false,
                'Hi {name}, your site visit is confirmed! Our team looks forward to meeting you. 📍'],

            // Global terminal
            ['S3', 'LOST', 'Lost', '#E0483D', [], 'lost', [], 'lost', true, null],
        ];

        $keep = [];
        foreach ($rows as $i => [$stage, $code, $name, $color, $next, $pipe, $gates, $disp, $terminal, $wa]) {
            $keep[] = $code;
            LeadStatus::updateOrCreate(['code' => $code], [
                'stage_key' => $stage,
                'stage_name' => $laneName[$stage],
                'display_name' => $name,
                'color' => $color,
                'wa_message' => $wa,
                'wa_enabled' => $wa !== null,
                'sort' => $i,
                'is_terminal' => $terminal,
                'disposition' => $disp,
                'allowed_next' => $next,
                'gate_fields' => $gates,
                'sla_minutes' => null,
                'pipeline_slug' => $pipe,
                'lane_sla_minutes' => $laneSla[$stage],
            ]);
        }

        // Remove legacy statuses no longer part of the simplified journey.
        LeadStatus::whereNotIn('code', $keep)->delete();
    }
}
