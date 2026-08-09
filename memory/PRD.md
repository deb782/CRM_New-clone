# PRD — Real Estate CRM (Laravel 11) · Part 1 of 3

## Original problem statement
Extend a Laravel 11 + MySQL codebase to build a Real Estate CRM (Pre-Sales · Sales · Post-Sales),
Attio-inspired UI, single-tenant. build.docx Sections A–T = acceptance checklist. Integrations:
Razorpay, WATI (WhatsApp), SMTP+SMS, mock e-sign, basic in-app accounting. Community (Part 2)
and Farm (Part 3) build on this foundation.

## User decisions (locked)
- Stack: **Laravel 11 + MySQL** (Emergent preview NOT used; run locally via `php artisan serve`).
- Auth: **JWT/Sanctum bearer** custom auth.
- Integrations: **mock/stub** for this slice (WhatsApp/Telephony/Email drivers), real keys later.
- Scope for first build: **Phase A (Sections A–H, Pre-Sales)** first, then layer B–T.

## Architecture
- Laravel 11 (`bootstrap/app.php`), MySQL/MariaDB, Eloquent, single unified schema migration.
- Sanctum bearer auth + `CheckPermission` RBAC middleware; 5 seeded roles.
- Database queue + scheduler; console commands `crm:automation`, `crm:reminders`, `crm:webhooks`.
- Vanilla JS SPA (5 files) via Blade; Attio-style light/dark theme, no build tooling.
- Integration adapters via `IntegrationsServiceProvider`: WhatsApp (mock/wati/cloud), Telephony (mock/exotel), Email (smtp/log).
- Location: `/app/laravel-crm`. App: http://127.0.0.1:8000, API: /api/v1.

## User personas / roles
Administrator · Sales Manager · Sales Exec · Marketing · CRM Ops (RBAC via permissions).
(Full 8-role model — Post-Sales/Accounts/Channel Partner — added with Phases C–D.)

## Implemented (2026-06 — Phase A complete, verified)
- **A Lead capture**: website/Meta form webhook, manual entry, bulk CSV import (preview + per-row status + error log), auto-acknowledgement, source/campaign/geo tagging, round-robin routing, Verify-Lead task.
- **B Duplicate detection**: real-time email/phone block + fuzzy flag, manual merge w/ history consolidation, periodic scan, lead↔contact linking.
- **C Verification & contact**: Verify task + 2h SLA escalation, call logging (outcome/duration/notes/recording), WhatsApp send + inbound import, contact-verified flags.
- **D Qualification & scoring**: qualification fields, auto score + temperature (Hot 70+/Warm 40–69/Cold <40), admin-configurable scoring rules, objection capture.
- **E Nurturing**: Hot/Warm/Cold sequences (6 touchpoints), auto-enroll by temperature, auto-pause on won/negative, welcome automation.
- **F Follow-up tracking**: per-channel logging w/ open/click/read tracking, over-contact guards, escalation flags.
- **G Status engine**: positive/negative/special transitions, override + reason + audit, manager approval for downgrades.
- **H Scoring & prioritization**: configurable factors, daily recalculation command, prioritized call list.
- **T (partial)**: full audit trail, automation logs, error/retry handling.
- Role dashboards (funnel, temperature, source), Kanban pipeline, config screens (scoring/automation/templates/users).
- Verified: 26/26 backend tests pass; all frontend flows pass.

## MOCKED / stubbed
- WhatsApp (WATI/Cloud) — mock driver. Telephony (Exotel) — mock. Email — logged, not delivered.
- Razorpay, e-sign, SMS gateway, chatbot, Meta lead-ads, calendar — not wired this phase (Phase B–D).

## Implemented — Phase B (2026-06, verified 44/44 tests)
- **Inventory (Projects→Phases→Plots)**: full tree with availability counts, phase + plot CRUD (RBAC-gated), color-coded board UI (available/held/booked/sold), unit specs (type/area/floor/facing/price).
- **I Site-visit scheduling**: slot availability, schedule from lead drawer (auto stage→Site Visit Scheduled), WhatsApp+email confirmation, 24h/1h reminders + no-show detection via `crm:reminders`, confirm/reschedule (with 3rd-reschedule escalation, 4th→no_response).
- **J Execution & outcomes**: geo check-in/out, site-visit report, outcomes (interested/considering/not_interested/no_show/reschedule) with defined follow-ups.
- **K Sales handover**: interested outcome → lead→negotiation, plot auto-held for lead, 24h sales-contact SLA task, follow-up email.
- Site Visits list page (upcoming/completed/no-show/all) with per-row actions; visits surfaced in lead drawer side panel.

- **L Cost sheets & proposals**: cost-sheet generator (base/GST/registration/maintenance/other) with live totals, payment-plan selection (seeded CLP/DP/Flexi), discount bands (≤5% auto, >5% & >10% require manager approval), approval workflow (approve/reject/counter) with RBAC (`discounts.approve`), one-click proposal generation with unique reference number, share via WhatsApp+email, and consent capture. New Quote tab in lead drawer + Discount Approvals & Payment Plans config pages.

