<?php

namespace Database\Seeders;

use App\Models\LeadStatus;
use Illuminate\Database\Seeder;

/**
 * BDM Opportunity Pipeline (status_group = 'bdm') — Stages 3-4 of the Operating Guidebook.
 * A lead enters when a BDE converts it (site visit / Google Meet booked). BDM owns it here.
 * On WON, ownership hands over to Post-Sales (crm_head) and a booking confirmation fires.
 *
 * WhatsApp templates use a single variable {{1}} = customer first name.
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

        // code => [stage, display, color, next[], pipeline_slug, disposition, terminal,
        //          wa_message, wa_template, email_subject, email_body, owner_role]
        $rows = [
            // OPP1 — Engagement (BDM owns from here)
            'OPP_NOT_CONTACTED' => ['OPP1', 'Not Contacted', '#E0A63C',
                ['OPP_INITIAL_CALL', 'OPP_SV_RESCHEDULE', 'OPP_LOST'], 'opportunity', null, false,
                null, null, null, null, 'sales_bdm'],
            'OPP_INITIAL_CALL' => ['OPP1', 'Initial Call', '#7C5CC4',
                ['OPP_FOLLOW_UP', 'OPP_SV_POSITIVE', 'OPP_SV_NOSHOW', 'OPP_SV_NO_DECISION', 'OPP_SV_RESCHEDULE', 'OPP_LOST'], 'opportunity', null, false,
                null, null, null, null, 'sales_bdm'],
            'OPP_FOLLOW_UP' => ['OPP1', 'Follow Up', '#2F6FED',
                ['OPP_SV_POSITIVE', 'OPP_SV_NOSHOW', 'OPP_SV_NO_DECISION', 'OPP_SV_RESCHEDULE', 'OPP_POST_SV_FU1', 'OPP_LOST'], 'opportunity', null, false,
                null, null, null, null, 'sales_bdm'],

            // OPP2 — Site Visit
            'OPP_SV_RESCHEDULE' => ['OPP2', 'Site Visit Reschedule', '#E08A2B',
                ['OPP_INITIAL_CALL', 'OPP_SV_POSITIVE', 'OPP_SV_NOSHOW', 'OPP_SV_NO_DECISION', 'OPP_LOST'], 'opportunity', null, false,
                'Hi {name}, no problem — let\'s find a better time for your visit. When suits you best?',
                'site_visit_reschedule',
                'Let\'s reschedule your Agrocorp visit',
                "Hi {name},\n\nNo problem at all — let's find a better time for your visit to {project}. Please share a slot that suits you and we'll confirm right away.\n\nWarm regards,\nTeam Agrocorp",
                null],
            'OPP_SV_POSITIVE' => ['OPP2', 'Site Visit Positive', '#4A9D5B',
                ['OPP_POST_SV_FU1', 'OPP_PRICING_SHEET', 'OPP_NEGOTIATION', 'OPP_LOST'], 'negotiation', null, false,
                'Hi {name}, it was wonderful showing you around! We\'ll follow up with the details shortly.',
                'post_visit_followup',
                'Thank you for visiting Agrocorp',
                "Hi {name},\n\nIt was wonderful showing you around {project}! We'll follow up shortly with the details and pricing. Do reach out with any questions.\n\nWarm regards,\nTeam Agrocorp",
                null],
            'OPP_SV_NOSHOW' => ['OPP2', 'Site Visit No Show', '#B25A2B',
                ['OPP_SV_RESCHEDULE', 'OPP_POST_SV_FU1', 'OPP_LOST'], 'opportunity', null, false,
                'Hi {name}, sorry we missed you today. Would you like to reschedule your visit?',
                'site_visit_noshow',
                'Sorry we missed you — Agrocorp',
                "Hi {name},\n\nSorry we missed you for the visit to {project} today. Would you like to reschedule? We're happy to arrange a time that works for you.\n\nWarm regards,\nTeam Agrocorp",
                null],
            'OPP_SV_NO_DECISION' => ['OPP2', 'Site Visit No Immediate Decision', '#8A7A2B',
                ['OPP_POST_SV_FU1', 'OPP_POST_SV_FU2', 'OPP_PRICING_SHEET', 'OPP_LOST'], 'opportunity', null, false,
                null, null, null, null, null],

            // OPP3 — Post Site Visit
            'OPP_POST_SV_FU1' => ['OPP3', 'Post Site Visit Followup 1', '#3CBA9A',
                ['OPP_POST_SV_FU2', 'OPP_PRICING_SHEET', 'OPP_NEGOTIATION', 'OPP_POST_SV_LOST', 'OPP_LOST'], 'negotiation', null, false,
                'Hi {name}, following up on your visit — happy to answer any questions and share the numbers whenever you\'re ready.',
                'post_visit_followup',
                'Following up on your Agrocorp visit',
                "Hi {name},\n\nFollowing up on your visit to {project} — we're happy to answer any questions and share the numbers whenever you're ready.\n\nWarm regards,\nTeam Agrocorp",
                null],
            'OPP_POST_SV_FU2' => ['OPP3', 'Post Site Visit Followup 2', '#2E9C86',
                ['OPP_PRICING_SHEET', 'OPP_NEGOTIATION', 'OPP_POST_SV_LOST', 'OPP_LOST'], 'negotiation', null, false,
                'Hi {name}, checking in again on your interest — shall we take the next step together?',
                'post_visit_followup',
                'Checking in — Agrocorp',
                "Hi {name},\n\nChecking in again on your interest in {project}. Shall we take the next step together? We're here to help.\n\nWarm regards,\nTeam Agrocorp",
                null],
            'OPP_POST_SV_LOST' => ['OPP3', 'Post Site Visit Lost', '#7A211B',
                [], 'lost', 'lost', true,
                null, 'lead_lost_thankyou',
                'Thank you for reaching out to Agrocorp',
                "Hi {name},\n\nThank you for considering Agrocorp for {project}. We're always here whenever you'd like to explore again.\n\nWarm regards,\nTeam Agrocorp",
                null],

            // OPP4 — Closing
            'OPP_PRICING_SHEET' => ['OPP4', 'Pricing Sheet', '#5C6BC0',
                ['OPP_NEGOTIATION', 'OPP_FINAL_CALL', 'OPP_LOST'], 'negotiation', null, false,
                'Hi {name}, sharing your personalised pricing sheet. Let\'s discuss the best plan for you.',
                'pricing_sheet',
                'Your personalised pricing sheet — Agrocorp',
                "Hi {name},\n\nPlease find your personalised pricing / cost sheet for {project} attached. Let's discuss the best payment plan for you.\n\nWarm regards,\nTeam Agrocorp",
                'sales_bdm'],
            'OPP_NEGOTIATION' => ['OPP4', 'Negotiations', '#D6437F',
                ['OPP_FINAL_CALL', 'OPP_WON', 'OPP_LOST'], 'negotiation', null, false,
                'Hi {name}, let\'s work out the best possible deal for you. Our team will call to finalise the numbers.',
                'negotiation',
                'Let\'s finalise your Agrocorp deal',
                "Hi {name},\n\nLet's work out the best possible deal for you on {project}. Our team will call shortly to finalise the numbers.\n\nWarm regards,\nTeam Agrocorp",
                null],
            'OPP_FINAL_CALL' => ['OPP4', 'Final Call', '#C2410C',
                ['OPP_WON', 'OPP_LOST'], 'negotiation', null, false,
                'Hi {name}, we\'re almost there! A quick final call to lock in your booking — talk soon.',
                'final_call',
                'Almost there — final step for your Agrocorp booking',
                "Hi {name},\n\nWe're almost there! Just a quick final call to lock in your booking for {project}. Talk soon.\n\nWarm regards,\nTeam Agrocorp",
                null],

            // Terminals
            'OPP_WON' => ['OPP4', 'Won', '#2F7D32', [], 'won', 'won', true,
                'Congratulations {name}! 🎉 Welcome to the Agrocorp family. Our team will be in touch with next steps.',
                'booking_confirmation',
                'Booking confirmed — welcome to Agrocorp! 🎉',
                "Hi {name},\n\nCongratulations and welcome to the Agrocorp family! Your booking for {project} is confirmed. Our post-sales team will reach out with the next steps, documentation and payment schedule.\n\nWarm regards,\nTeam Agrocorp",
                'crm_head'],
            'OPP_LOST' => ['OPP4', 'Lost', '#E0483D', [], 'lost', 'lost', true,
                null, 'lead_lost_thankyou',
                'Thank you for reaching out to Agrocorp',
                "Hi {name},\n\nThank you for considering Agrocorp for {project}. We're always here whenever you'd like to explore again.\n\nWarm regards,\nTeam Agrocorp",
                null],
        ];

        $keep = [];
        $i = 0;
        foreach ($rows as $code => [$stage, $name, $color, $next, $pipe, $disp, $terminal, $wa, $waTpl, $emSubj, $emBody, $ownerRole]) {
            $keep[] = $code;
            LeadStatus::updateOrCreate(['code' => $code], [
                'status_group' => 'bdm',
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
