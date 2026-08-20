# WhatsApp Templates to create in Meta Business Manager

Create these **exact template names** (lowercase, underscores) in WhatsApp Manager → Message Templates.
The CRM syncs them automatically (Integrations → WhatsApp → Sync templates), and the lead-journey
automations fire them on each stage change as soon as they are **Approved**.

## Rules
- **Every template uses ONE body variable: `{{1}}` = customer's first name.** (Keep it to one variable so the
  CRM can fill it deterministically — no mismatch errors.)
- Category: **Marketing** (or **Utility** where noted) · Language: **English (en_US)**.
- Header/footer optional. Put brochure / cost-sheet / booking links as static text or a URL button in the template.

## Template list

### Essential for the demo flow ⭐
| # | Template name | Fires on stage | Suggested body |
|---|---|---|---|
| 1 | `lead_acknowledgement` ⭐ | New lead (Not Contacted) | Hi {{1}}, thank you for your interest in Agrocorp. Our team will reach out to you shortly. |
| 2 | `lead_collateral` ⭐ | Contacted | Hi {{1}}, great speaking with you! Sharing the brochure, floor plans & price list we discussed. |
| 3 | `lead_followup` ⭐ | Follow-Up 1/2/3 | Hi {{1}}, just following up on your interest. Would you like to schedule a site visit? |
| 4 | `site_visit_confirmation` ⭐ | Converted / Site visit booked | Hi {{1}}, your site visit is confirmed! Our team looks forward to meeting you. |
| 5 | `pricing_sheet` ⭐ | Pricing Sheet (BDM) | Hi {{1}}, sharing your personalised pricing sheet. Let's discuss the best plan for you. |
| 6 | `negotiation` ⭐ | Negotiations (BDM) | Hi {{1}}, let's work out the best possible deal for you. Our team will call to finalise the numbers. |
| 7 | `final_call` ⭐ | Final Call (BDM) | Hi {{1}}, we're almost there! A quick final call to lock in your booking. |
| 8 | `booking_confirmation` ⭐ | Won / Booking confirmed | Congratulations {{1}}! Welcome to the Agrocorp family. Our team will be in touch with next steps. |

### Full journey (create when you can)
| # | Template name | Fires on stage | Suggested body |
|---|---|---|---|
| 9 | `lead_no_response` | No Response | Hi {{1}}, we tried reaching you regarding your interest in Agrocorp but couldn't connect. We'll try again soon! |
| 10 | `site_visit_reschedule` | Site Visit Reschedule | Hi {{1}}, no problem — let's find a better time for your visit. When suits you best? |
| 11 | `site_visit_noshow` | Site Visit No Show | Hi {{1}}, sorry we missed you today. Would you like to reschedule your visit? |
| 12 | `post_visit_followup` | Post Site Visit Follow-up | Hi {{1}}, following up on your visit — happy to answer any questions and share the numbers whenever you're ready. |
| 13 | `site_visit_reminder` (Utility) | Reminder before visit | Hi {{1}}, a reminder that your Agrocorp site visit is coming up. See you soon! |
| 14 | `payment_received` (Utility) | Payment received | Hi {{1}}, we've received your payment. Your receipt is on its way. Thank you! |
| 15 | `welcome_customer` | Post-sales welcome | Hi {{1}}, welcome to the Agrocorp family! Your relationship manager will be in touch shortly. |
| 16 | `payment_reminder` (Utility) | Milestone due | Hi {{1}}, a friendly reminder that your next payment milestone is due soon. |
| 17 | `lead_lost_thankyou` | Lost | Hi {{1}}, thank you for reaching out to Agrocorp. We're always here whenever you'd like to explore again. |

## After approval
1. Integrations → WhatsApp → **Sync templates from Meta**.
2. The journey automations will start firing these templates on each stage change (outside the 24-hour window).
   Until they're approved (and while the driver is in mock mode) the CRM sends the equivalent free-text message so
   nothing stalls.

> **Email templates need no Meta approval** — they are seeded inside the CRM and fire automatically on each stage.