## Implemented — Phase C start · Section M (2026-06, verified 7/7 + regression)
- **Deal Won/Lost**: one-click close from the lead drawer. Won → auto-initiates a booking, holds/marks the unit booked, sends the booking form (WhatsApp+email), hands over to Post-Sales and **locks the lead record**. Lost → captures loss reason, releases held inventory, pauses nurturing and schedules 30-day re-engagement.
- **Booking form**: unique token link (public GET/POST, no auth) for buyer to submit applicant/KYC/nominee details → internal verification.
- **Token/EOI payment**: mock payment link + record-token action (Razorpay slots in next); booking auto-**confirmed** once verified + paid.
- **Record lock (RBAC)**: locked leads return 423 on pre-sales edit/qualify; only Post-Sales/CS (new `post_sales` role, `postsales.manage`) or Admin can edit. New `cs@crm.local` user seeded.
- **UI**: Won/Lost actions + lock banner + Booking tab in the lead drawer, and a Bookings list page.

## Implemented — Phase C · Section N (2026-06, verified 77/77 = 12 Section N + 65 regression)
- **Payments & receipts**: record payments against a booking (token/EOI/milestone/registration/other; methods online/razorpay/cheque/neft/upi/cash) with auto serial receipt (`RCPT-YYYY-NNNNN`). Token/EOI payment marks booking token paid → confirms booking when form also verified.
- **Accounts verification & reconciliation**: accounts verify a received payment, then reconcile against bank statement (matched → reconciled, else discrepancy + note). Reconciliation dashboard endpoint (`GET /payments/reconciliation`) with per-status counts/totals, total collected, and discrepancy list.
- **Welcome letter**: auto-generated + sent (WhatsApp+email, mock) on booking confirmation with serial `WEL-YYYY-NNNN`; idempotent.
- **Document checklist**: 7-item KYC/financial/legal checklist auto-seeded on confirmation; per-item status (pending→received→verified/rejected); pending-required-doc reminders via `crm:reminders`.
- **Razorpay webhook** now records payments through PaymentService with idempotency (skips duplicate gateway_ref). Still mock until live keys added.
- **UI**: new **Post-Sales** tab in the lead drawer (payments+receipts with verify/match/discrepancy, record-payment modal, document checklist with received/verify, letters with generate-welcome).
- New files: migration `2026_01_05_...payments_documents_letters`, models `Payment/DocumentChecklistItem/Letter`, services `PaymentService/PostSalesService`, controllers `PaymentController/PostSalesController`.

## Implemented — Phase C · Sections O, P, Q (2026-06, verified 92/92 tests)
- **P Milestone payment schedule**: auto-derived from the booking's payment plan on confirmation (default 5 milestones); token 10% auto-fills the first milestone. Per-milestone payment + receipt, status engine (pending/due/partial/paid/overdue). 30/15/7/1-day + due-date reminders via `crm:reminders`. **Collections dashboard** (`GET /collections`): collected vs scheduled vs outstanding + aging buckets (current/0-30/31-60/61-90/90+) + overdue milestone list. New sidebar pages: Collections.
- **O Allotment & AFS**: allotment letter (`ALT-YYYY-NNNN`) auto-issued once collection ≥10% of deal value. RERA-style **Agreement for Sale** (`AFS-YYYY-NNNN`) lifecycle: draft → send-for-sign (mock e-sign ref + 5-day review window) → signed → registered (registration no). Idempotent per booking.
- **Q Demand letters**: serial `DMD-YYYY-NNNN` for overdue milestones with 18% p.a. late-interest (total = outstanding + interest). Auto-issued for overdue milestones by `crm:reminders`. Delivery log (whatsapp+email / registered post w/ tracking ref) + escalation to manager/legal (creates task). New sidebar page: Demand Letters.
- **UI**: Post-Sales tab in the lead drawer now also shows Payment Schedule (pay modal), Agreement for Sale (workflow buttons), and Demand Letters. Collections + Demand Letters list pages.
- **Dev**: login throttle raised 20→60/min to avoid 429 flakes in test suites.
- New files: migration `2026_01_06_...payment_schedule_and_agreements`, models `PaymentMilestone/Agreement/DemandLetter`, services `PaymentScheduleService/AgreementService/DemandLetterService`, controllers `PaymentScheduleController/AgreementController/DemandLetterController`.

## Implemented — Phase D · Section T (2026-06, verified: Section T 8/8, overall 99/100)
- **T1 Audit trail viewer**: `GET /audit-logs` (paginated, filters: action / entity type / user / date) + **Audit Log** page showing field-level change history (old → new, by whom, reason).
- **T2 System & integration health**: `GET /system/health` (comms sent/failed by status+channel, automation success/failed, integration driver modes MOCK/LIVE, recent errors) + **System Health** dashboard page.
- **T3 Search performance**: `GET /system/performance` live probe. Added composite/secondary indexes (leads owner+status, source, created_at; audit/automation/comms log indexes) and a `crm:seed-leads {n}` load-test command. **Verified: 100,046 leads → lead search 0.5ms query / 85ms endpoint — well under the 2s acceptance target.**
- All three endpoints gated by `config.manage` (403 for Sales Exec). New Configuration nav: System Health, Audit Log.

