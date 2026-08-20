# WhatsApp Templates to create in Meta Business Manager (COMPLETE list)

The lead journey + reminders + post-sales all send customer WhatsApp messages. Create every template
below in WhatsApp Manager → Message Templates. The CRM syncs them (Integrations → WhatsApp → Sync) and
fires them automatically. Outside the 24h customer-service window, WhatsApp REQUIRES an approved template.

## Global rules
- Language: **English (en_US)**. Header/footer optional.
- Put dynamic values as numbered body variables `{{1}}`, `{{2}}`, ... in the ORDER listed below.
- **Category:** Marketing = promotional/journey nudges · Utility = reminders/receipts/transactional.
- Reminder/engagement templates may include a **quick-reply button "Reschedule"** where noted.

---

## A. Stage-change templates — fire automatically when a BDE/BDM changes the lead's status
These are wired now (one per journey status). Engine sends **{{1}} = customer first name**.

| # | Template name | Category | Fires on status | Body idea |
|---|---|---|---|---|
| 1 | `lead_acknowledgement` | Marketing | Not Contacted (new lead) | Hi {{1}}, thank you for your interest in Agrocorp. Our team will reach out shortly. |
| 2 | `lead_collateral` | Marketing | Contacted | Hi {{1}}, great speaking with you! Sharing the brochure, floor plans & price list. |
| 3 | `lead_no_response` | Utility | No Response | Hi {{1}}, we tried reaching you but couldn't connect. We'll try again soon! |
| 4 | `lead_followup` | Marketing | Follow-Up 1 / 2 / 3 | Hi {{1}}, following up on your interest. Shall we schedule a site visit? |
| 5 | `site_visit_confirmation` | Utility | Converted / visit booked | Hi {{1}}, your site visit is confirmed! Our team looks forward to meeting you. |
| 6 | `site_visit_reschedule` | Utility | Site Visit Reschedule | Hi {{1}}, no problem — let's find a better time for your visit. When suits you? |
| 7 | `site_visit_noshow` | Utility | Site Visit No Show | Hi {{1}}, sorry we missed you today. Would you like to reschedule your visit? |
| 8 | `post_visit_followup` | Marketing | SV Positive / Post-SV FU1 / FU2 | Hi {{1}}, following up on your visit — happy to share the numbers whenever you're ready. |
| 9 | `pricing_sheet` | Marketing | Pricing Sheet | Hi {{1}}, sharing your personalised pricing sheet. Let's discuss the best plan. |
| 10 | `negotiation` | Marketing | Negotiations | Hi {{1}}, let's work out the best possible deal. Our team will call to finalise. |
| 11 | `final_call` | Marketing | Final Call | Hi {{1}}, we're almost there! A quick final call to lock in your booking. |
| 12 | `booking_confirmation` | Utility | Won / Booking confirmed | Congratulations {{1}}! Your booking is confirmed. Welcome to the Agrocorp family. |
| 13 | `lead_lost_thankyou` | Marketing | Lost (any) | Hi {{1}}, thank you for reaching out to Agrocorp. We're here whenever you'd like to explore again. |

---

## B. Reminders & engagement — sent by the scheduler (crm:reminders / engagement loop)
Currently these send as free-text within the 24h window. For guaranteed out-of-window delivery, create
these templates (the main agent can wire the services to use them on request).

| # | Template name | Category | When | Variables |
|---|---|---|---|---|
| 14 | `appointment_reminder` | Utility | Every 2 days until the booked appointment (engagement loop). Add **Reschedule** quick-reply button. | {{1}} name, {{2}} visit date/time |
| 15 | `site_visit_reminder` | Utility | 24h & 1h before the site visit | {{1}} name, {{2}} date/time, {{3}} meeting point |
| 16 | `document_reminder` | Utility | Pending KYC/booking document | {{1}} name, {{2}} document name |
| 17 | `payment_reminder` | Utility | Milestone due (before + on due date) | {{1}} name, {{2}} milestone label, {{3}} amount, {{4}} due date |
| 18 | `payment_overdue` | Utility | Milestone overdue (one-time nudge + pay link) | {{1}} name, {{2}} milestone, {{3}} amount, {{4}} pay link |

---

## C. Post-sales & payments — booking → customer lifecycle
| # | Template name | Category | When | Variables |
|---|---|---|---|---|
| 19 | `booking_form` | Utility | Deal Won → booking form link sent | {{1}} name, {{2}} form link, {{3}} token amount |
| 20 | `payment_received` | Utility | Payment recorded / receipt | {{1}} name, {{2}} amount, {{3}} receipt no |
| 21 | `welcome_customer` | Utility | Booking confirmed → welcome letter | {{1}} name, {{2}} booking ref |
| 22 | `allotment_confirmed` | Utility | Allotment letter issued (≥10% collected) | {{1}} name, {{2}} allotment ref |
| 23 | `demand_notice` | Utility | Formal demand letter for overdue milestone | {{1}} name, {{2}} amount, {{3}} due date |

---

## Minimum set for the core demo (BDE → BDM → Won → Post-sales)
1, 2, 4, 5, 9, 10, 11, 12 (journey) + 19, 20, 21 (booking/receipt/welcome) + 14/15 (reminders if you demo scheduling).

## After approval
Integrations → WhatsApp → **Sync templates from Meta**. Section A fires immediately on stage changes.
For Sections B & C to send as approved templates (not free-text), tell the main agent to wire the
scheduler/post-sales/payment services to `sendTemplate` with the variables above.

> **Email templates need NO Meta approval** — they are seeded in the CRM and fire automatically per stage.
