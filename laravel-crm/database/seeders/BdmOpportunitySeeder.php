<?php

namespace Database\Seeders;

use App\Models\LeadStatus;
use Illuminate\Database\Seeder;

/**
 * BDM Opportunity Pipeline (status_group = 'bdm').
 * A lead enters this pipeline the moment a BDE converts it (books a site visit / Google Meet).
 * The board is a SEPARATE status group from the BDE journey; the BDM owns the lead here.
 *
 * 13 working stages (per the client's "BDM Stages") + Won / Lost terminals.
 */
class BdmOpportunitySeeder extends Seeder
{
    public function run(): void
    {
        $laneName = [
            'OPP1' => 'Engagement',
            'OPP2' => 'Site Visit',
            'OPP3' => 'Post Site Visit',
            'OPP4' => 'Closing',
        ];
        $laneSla = ['OPP1' => 1440, 'OPP2' => 2880, 'OPP3' => 2880, 'OPP4' => 2880];

        // stage, code, display, color, next[], pipeline_slug, disposition, terminal, wa_message
        $rows = [
            // OPP1 — Engagement
            ['OPP1', 'OPP_NOT_CONTACTED', 'Not Contacted', '#E0A63C',
                ['OPP_INITIAL_CALL', 'OPP_SV_RESCHEDULE', 'OPP_LOST'], 'opportunity', null, false, null],
            ['OPP1', 'OPP_INITIAL_CALL', 'Initial Call', '#7C5CC4',
                ['OPP_FOLLOW_UP', 'OPP_SV_POSITIVE', 'OPP_SV_NOSHOW', 'OPP_SV_NO_DECISION', 'OPP_SV_RESCHEDULE', 'OPP_LOST'], 'opportunity', null, false, null],
            ['OPP1', 'OPP_FOLLOW_UP', 'Follow Up', '#2F6FED',
                ['OPP_SV_POSITIVE', 'OPP_SV_NOSHOW', 'OPP_SV_NO_DECISION', 'OPP_SV_RESCHEDULE', 'OPP_POST_SV_FU1', 'OPP_LOST'], 'opportunity', null, false, null],

            // OPP2 — Site Visit
            ['OPP2', 'OPP_SV_RESCHEDULE', 'Site Visit Reschedule', '#E08A2B',
                ['OPP_INITIAL_CALL', 'OPP_SV_POSITIVE', 'OPP_SV_NOSHOW', 'OPP_SV_NO_DECISION', 'OPP_LOST'], 'opportunity', null, false,
                'Hi {name}, no problem — let\'s find a better time for your visit. When suits you best?'],
            ['OPP2', 'OPP_SV_POSITIVE', 'Site Visit Positive', '#4A9D5B',
                ['OPP_POST_SV_FU1', 'OPP_PRICING_SHEET', 'OPP_NEGOTIATION', 'OPP_LOST'], 'negotiation', null, false,
                'Hi {name}, it was wonderful showing you around! We\'ll follow up with the details shortly.'],
            ['OPP2', 'OPP_SV_NOSHOW', 'Site Visit No Show', '#B25A2B',
                ['OPP_SV_RESCHEDULE', 'OPP_POST_SV_FU1', 'OPP_LOST'], 'opportunity', null, false,
                'Hi {name}, sorry we missed you today. Would you like to reschedule your visit?'],
            ['OPP2', 'OPP_SV_NO_DECISION', 'Site Visit No Immediate Decision', '#8A7A2B',
                ['OPP_POST_SV_FU1', 'OPP_POST_SV_FU2', 'OPP_PRICING_SHEET', 'OPP_LOST'], 'opportunity', null, false, null],

            // OPP3 — Post Site Visit
            ['OPP3', 'OPP_POST_SV_FU1', 'Post Site Visit Followup 1', '#3CBA9A',
                ['OPP_POST_SV_FU2', 'OPP_PRICING_SHEET', 'OPP_NEGOTIATION', 'OPP_POST_SV_LOST', 'OPP_LOST'], 'negotiation', null, false,
                'Hi {name}, following up on your visit — happy to answer any questions and share the numbers whenever you\'re ready.'],
            ['OPP3', 'OPP_POST_SV_FU2', 'Post Site Visit Followup 2', '#2E9C86',
                ['OPP_PRICING_SHEET', 'OPP_NEGOTIATION', 'OPP_POST_SV_LOST', 'OPP_LOST'], 'negotiation', null, false, null],
            ['OPP3', 'OPP_POST_SV_LOST', 'Post Site Visit Lost', '#7A211B',
                [], 'lost', 'lost', true, null],

            // OPP4 — Closing
            ['OPP4', 'OPP_PRICING_SHEET', 'Pricing Sheet', '#5C6BC0',
                ['OPP_NEGOTIATION', 'OPP_FINAL_CALL', 'OPP_LOST'], 'negotiation', null, false,
                'Hi {name}, sharing your personalised pricing sheet. Let\'s discuss the best plan for you.'],
            ['OPP4', 'OPP_NEGOTIATION', 'Negotiations', '#D6437F',
                ['OPP_FINAL_CALL', 'OPP_WON', 'OPP_LOST'], 'negotiation', null, false, null],
            ['OPP4', 'OPP_FINAL_CALL', 'Final Call', '#C2410C',
                ['OPP_WON', 'OPP_LOST'], 'negotiation', null, false, null],

            // Terminals
            ['OPP4', 'OPP_WON', 'Won', '#2F7D32', [], 'won', 'won', true,
                'Congratulations {name}! 🎉 Welcome to the Agrocorp family. Our team will be in touch with next steps.'],
            ['OPP4', 'OPP_LOST', 'Lost', '#E0483D', [], 'lost', 'lost', true, null],
        ];

        $keep = [];
        foreach ($rows as $i => [$stage, $code, $name, $color, $next, $pipe, $disp, $terminal, $wa]) {
            $keep[] = $code;
            LeadStatus::updateOrCreate(['code' => $code], [
                'status_group' => 'bdm',
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
                'gate_fields' => [],
                'sla_minutes' => null,
                'pipeline_slug' => $pipe,
                'lane_sla_minutes' => $laneSla[$stage],
            ]);
        }

        // Only prune stale rows inside the BDM group — never touch BDE journey statuses.
        LeadStatus::where('status_group', 'bdm')->whereNotIn('code', $keep)->delete();
    }
}