## Implemented — Channel Partner Portal, Overdue Auto-Nudge & Section R edge cases (2026-06, verified 118/119)
- **Channel Partner Portal**: partners (role `channel_partner`, user `partner@crm.local`) get a scoped **My Portal** page — only their own leads/bookings + commission summary (earned/pending). Marking a partner-attributed lead Won auto-computes commission (rate × deal value). Admin **Channel Partners** CRUD + **Commissions** page (approve → mark paid). RBAC hardened: all lead-read routes now require `leads.view` (partners correctly 403).
- **Overdue Auto-Nudge**: `crm:reminders` sends a one-time friendly WhatsApp pay-link nudge the moment a milestone slips overdue (alongside the formal demand letter).
- **Section R edge cases**: Do-Not-Contact (`/leads/{id}/dnc`), wrong-number/spam invalidation (`/leads/{id}/invalid` → not_interested + suppress outbound), consent changes (`/leads/{id}/consent`), booking cancellation (`/bookings/{id}/cancel` → release unit + cancel milestones/dues), bounced/failed payment (`/payments/{id}/fail` → reverses milestone allocation). Outbound WhatsApp already suppressed for DNC/opt-out leads. UI: lead-drawer DNC/Invalid buttons + flag banner, booking Cancel, payment Bounce/Fail.
- New: migration `2026_01_08_...partner_and_edge_cases`, `ChannelPartnerController`, LeadController DNC/invalid/consent, BookingService.cancel, PaymentService.markFailed, frontend partner/commissions/portal pages.

## Implemented — Phase D · Section S (2026-06, verified 10/10 acceptance + regression)
- **Full lifecycle automation triggers**: 7 rules covering `lead.created` (welcome WhatsApp + verify task), and `status.changed` to interested (qualify task + email), opportunity (24h handover task + email), negotiation (proposal task + WhatsApp), won (onboarding task + email), not_interested/lost (pause sequences), plus `whatsapp.replied` (reply task). Each fires create_task/send_email/send_whatsapp/pause_sequence and writes an AutomationLog.
- **SLA breach escalation → manager**: `crm:reminders` escalates verify tasks unstarted > 2h and any overdue follow-up/handover task to the **sales manager** (priya@crm.local), setting escalated=true + high priority + reassignment. SLA targets in config (verify 2h, handover 24h, site-visit report 2h).
- **Acceptance suite**: `/app/backend/tests/test_section_s.py` (10 tests) proving each event fires the right task/message and SLA breaches escalate correctly.
- Added `?lead_id=` filter to `/automation-logs` for per-lead audit.

## Implemented — Automation Builder UI + Section R residual edge cases (2026-06, verified 141/141)
- **Automation Builder UI**: managers create/edit/delete automation rules from the Automations page via a structured, no-JSON form — pick a trigger event, a "when status becomes" condition, and add/remove typed action rows (create task with due-hours+priority, send WhatsApp/email, enroll/pause sequence). Full CRUD via `/automation-rules` (config.manage gated); newly built rules fire live on the chosen event. `/automation-logs` now supports `?lead_id=`.
- **Section R residual edge cases**:
  - Multiple decision-makers (`stakeholders` JSON) — add/remove, primary flag, shown in the lead Qualify tab.
  - Multiple units of interest (`interested_units` JSON, deduplicated).
  - Competing/other-project switch (`/leads/{id}/switch-project`, audited).
  - **Concurrency-safe de-duplication** — normalized `dedupe_key` unique index + race-catch: 8 parallel identical creates collapse to one lead; sequential dups still 409; explicit force-create still allowed.
- **Test hardening**: fixed the two long-standing flaky tests (session-fixture + pagination) — full suite now deterministically 141/141.
- New: migration `2026_01_09_...lead_stakeholders_and_dedupe`, LeadService dedupe+switchProject, LeadController stakeholder/units/switch endpoints, structured autoForm builder, qualify-tab interests panel.

## Backlog (prioritized)
- **P3 nice-to-haves**: SLA heat-board on manager dashboard (time-to-breach colour coding + one-click reassign); role-based home dashboards; partner self-registration + referral links; commission monthly statements.
- **Tech hardening**: move serial-number generation (receipts/letters/AFS/demand) to an atomic counter for heavy multi-user concurrency.
- **Chatbot**: port from https://github.com/deb782/CRM_New-clone when prioritized.
- **Integrations (live, when keys provided)**: Razorpay keys+webhook secret, WATI base URL+token, Gmail Workspace SMTP.

## Next tasks
1. Phase B site-visit scheduling + inventory board.
2. Razorpay integration playbook + token/EOI links (Phase C kickoff).
3. Wire real WATI/SMTP drivers when keys provided.
