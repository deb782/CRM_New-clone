<?php

namespace Database\Seeders;

use App\Models\LeadStatus;
use Illuminate\Database\Seeder;

/**
 * Seeds the 5-stage lead status catalog from the Agrocorp CRM Operating Guidebook.
 * Each status has allow-listed transitions, optional mandatory gates and SLA clocks.
 */
class LeadJourneySeeder extends Seeder
{
    public function run(): void
    {
        $laneSla = ['S1' => 120, 'S2' => 1440, 'S3' => 2880, 'S4' => 1440, 'S5' => null];
        $laneName = [
            'S1' => 'Lead Entry',
            'S2' => 'Qualification',
            'S3' => 'Meeting & Site Visit',
            'S4' => 'Booking & Verification',
            'S5' => 'Customer Lifecycle',
        ];

        // stage_key, code, display, allowed_next[], sla_minutes, pipeline_slug, gate_fields[], disposition, terminal
        $rows = [
            // Stage 1
            ['S1', 'S1_NEW', 'New Lead', ['S1_REVIEW', 'S1_ASSIGNED', 'S1_DUPLICATE_REVIEW', 'CLOSED_INVALID'], null, 'new_lead', [], null, false],
            ['S1', 'S1_REVIEW', 'Validation / Routing', ['S1_ASSIGNED', 'S1_DUPLICATE_REVIEW', 'CLOSED_INVALID'], null, 'new_lead', [], null, false],
            ['S1', 'S1_DUPLICATE_REVIEW', 'Duplicate Review', ['S1_ASSIGNED', 'CLOSED_DUPLICATE'], null, 'new_lead', [], null, false],
            ['S1', 'S1_ASSIGNED', 'Assigned – Contact Due', ['S1_FIRST_ATTEMPT', 'S1_REASSIGNMENT'], 120, 'contacted', [], null, false],
            ['S1', 'S1_REASSIGNMENT', 'Reassignment Required', ['S1_ASSIGNED'], null, 'contacted', [], null, false],
            ['S1', 'S1_FIRST_ATTEMPT', 'First Contact Attempted', ['S2_CONTACTING', 'S2_QUALIFYING', 'S2_NRTY'], null, 'contacted', [], null, false],

            // Stage 2
            ['S2', 'S2_CONTACTING', 'Contacting / Profiling', ['S2_QUALIFYING', 'S2_NRTY', 'S2_NURTURE', 'CLOSED_DISQUALIFIED'], 1440, 'contacted', [], null, false],
            ['S2', 'S2_NRTY', 'NRTY / Retry Programme', ['S2_QUALIFYING', 'S2_NURTURE', 'CLOSED_UNRESPONSIVE'], null, 'contacted', [], null, false],
            ['S2', 'S2_QUALIFYING', 'Connected – Qualification', ['S2_NURTURE', 'S2_MEETING_PLAN', 'CLOSED_DISQUALIFIED'], 1440, 'interested', [], null, false],
            ['S2', 'S2_NURTURE', 'Active Nurture', ['S2_QUALIFYING', 'S2_MEETING_PLAN', 'S2_LONG_TERM'], null, 'interested', [], null, false],
            ['S2', 'S2_MEETING_PLAN', 'Meeting / Visit Planning', ['S2_MEETING_SCHEDULED', 'S2_NURTURE'], null, 'interested', [], null, false],
            ['S2', 'S2_MEETING_SCHEDULED', 'Meeting / Visit Scheduled', ['S3_HANDOVER_PENDING', 'S3_APPT_CONFIRMED'], null, 'site_visit_scheduled', ['budget_min', 'timeline'], null, false],
            ['S2', 'S2_LONG_TERM', 'Long-Term Recycle', ['S2_NURTURE', 'S2_QUALIFYING', 'CLOSED_LOST'], null, 'interested', [], 'nurture', false],

            // Stage 3
            ['S3', 'S3_HANDOVER_PENDING', 'Handover Pending', ['S3_APPT_CONFIRMED', 'S3_RESCHEDULE'], 2880, 'opportunity', [], null, false],
            ['S3', 'S3_APPT_CONFIRMED', 'Appointment Confirmed', ['S3_MEETING_COMPLETED', 'S3_RESCHEDULE', 'S3_NO_SHOW'], null, 'opportunity', [], null, false],
            ['S3', 'S3_RESCHEDULE', 'Reschedule in Progress', ['S3_APPT_CONFIRMED', 'S2_MEETING_PLAN'], null, 'opportunity', [], null, false],
            ['S3', 'S3_NO_SHOW', 'No Show – Recovery', ['S3_RESCHEDULE', 'S3_FOLLOW_UP', 'CLOSED_LOST'], null, 'opportunity', [], null, false],
            ['S3', 'S3_MEETING_COMPLETED', 'Meeting / Visit Completed', ['S3_COST_SHEET_PREP', 'S3_FOLLOW_UP', 'CLOSED_LOST'], null, 'site_visit_completed', [], null, false],
            ['S3', 'S3_COST_SHEET_PREP', 'Cost Sheet Preparation', ['S3_COST_SHEET_SHARED'], null, 'negotiation', [], null, false],
            ['S3', 'S3_COST_SHEET_SHARED', 'Cost Sheet Shared', ['S3_FOLLOW_UP', 'S3_BOOKING_INTENT'], null, 'negotiation', [], null, false],
            ['S3', 'S3_FOLLOW_UP', 'Commercial Follow-Up / Negotiation', ['S3_COST_SHEET_SHARED', 'S3_BOOKING_INTENT', 'CLOSED_LOST'], null, 'negotiation', [], null, false],
            ['S3', 'S3_BOOKING_INTENT', 'Booking Intent – Payment Pending', ['S3_PAYMENT_SUBMITTED', 'S3_FOLLOW_UP'], null, 'opportunity', [], null, false],
            ['S3', 'S3_PAYMENT_SUBMITTED', 'Booking Payment Submitted', ['S4_VERIFY_PENDING'], null, 'opportunity', [], null, false],

            // Stage 4
            ['S4', 'S4_VERIFY_PENDING', 'Booking Payment Verification Pending', ['S4_VERIFIED', 'S4_PAYMENT_EXCEPTION'], 1440, 'opportunity', [], null, false],
            ['S4', 'S4_PAYMENT_EXCEPTION', 'Payment Exception', ['S4_VERIFY_PENDING', 'S3_BOOKING_INTENT', 'CLOSED_LOST'], null, 'opportunity', [], null, false],
            ['S4', 'S4_VERIFIED', 'Booking Payment Verified', ['S4_HANDOVER_PENDING'], null, 'opportunity', [], null, false],
            ['S4', 'S4_HANDOVER_PENDING', 'Post-Sales Handover Pending', ['S4_HANDOVER_ACCEPTED'], null, 'opportunity', [], null, false],
            ['S4', 'S4_HANDOVER_ACCEPTED', 'Post-Sales Handover Accepted', ['S4_CONVERSION_READY'], null, 'opportunity', [], null, false],
            ['S4', 'S4_CONVERSION_READY', 'Conversion Checks Complete', ['S4_CONVERTED'], null, 'opportunity', [], null, false],
            ['S4', 'S4_CONVERTED', 'Converted to Customer', ['S5_DOCS_PENDING'], null, 'won', [], null, false],

            // Stage 5
            ['S5', 'S5_DOCS_PENDING', 'Agreement / KYC Documents Pending', ['S5_LEGAL_REVIEW', 'S5_AGREEMENT_READY'], null, 'won', [], null, false],
            ['S5', 'S5_LEGAL_REVIEW', 'Legal Review / Revision', ['S5_AGREEMENT_READY', 'S5_DOCS_PENDING'], null, 'won', [], null, false],
            ['S5', 'S5_AGREEMENT_READY', 'Agreement Ready for Execution', ['S5_AGREEMENT_EXECUTED'], null, 'won', [], null, false],
            ['S5', 'S5_AGREEMENT_EXECUTED', 'Agreement Executed / Registered', ['S5_PAYMENT_PLAN_ACTIVE'], null, 'won', [], null, false],
            ['S5', 'S5_PAYMENT_PLAN_ACTIVE', 'Payment Plan Active', ['S5_CURRENT', 'S5_DUE_SOON', 'S5_OVERDUE'], null, 'won', [], null, false],
            ['S5', 'S5_CURRENT', 'Payments Current', ['S5_DUE_SOON', 'S5_RELATIONSHIP'], null, 'won', [], null, false],
            ['S5', 'S5_DUE_SOON', 'Instalment Due Soon', ['S5_CURRENT', 'S5_OVERDUE'], null, 'won', [], null, false],
            ['S5', 'S5_OVERDUE', 'Payment Overdue', ['S5_CURRENT', 'S5_RESTRUCTURE'], null, 'won', [], null, false],
            ['S5', 'S5_RESTRUCTURE', 'Payment Exception / Restructure Review', ['S5_PAYMENT_PLAN_ACTIVE', 'S5_OVERDUE'], null, 'won', [], null, false],
            ['S5', 'S5_RELATIONSHIP', 'Ongoing Relationship / Service', [], null, 'won', [], null, false],

            // Terminal dispositions
            ['S1', 'CLOSED_INVALID', 'Closed – Invalid', [], null, 'not_interested', [], 'lost', true],
            ['S1', 'CLOSED_DUPLICATE', 'Closed – Duplicate', [], null, 'not_interested', [], 'lost', true],
            ['S2', 'CLOSED_DISQUALIFIED', 'Closed – Disqualified', [], null, 'not_interested', [], 'lost', true],
            ['S2', 'CLOSED_UNRESPONSIVE', 'Closed – Unresponsive', [], null, 'no_response', [], 'lost', true],
            ['S3', 'CLOSED_LOST', 'Closed – Lost', [], null, 'lost', [], 'lost', true],
        ];

        foreach ($rows as $i => [$stage, $code, $name, $next, $sla, $pipe, $gates, $disp, $terminal]) {
            LeadStatus::updateOrCreate(['code' => $code], [
                'stage_key' => $stage,
                'stage_name' => $laneName[$stage],
                'display_name' => $name,
                'sort' => $i,
                'is_terminal' => $terminal,
                'disposition' => $disp,
                'allowed_next' => $next,
                'gate_fields' => $gates,
                'sla_minutes' => $sla,
                'pipeline_slug' => $pipe,
                'lane_sla_minutes' => $laneSla[$stage],
            ]);
        }
    }
}
