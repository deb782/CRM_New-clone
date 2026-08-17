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

## Implemented — SLA Heat-Board + Role Home Screens + Partner Referral Links (2026-06, verified 21/21 backend + 5/5 frontend, iteration_11)
- **SLA Heat-Board**: `GET /tasks/sla-board` (gated `leads.view`) returns all open tasks colour-bucketed by time-to-breach — breached (<0 min), red (<60), amber (<240), green (else) — sorted by minutes_to_breach, with counts + active-user list. Fallback deadline: verify tasks = created_at + `sla.verify_hours` (2h), else +24h. One-click reassign via `PUT /tasks/{task}` {assigned_to}. Manager SLA Board sidebar page (testids sla-cards, sla-count-*, sla-tbody, sla-row-{id}, sla-reassign-{id}). Partners 403 (still 403 on /leads + /leads/board).
- **Role Home Screens**: one-shot post-login landing (sessionStorage `crm_homed` sentinel, user can navigate back to Dashboard after): post-sales/CS -> #/collections, sales exec -> #/callList, channel partner -> #/portal, sales_manager/admin -> Dashboard/funnel.
- **Partner Referral Links**: public `/refer/{code}` blade page + `POST /api/v1/public/refer/{code}` (throttle 60/min, name+phone required) auto-captures lead with source='Partner Referral' and channel_partner_id = that partner (commission attribution). Invalid/inactive code -> 404. Partner portal shows referral_url + copy button (referral-link / referral-copy testids). New: migration `2026_01_10_...partner_referral_code`, ChannelPartner.referral_code, TaskController.slaBoard.

## Implemented — Website Chat Widget (2026-06, verified 100% backend + frontend, iteration_12)
- **Embeddable chat widget** (`public/widget/chat.js`): self-contained floating chat bubble + scripted guided flow (name → phone/email → looking-for → budget → location) with quick-reply chips. Namespaced CSS (no clashes), derives API origin from its own script src, contact validation, retry-on-failure. Install anywhere with `<script src="{CRM}/widget/chat.js" async></script>`.
- **Lead capture**: completed conversation POSTs to existing `POST /api/v1/chatbot` → new lead with source **Chatbot** and composed intent_notes (Looking for / Budget / Location). Partner variant `data-ref="CODE"` posts to `POST /api/v1/public/refer/{code}` → lead with source **Partner Referral** + auto commission attribution.
- **Live demo page**: `GET /chat-demo` (public Blade) with widget installed + install instructions.
- **In-CRM embed/config page**: new **Chat Widget** nav under Configuration (config.manage gated — sales exec can't see it) showing copy-paste embed snippet, partner-attributed snippet, live-demo link, and a live preview bubble.

## Implemented — Partner Widget Branding (2026-06, verified 100% backend + frontend, iteration_13)
- **Per-partner chat-widget branding**: each channel partner can set the widget **title, accent colour and greeting** from a "Chat widget branding" card in their portal (`PUT /api/v1/partner/branding`, partner.portal scoped; validates hex accent, title≤60, greeting≤300). Portal also shows their ready-to-paste `data-ref` embed snippet with copy.
- **Public config**: `GET /api/v1/public/widget-config/{code}` returns the partner's title/accent/greeting (defaults for missing/inactive code — no 404, so codes can't be enumerated). The embeddable widget (`/widget/chat.js`) fetches this when loaded with `data-ref`; explicit `data-title`/`data-accent` attributes still override.
- New: migration `2026_01_11_...partner_widget_branding` (widget_title/accent/greeting on channel_partners), ChannelPartnerController.widgetConfig + updateBranding.

## Implemented — Native WhatsApp Business module (replaces WATI) (2026-06, verified backend 10/10 + frontend 100%, iteration_14)
Built mock-first (WHATSAPP_DRIVER=mock), real-time via ~4s polling. Ported & improved from the user's "WatiClone" (Node) into Laravel-native.
- **Team Inbox** (`/whatsapp/conversations*`, gated `leads.view`): conversation list (All/Mine/Unread filters, unread badges, search) + live thread with WhatsApp-style bubbles, agent reply, assign-to-agent, mark-read, open/close. **24-hour customer-service window** enforced (free-form text 422 outside window; templates allowed). A **Simulate inbound** test tool injects fake customer messages so the inbox is fully testable without live Meta. New: `WhatsappConversation`, `InboxService`, `WhatsAppInboxController`.
- **Broadcasts** (`/whatsapp/broadcasts*`, gated `config.manage`): bulk campaigns to lead segments (all/status/temperature/source; opt-out & DNC excluded) with recipients + sent/failed counts; duplicate-send guarded. New: `WhatsappBroadcast`, `WhatsAppBroadcastController`.
- **Auto-Replies** (`/whatsapp/auto-replies*`, gated `config.manage`): keyword rules (contains/exact/starts) → auto text/template reply on inbound (first match, respects opt-out & window, hit counter). New: `WhatsappAutoReply`, `WhatsAppAutoReplyController`.
- **Meta Cloud API driver upgrade**: `CloudApiDriver` now config-driven (base_url/version) with text + named-template send + mark-read; `Contract` gained `markRead()`. Webhook: GET verify handshake (`hub.*`), POST Meta payload (entry/changes) → inbound auto-creates lead (source 'WhatsApp') + conversation, delivery/read status updates, STOP opt-out; HMAC `X-Hub-Signature-256` verified when `META_APP_SECRET` set (live).
- **Go live to replace WATI**: set `WHATSAPP_DRIVER=cloud` + `.env` `CLOUD_API_TOKEN`, `CLOUD_API_PHONE_ID`, `META_WABA_ID`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`; point Meta webhook to `/api/v1/webhooks/whatsapp` (verify token `crm_wa_verify` by default).
- New migration `2026_01_12_...whatsapp_inbox`; frontend `public/assets/js/whatsapp.js` (inbox/broadcasts/waAutomations), nav+titles in app.js, script include bumped to v=10.

## Implemented — WhatsApp Media & Buttons + Template Sync + Inbox Analytics (2026-06, verified 17/17 backend + 100% frontend, iteration_15)
- **Media & Buttons**: inbox composer can attach images/documents (`POST /whatsapp/media/upload` → public disk, MIME-validated) and send **interactive quick-reply buttons** (max 3). Thread renders images/doc links/button chips. 24h window still enforced for media/interactive (only templates bypass). Added `meta` json + media_url to messages; `Contract::sendMedia/sendInteractive` (Mock/Cloud/Wati).
- **Template Sync**: `POST /whatsapp/templates/sync` (config.manage) pulls approved templates via `Contract::fetchTemplates()` — Mock returns 5 samples, CloudApiDriver hits Meta `/{waba}/message_templates` at go-live. Upsert by name+language (idempotent). Inbox Template modal + WA Templates page (`waTemplates`) use the synced dropdown. New: `whatsapp_templates` table, `WhatsappTemplate`, `WhatsAppTemplateController`.
- **Inbox Analytics** (`GET /whatsapp/analytics`, leads.view): open conversations, unread backlog, unassigned, avg first-response minutes (inbound→next outbound), messages-per-agent, 7-day trend. New page `waAnalytics`.
- New migration `2026_01_13_...whatsapp_media_templates`; frontend blade bumped to v=11; nav items WA Templates + WA Analytics under Configuration.

## Implemented — WhatsApp Canned Replies + Template Variables + Assignment Routing (2026-06, verified 16/16 backend + 100% frontend, iteration_16)
- **Canned Replies**: saved snippets (title/shortcut/body) agents insert with one click via a composer button; managed on the WA Canned Replies page. `whatsapp/canned-replies` CRUD (leads.view). New: `whatsapp_canned_replies` table, `WhatsappCannedReply`, `WhatsAppCannedReplyController`.
- **Template Variables**: inbox Template dialog detects `{{1}}{{2}}` placeholders, shows a field per variable with live preview; sends `variables[]` — `InboxService` fills the body positionally and `CloudApiDriver::sendTemplate()` builds Meta body-component parameters at go-live. Works outside the 24h window (templates exempt).
- **Assignment Routing**: new WhatsApp conversations auto-assign to the least-busy active sales_exec/sales_manager (`InboxService::pickAgent()`), toggleable via `whatsapp/settings` (GET leads.view, PUT config.manage) with a switch on WA Analytics. New: `whatsapp_settings` (auto_assign, default on), `WhatsappSetting`.
- New migration `2026_01_14_...whatsapp_canned_and_settings`; `Contract::sendTemplate()` added to all drivers; nav item WA Canned Replies; blade v=12.

## Environment recovery note (2026-06)
The preview container reset to the default (Node/Python/Mongo) image mid-session, wiping system packages (PHP, MariaDB) — only `/app` persists (code + Laravel `vendor/`). Recovered by reinstalling PHP 8.2 + MariaDB and re-seeding. Durability added:
- `/app/laravel-crm/setup.sh` — one-command recovery (installs PHP+MariaDB, starts DB, migrates/seeds, storage:link).
- Supervisor programs `mariadb` (`/usr/sbin/mariadbd`) + `laravel` (`php artisan serve --host=0.0.0.0 --port=8000`) at `/etc/supervisor/conf.d/laravel.conf`.
- If the app is ever down after a reset: run `bash /app/laravel-crm/setup.sh` then `sudo supervisorctl reread && sudo supervisorctl update`.

## Implemented — WhatsApp Notes & Tags (2026-06, verified 21/21 backend + 100% frontend, iteration_17)
- **Private notes**: internal-only notes per conversation (`whatsapp/conversations/{id}/notes` GET/POST/DELETE, leads.view) with author; delete allowed for the author or config.manage. Inbox shows a Notes modal (list + add + delete).
- **Tags**: freeform conversation labels (`PUT whatsapp/conversations/{id}/tags`, trim+de-dupe); tags bar in the thread + chips on the conversation list. Included in `present()`.
- New migration `2026_01_15_...whatsapp_notes_tags` (conversations.tags json; whatsapp_notes); `WhatsappNote` model; blade v=13.

## Implemented — Email Broadcast module (Mailchimp-style) (2026-06, verified 27/28 backend + 100% frontend, iteration_18 + self-test)
- **Templates**: visual designer (`#/emailTemplates`) with formatting toolbar (headings/bold/links/images/buttons), merge-tag dropdown, right-side live preview, raw-HTML paste + `.html` import, 5 starter templates (Welcome, New Launch, Site Visit Reminder, Festive Offer, Blank). CRUD via `email/templates` (config.manage).
- **Campaigns**: `email/campaigns` CRUD + `POST email/campaigns/{id}/send`; audience segmentation by all/status/temperature/source; mock-first send via separate `BroadcastMailer` (EmailService untouched).
- **Merge tags**: `personalize()` now resolves BOTH `{name}` and `{{name}}` forms (name/email/phone/project); `{project}` pulls the lead's real project name (`lead->project->name`), falling back to "our projects".
- **Tracking**: 1x1 open pixel + click-rewrite links (public, Sanctum-bypassed); click no longer counted when the `u` param is missing/invalid. Rendered `body_html` now persisted on `email_messages` for audit (migration `2026_01_17_...email_message_body`).
- Nav entries `Email Templates` / `Email Campaigns` under Configuration group. Remaining 1 test "failure" is a cosmetic curl redirect-url normalization (actual Location header is exact). Live Gmail Workspace SMTP pending user credentials.

## Implemented — Email Unsubscribe/Consent + Campaign Analytics (2026-06, agent-tested)
- **One-click unsubscribe**: every broadcast now appends a compliant footer with a tokenized `email/unsubscribe/{token}` link (public, no auth). Hitting it sets the lead's new `email_opt_out`/`email_opt_out_at` (migration `2026_01_18_...lead_email_optout`) and shows a confirmation page. `audience()` now excludes `do_not_contact` AND `email_opt_out` (verified: audience 4→3 after unsubscribe).
- **Campaign analytics**: `GET email/campaigns/{id}/analytics` (config.manage) returns campaign stats (recipients/sent/failed/opens/clicks + open_rate/click_rate) and a recipient-level breakdown (to_email/status/opened_at/clicked_at, up to 500). Frontend "Details" button on sent campaigns opens an analytics modal with stat cards + recipient table. email.js/app.js bumped to v=15.

## Implemented — Email Scheduled Sends (2026-06, agent-tested)
- **Schedule a campaign**: create modal has an optional "Schedule for later" datetime; draft campaigns show a "Schedule" button (and scheduled ones a "Cancel"). Endpoints `POST email/campaigns/{id}/schedule` (validates `after:now`) + `/unschedule` (config.manage). Status column now shows draft/scheduled(time)/sent chips.
- **Auto-dispatch**: new console command `crm:email-scheduled` (registered `everyMinute` in routes/console.php) sends campaigns with `status=scheduled` and `scheduled_at <= now`, then marks them sent and clears the schedule. Verified: future schedule not sent; past schedule dispatched 3, status→sent.
- **Refactor**: extracted the send pipeline (audience + personalize + tracking + unsubscribe + message records) into `App\Services\CampaignDispatcher`, reused by the controller `send()` and the scheduled command (DRY). Migration `2026_01_19_...email_campaign_schedule` (email_campaigns.scheduled_at). email.js/app.js bumped to v=16. RBAC verified (non-config user → 403).

## Implemented — Recurring Email Campaigns (2026-06, agent-tested)
- **Repeat weekly/monthly**: campaigns have a `recurrence` field (none/weekly/monthly). Set it in the create modal ("Repeat" dropdown, requires a start date) or the Schedule modal. Endpoints `store`/`update`/`schedule` accept `recurrence`; `unschedule` resets it.
- **Auto-reschedule**: `CampaignDispatcher::dispatch()` now increments (accumulates) sent/failed counts; for recurring campaigns it sets the next `scheduled_at` (loops +1 week/+1 month until future) and keeps status `scheduled` instead of `sent`. One-offs still finalize as `sent`.
- The `crm:email-scheduled` command drives both one-off and recurring sends. Status column shows a repeat badge for recurring campaigns. Migration `2026_01_20_...email_campaign_recurrence`; JS bumped to v=17.
- Verified: weekly campaign dispatched (3 sent) → status stays scheduled, next_sched +7 days; immediate re-run does nothing (future); second cycle accumulates sent_count 3→6.

## Implemented — Per-Send History for recurring campaigns (2026-06, agent-tested)
- **Send history**: each dispatch now creates an `email_campaign_runs` record (run_number, recipients, sent/failed, sent_at) and every `EmailMessage` is tagged with `run_id`. Analytics endpoint returns a `runs` array with per-run opens/clicks + rates (computed from message opened_at/clicked_at grouped by run).
- **UI**: analytics modal shows a "Send history (N)" table above the recipients list. Recurring campaigns (which stay `scheduled`) now also get a "Details" button once `sent_count > 0`, so their run history is viewable.
- Migration `2026_01_21_...email_campaign_runs`; `EmailCampaignRun` model; JS bumped to v=19. Verified: weekly campaign run #1 = 2 opens/66.7%, run #2 = 0 opens — independent per-run tracking confirmed via API + UI.

## Implemented — Phase 1: 12-Role Department Hierarchy + RBAC (2026-06, agent-tested)
- **Roles** (migration `2026_01_22_...role_department_tier` adds roles.department + roles.tier): Super Admin, Process Admin (admin dept); Sales Head/BDM/BDE (sales); Accounts Head/Support (accounts); Legal Head/Support (legal); CRM Head/Support (crm); Channel Partner (external, retained for partner module). Legacy roles (sales_manager/sales_exec/marketing/crm_ops/post_sales) retired in seeder.
- **Permissions**: added accounts.view/manage, legal.view/manage, crm.view/manage, workflow.manage (for Phase 3 builder). Heads = full dept access; Support = view/create only (NO edit/delete/override). `admin` slug keeps the full bypass.
- **Wiring**: AuthController payload now returns department + tier. Backend role-slug refs updated (LeadService auto-assign → sales_bde/bdm; InboxService → sales_*; BookingService post-sales → crm_head; DemandLetter/RunReminders → sales_head). Frontend role-home routing updated to new slugs. app.js v=20.
- **Verified**: all 13 users log in with correct perms; accounts_support edit→403, sales_head edit→200, partner /leads→403 & /partner/portal→200 (isolation intact); Process Admin UI smoke-tested. Credentials in test_credentials.md.

## Implemented — Phase 2: Admin Onboarding Wizard + User Provisioning + Preview Roles (2026-06, tested 100% iteration_19)
- **Onboarding wizard** (`#/onboarding`, `onboarding.js`): continuous stepper — Welcome/profile → setup now/later → project type (plotted/residential) → dynamic project-info form (type-specific meta) → map department users → category-based inventory → "Preparing your dashboard" launch animation. "Later" path routes to the dashboard which shows an onboarding **timeline banner** (progress %, clickable step chips, Resume). Backend: `OnboardingController` (GET/PUT /onboarding) + `onboarding_states` table (migration `2026_01_23_...phase2_onboarding` also adds projects.project_type/meta, plots.category/attributes, users.must_change_password).
- **Department-user provisioning**: `POST /users` (users.manage) creates a user with user_id=email, temp password=phone, `must_change_password=true`; returns temp_password + copyable credential_text; credential email is **MOCKED** (logged). Passwords rely solely on the User `hashed` cast (removed redundant Hash::make double-path that caused a transient flake).
- **Forced first-login password change**: `ForcePasswordChange` middleware wraps all authenticated routes (except me/logout/change-password/impersonate) → returns 409 `password_change_required` until `POST /auth/change-password`. Frontend shows a dedicated change-password screen (`CRM.changePasswordScreen`).
- **Preview Roles (super admin)**: `#/preview` lists users by department; `POST /auth/impersonate` (admin-only, audit-logged) issues a token for the target and the UI shows an impersonation banner with Exit preview. Non-admin → 403; nav item hidden for non-admin.
- app.js/onboarding.js/email.js at v=21. Verified: full wizard happy path, later-path timeline, provisioning + forced change gate, impersonation, and all Phase 1 RBAC regressions.

## Implemented — Onboarding Reset + Phase 3: Mission-Control Workflow Builder (2026-06, agent-tested)
- **Onboarding Reset**: `POST /onboarding/reset` (config.manage). Dashboard banner now shows a "Restart setup" button for admins (both in the incomplete timeline and a compact "Setup complete" bar when done) → resets checklist (data intact) and re-runs the wizard.
- **Workflow Builder (USP)** at `#/workflows` (`workflow.js` + `workflow.css`, Drawflow vendored at `public/assets/vendor/`): full-screen mission-control builder — dark topbar, node palette grouped Triggers/Flow/Communications/Logic, blueprint-grid canvas, floating zoom/reset/clear toolbar, right config panel + live "Mission Checklist" tally. Node types: trigger, status_change, task, send_whatsapp, send_email, wait, condition (dual output), fallback — each drag-drop, connectable, with per-type config forms + help tooltips. Save/Validate/Activate.
- Backend: `workflows` table + `Workflow` model + `WorkflowController` (index/show/store/update/activate/destroy) gated by new `workflow.manage` permission (admin + process_admin). `tally()` counts template/task nodes for the onboarding checklist.
- Verified: tally counts correct (2 WA/1 email), activate flips status, RBAC 403 for sales_head; UI drag-drop creates correctly-colored nodes, config panel edits + live tally, and **save→reload round-trips 4 nodes**. Blueprint: `/app/design_guidelines.json`. JS at v=22, workflow.js v=1.
- Note: Live Lead Tracker (train-tracker read-only view) is Phase 5, not yet built. Execution engine (running the activated flow) is Phase 4.

## Implemented — Phase 4: Workflow Execution Engine + Checklist + Starter Library (2026-06, tested 100% iteration_21)
- **Execution engine** (`FlowEngine` service, `workflow_runs` table, `WorkflowRun` model): walks an active flow's graph node-by-node — trigger, status_change (maps label→pipeline slug), task (creates Task), send_whatsapp/send_email (MOCKED/logged), condition (branches output_1=yes/output_2=no on temperature/source/status/score), wait (pauses run.status=waiting + resume_at), fallback. MAX_STEPS=60 loop guard now marks status=failed with a reason log.
- **Triggers**: `new_lead` fires from LeadService after lead creation; `status_enter` fires on status change — both wrapped in try/catch so they never break lead flows. Wait steps resume via new `crm:flow-run` command (scheduled everyMinute).
- **Endpoints** (all under workflow.manage): `POST /workflows/{id}/simulate` (test run against a lead, returns step log), `GET /workflows/{id}/runs`, `GET /workflows/{id}/checklist` (distinct template names per send node + exists flag vs WhatsappTemplate/EmailTemplate).
- **Builder UI additions** (workflow.js v=2): "Test run" → slide-in execution log panel with per-step icons + status badge; "Starter flows" → picker with 3 pre-wired flows (5-Stage Lead Journey, NRTY Re-engagement, Booking & Payment) built via addNode/addConnection so they render correctly; right-panel "Templates to create" checklist with Create deep-links to #/waTemplates / #/emailDesign.
- Verified: condition branching (Hot→email, else→task), wait/resume cycle, real new_lead trigger creates non-sim run + Task, checklist exists-detection, RBAC 403 for non-workflow.manage, starter build (8 nodes/7 connections), test-run panel. Comms are MOCKED pending WhatsApp/SMTP go-live.
- Remaining phases: Phase 5 (live train-tracker lead view). Backlog observability nits noted in iteration_21 (queue trigger at scale, log truncation).

## Implemented — Phase 5: Live Lead Train-Tracker (2026-06, tested 100% iteration_22)
- **Read-only journey view** inside the lead detail drawer as a new "Journey" tab. Shows each lead's real-time position on its activated workflow, grounded in actual `WorkflowRun` execution records (not a static diagram).
- **Endpoint**: `GET /api/v1/leads/{id}/journey` (middleware `permission:leads.view`) → `WorkflowController@leadJourney`. Returns the driving workflow graph, lead summary, latest **non-simulated** run (`status`, `current_node`, `done[]`, `log[]`, `resume_at`, `completed_at`) + `progress{done,total}`. If the lead has no run, returns the active workflow map with `run=null` so the UI shows a "not started — route ahead" preview.
- **UI** (`public/assets/js/leads.js` v=13, `public/assets/css/tracker.css`): mission-control header (workflow name + status pill + progress bar), horizontal metro-style track of station cards ordered left-to-right by longest-path-from-trigger, activity trail. Station states: done (green) / current / waiting (violet, pulsing, shows resume time) / failed (red) / pending / skipped. Green rail = traveled path, dashed grey = ahead. Auto-scrolls to the lead's current station. Polls every 4s and stops on completed/failed run or tab switch/drawer close.
- **RBAC/isolation verified**: BDE/Sales Head/Admin → 200; Channel Partner → 403 (lacks `leads.view`). No mutation of workflow/run data.
- Bug fixed during testing: integer node-id vs string `current_node` type-mismatch stopped the current/waiting station highlighting — normalized to String() both sides.

## A–T RE-CERTIFICATION after UI overhaul (2026-06, iteration_27 — 100% GREEN)
Full backend acceptance suite re-run fresh after the UI/UX overhaul. **203/203 executed pass** (1 mocked-integration skip), 0 code regressions:
- Sections: L 14/14, M 7/7, N 12/12, O·P·Q 15/15, R 19/19, R2/S automation 12+10, T 8/8, Phase B site-visits 18/18, Phase 2 onboarding RBAC 10/10, Phase 3 workflow RBAC 17/17, Phase 4 flow engine 19/19, batch3 SLA/role/referral 21/21, widget branding 13/13(+1 skip), Phase 5 journey 8/8.
- Overhaul endpoints re-confirmed: PUT /auth/profile (200), GET /permissions (200), POST /roles/1/reset-permissions (422 admin-locked), GET /leads/{id}/journey (partner 403).
- Test-only fixes made (no app code changed): stale fixtures referencing removed legacy accounts/role slugs updated to the 12-role hierarchy; `test_phase5_lead_journey.py` now resolves a waiting-run lead dynamically instead of hard-coding lead #20.
- Caveats: all integrations remain MOCKED (not live-delivery verified); MySQL data not durable across container resets; login throttle (60/min) requires per-module runs.


- **Pipeline Polish** (`leads.js` v=14): Kanban restyled to the new language (rounded surface-2 columns, uppercase headers with count pills, temp-dot cards) + **HTML5 drag-and-drop** to move a lead between stages (`POST /leads/{id}/transition {stage}`); respects pipeline transition rules (shows a toast + reloads on block). Plain click still opens the lead drawer.
- **Deals Editorial** (`deals.js` v=11): Collections (money hero Collected/Scheduled/Outstanding + 5-bucket ageing strip), Bookings (hero: total deal value / confirmed / token collected), Demand Letters (hero: total due / escalated / settled) — all with big editorial numbers + calm tables.
- **Messaging split-view** (`whatsapp.js` v=15): WhatsApp Inbox reimagined as a 3-pane workspace — conversation list | live thread | **contextual lead panel** (avatar, score, temp, stage, tags, "Open full lead"). Fixed stale CSS vars via legacy aliases (`--line/--bg-2/--accent-weak/--text-1`) so the inbox renders correctly.
- **Access Presets** (`people.js` v=3 + backend): "Reset to default" restores a role to its KRA defaults (`config/role_defaults.php`, `POST /roles/{id}/reset-permissions`); a lime **"Customised"** badge flags roles that deviate from default; reset button only shows when the role is customised. Super Admin stays locked.
- **Toast UX** (`api.js` v=11): a new toast replaces the previous one (no stacking).
- Verified 5/5 frontend scenarios, 0 console errors, seed data restored (lead moved+reverted; legal_head reset to defaults). `app.css` v=9.

## Implemented — People module: Roles & Access + Users Directory (2026-06, tested iteration_24 100%)
- **Granular Roles & Access control** (admin USP) — new page `CRM.pages.access` (`people.js`, route `#/access`, gated `users.manage`, admin-only in nav). Admin picks any role (grouped by department) and toggles individual features on/off, grouped function-wise (Leads & Pipeline, Accounts & Finance, Legal, Configuration, etc.) with a per-group "All" switch and a feature search. Grants/restricts access beyond a role's default KRA. **Super Admin role is locked** (always full access, no save). Changes apply on the target user's next login.
  - Backend: `UserController@permissions` (grouped list), `@updateRolePermissions` (syncs role↔permission pivot, blocks `admin` slug with 422), `roles()` now eager-loads permissions. Routes: `GET /permissions`, `PUT /roles/{role}/permissions` (both `users.manage`). Fixed a latent double-hash bug in `UserController@update` (now passes plain password to the model's `hashed` cast).
- **Users Directory redesign** — `CRM.pages.users` rebuilt as an org directory: KPI row (members/active/roles/departments), search, department-grouped person cards (avatar, role pill, inline **Active toggle switch**), add/edit user modal. "Roles & Access" shortcut in the topbar.
- **Elegant toggle switches** — reusable `CRM.switchField()` (`.sw` component) now used in place of yes/no dropdowns for user active-state and all permission toggles; animated sliding knob.
- **Toast UX fix** — new toasts now replace the previous one (no stacked/overlapping messages); `api.js` v=11.
- Verified: 8/8 frontend scenarios, 0 console errors, seed data restored after tests; backend curl-verified (18 permissions, sync, admin-lock 422).
- Files: `people.js` v=1, `app.js` v=25 (nav+title), `app.css` v=8 (.people-grid/.person-card/.access-*). CSS design tokens unchanged.

## Implemented — Design System v1.1 (Profiles, Menu, Command Palette, Inventory map, 2026-06, tested iteration_23 100%)
- **Account Settings / Profile** (`profile.js` v=1, `CRM.pages.profile`): editorial profile header (colour-tinted avatar), sub-nav Profile / Notifications / Security. Profile edits name/phone/avatar colour; Notifications toggles (new-lead, task, WhatsApp, weekly digest) via animated switches; Security = inline change-password (reuses existing endpoint, validates length/mismatch client-side). Persists via new **`PUT /api/v1/auth/profile`** (AuthController@updateProfile) + migration `2026_01_26_000000_user_profile_prefs` (users.avatar_color, users.preferences json). Sidebar user chip is now a link to #/profile (pinned sticky footer).
- **Consolidated sidebar menu** (`app.js` v=24): 7 logical groups — Overview / Sales / Deals & Finance / Messaging / Automation & Setup / Partners / Administration — replacing the old flat 2-group list; per-item + per-group permission gating preserved.
- **Command Palette** (⌘K / Ctrl+K, `CRM.openCommandPalette`): topbar trigger + global shortcut; live lead search (`/leads?search=`) + page navigation, keyboard arrows/Enter/Escape, lime active row.
- **Spatial Inventory availability map** (`inventory.js` v=11): per-project hero (big "available / total" number + % absorbed bar + legend) and per-phase unit-cell maps; cells colour-coded Available (outline) / Held (amber) / Booked (lime) / Sold (solid black); click opens the existing plot edit modal. Visits + scheduling logic untouched.
- CSS additions in `app.css` v=7: `.cmdk-*`, `.settings-*`, `.sw` switch, `.pf-*`, `.inv-*` map, sticky nav footer.
- Verified 8/8 frontend scenarios, 0 console errors, no regressions (Journey tab, WhatsApp, Leads all intact).

## Implemented — Design System v1 (Editorial Premium UI overhaul, 2026-06)
- **Global design-system re-forge** in `public/assets/css/app.css` (v=5) driven entirely by CSS tokens, so every screen inherits new DNA: warm off-white bg (#F5F5F2), white flat cards (radius 18px, no shadow), near-black text (#111), muted grey secondary, subtle borders (#E7E7E1), single electric-lime accent (#DFFF00) used sparingly (nav active indicator, KPI delta, one highlighted chart bar). Typeface = **Manrope** (Google Fonts CDN in app.blade.php). Buttons = black pill; inputs = soft-fill rounded; tables = lightweight uppercase headers + generous 18px rows; sidebar = quiet with **white rounded active pill + lime tick**; skeleton shimmer utility.
- **Executive Dashboard reimagined** (`dashboard.js` v=11) to the reference composition: left powder-blue hero panel (greeting, animated SVG progress ring, Hot/Warm/Cold breakdown, oversized "Total Leads" number), right KPI row of large editorial figures with tiny delta pills, understated Pipeline Funnel bar chart with ONE lime-highlighted column, Leads-by-Source mini bars + Recent Leads table. Skeleton loader on fetch.
- **Onboarding is now full-screen / chromeless** (`app.js` v=23): sidebar+topbar hidden during the setup wizard (route in CHROMELESS list); sidebar returns automatically after finishing OR skipping to the dashboard. This was an explicit user request.
- Design blueprint: `/app/design_guidelines.json` (mission = editorial minimalism + technical instrumentation + premium enterprise; DO-NOT: heavy shadows/glassmorphism/rainbow/Bootstrap look). Verified via screenshots on Dashboard, Leads, Onboarding. Functionality preserved (token/CSS + one routing branch only); full testing_agent regression pending.
- **Remaining redesign backlog (per user's MASTER DESIGN DIRECTIVE)**: User Profiles/Account Settings + Admin User Directory ("all bells & whistles"); menu consolidation/clubbing (the long Configuration list); per-module signature moments — Inventory spatial availability map, Workflow keep dark instrument theme, unified WhatsApp+Email split-pane inbox, Leads/Pipeline drawer polish, Collections/Bookings editorial; command palette; global skeleton/empty/error states.

## Backlog (prioritized)
- **P3 nice-to-haves**: commission monthly statements; SLA board synthetic-deadline flag in UI; partner self-registration; honeypot/captcha on public referral for real-domain anti-spam.
- **Tech hardening**: move serial-number generation (receipts/letters/AFS/demand) to an atomic counter for heavy multi-user concurrency.
- **Chatbot**: port from https://github.com/deb782/CRM_New-clone when prioritized.
- **Integrations (live, when keys provided)**: Razorpay keys+webhook secret, WATI base URL+token, Gmail Workspace SMTP.

## Next tasks
1. Phase B site-visit scheduling + inventory board.
2. Razorpay integration playbook + token/EOI links (Phase C kickoff).
3. Wire real WATI/SMTP drivers when keys provided.


## 2026-06 — Rebrand + Documentation (Agrocorp CRM)
- **Rebrand**: App renamed "Real Estate CRM" → **Agrocorp CRM**. Logo (arch mark) applied to sidebar, login, onboarding, browser tab/favicon. Assets: `public/assets/img/agrocorp-logo.webp`, `agrocorp-mark.png`. Brand olive `#4F5823`. Cache versions bumped (app.js v27, onboarding.js v23, app.css v11).
- **Integrations Hub**: Passed testing (iteration_28, 100% BE 12/12 + FE). Applied polish: card status pill refreshes after in-modal Test connection (`integrations.js` v2). Shipped/test-agent-tested, live use pending user credentials.
- **Documentation (in `/app/laravel-crm/docs/`)**:
  - Stakeholder Overview + 6 department manuals (Admin, Sales, Accounts, Legal, CRM, Channel Partner) as branded HTML.
  - Screenshots captured per role via Playwright (`docs/screenshots/`, `docs/capture.py`).
  - Generated branded PDFs in `docs/pdf/`: `overview.pdf`, `manual_admin.pdf`, `manual_sales.pdf`, `manual_accounts.pdf`, `manual_legal.pdf`, `manual_crm.pdf`, `manual_partner.pdf`.
  - Plain-English task playbooks (rock-bottom step detail), noting Head vs Support differences. Also earlier markdown drafts `USER_MANUAL.md` + `CRM_STAKEHOLDER_OVERVIEW.md`.

## 2026-06 — Wave 1 upgrades (Reports, Notifications, Object Storage, PDF Receipt)
Tested: iteration_29.json — 100% backend (15/15) + 100% frontend, no functional defects.
- **Reports & Analytics** (`ReportController`, `reports.js`, nav 'Insights'): Sales / Financial / Activity&SLA tabs; KPIs + bar breakdowns + tables; Export Excel (CSV) + Print/PDF. New permissions `reports.sales`/`reports.financial`/`reports.activity` (in seeder + `config/role_defaults.php`). Per-department RBAC verified: Sales Head→sales+activity, Accounts Head→financial+activity, Legal/CRM Head→activity only, BDE→403 all, Admin→all.
- **In-app Notifications** (`Notification` model, migration `2026_06_01_000000_notifications`, `NotificationService`, `NotificationController`, `notifications.js` bell + panel + 30s poll): user-scoped, ownership-checked mark-read/mark-all. Triggers wired: payment recorded (→ owner + accounts heads), discount decided (→ requester). Booking/whatsapp/hot-lead/SLA triggers can be extended later.
- **Object Storage** (`app/Services/ObjectStorage.php`): PHP client for Emergent storage proxy (`INTEGRATION_PROXY_URL` + `EMERGENT_LLM_KEY` now in .env). Durable put/get, key cached 6h, auto re-init on 404. Round-trip verified.
- **Manual payment + branded PDF receipt** (`ReceiptService`, `PaymentController@receipt`, route `GET /payments/{payment}/receipt`): headless-Chrome rendered, Agrocorp-branded, INR + amount-in-words; stored durably in object storage (meta.receipt_pdf). Manual entry/serial receipt (`RCPT-YYYY-#####`) already existed in `PaymentService::record`.
- Cache versions: app.js v28, app.css v12, +notifications.js/reports.js v1. APP_NAME now "Agrocorp CRM".

## Wave 1 remaining / backlog
- Live integrations (Meta WhatsApp, Google SMTP, Mcube) — user will provide credentials; guide only.
- Wave 3: E-sign + SMS providers (user to choose vendor). Wave 4: mobile/PWA, bulk ops, atomic serial hardening.
- Optional: standardize payment-create response envelope; skip admin #/onboarding auto-redirect when already completed.
- Extend notification triggers to booking confirmed / new WhatsApp inbound / SLA breach + visit reminders (scheduler command).


## 2026-06 — Native Meta Lead Ads connector
Self-tested via curl (Hub listing, verify handshake +/-, signature enforcement, mock+real paths, dedupe, name mapping).
- New Integrations Hub provider `meta_lead_ads` (config/integration_hub.php): fields page_id, page_access_token(secret), verify_token, app_secret(secret), graph_version(v21.0). Card shows exact callback URL.
- `app/Services/MetaLeadService.php`: GET verify (hub.challenge), POST handler (X-Hub-Signature-256 enforced when app_secret set), Graph API fetchLead by leadgen_id, field_data->lead mapping (full_name/first+last, email, phone_number, city; source="Meta Lead Ads", campaign=campaign_id/ad_id, ad_set=form_id), feeds LeadService::capture (dedupe/scoring/routing).
- Routes: GET/POST /api/v1/webhooks/meta-leads (public). `WebhookController::metaLeadsVerify/metaLeads`. IntegrationController::testMetaLeads validates Page + leadgen subscription.
- Mock-first: payloads carrying field_data capture directly without Graph; real retrieval when page_access_token present. Ready for live once Admin enters Meta credentials + subscribes the Page.

## 2026-06 — Meta Lead Ads: Facebook Login for Business + Embedded Signup (config-ready)
Verified (no live Meta app): Hub fields, OAuth endpoint 422 guard + message, RBAC (BDE 403), Connect button UI, FB SDK code flow. Webhook + Graph retrieval path tested earlier (mock capture, signature enforcement, dedupe, name mapping). Live exchange untestable until user provides an App-Review-approved Meta app.
- integration_hub meta_lead_ads fields now: app_id, config_id, app_secret(secret), verify_token(required), graph_version(v21.0), page_id, page_access_token(secret, auto-filled).
- MetaLeadService::connectWithCode(code): code->short token->long-lived (fb_exchange_token)->/me/accounts->POST /{page_id}/subscribed_apps leadgen->store page_id+page_access_token+pages, status=connected, enabled=true. redirect_uri = APP_URL/oauth/facebook/callback (must be whitelisted in Meta app Valid OAuth Redirect URIs).
- IntegrationController::metaOauth (POST integrations/meta_lead_ads/oauth, integrations.manage). Frontend integrations.js v3: loadFB() SDK loader + "Connect with Facebook" FB.login({config_id,response_type:code,override_default_response_type:true}) -> POST code. Manual Page-token fallback retained.
- Go-live needs: Meta Business app, App Review for leads_retrieval+pages_manage_ads, Business Verification; enter App ID/Config ID/App Secret in Hub; whitelist APP_URL and the redirect URI; subscribe Page to leadgen.

---

## 2026-06 — Website Form Builder + Website Chatbot (ported feature) [DONE, test-agent verified]
Scope (user): port ONLY the Form Builder and Website Chatbot functionality + UI from the uploaded source project; skip source in-app chat; place nav under the Integrations area; leave everything else unchanged.

Delivered & verified (iteration_31: frontend 100%, backend 6/6 pytest iteration_30):
- DB: new migration 2026_06_10_000000_create_web_capture_tables (forms, form_fields, chatbots, chatbot_nodes, chatbot_sessions). Self-contained — dropped source dependency on campaigns/lead_sources tables.
- Forms: FormBuilderController admin CRUD + public schema()/submit(); submit maps fields via maps_to_field and captures a lead through App\Services\LeadService::capture (dedupe/routing/ack/automation). 2-step wizard UI (forms-ui.js) + embed snippet.
- Chatbot: ChatbotController admin CRUD + public runtime (config/session/action/form/message); convertToLead rewritten to use LeadService::capture + ActivityService::log; qualified options set lead temperature='hot'. Menu-driven builder UI (chatbot-ui.js) + embed snippet + in-CRM Live Test.
- Public embed: PublicFormCors middleware (alias 'form-cors'); routes at /api/v1/public/forms/* and /api/v1/public/chatbots/*. Embed scripts (form-embed.js, chatbot-embed.js) + generated snippets use /crm-api/v1 so they work through the preview proxy (config app.public_api_prefix, env PUBLIC_API_PREFIX=/crm-api/v1).
- Frontend integration: webcapture.js shim maps source globals (Api/h/toast/Modal/setTitle/setTopbarActions) onto the current CRM micro-framework and registers CRM.pages.webforms + CRM.pages.webchatbot. Scoped styling in webcapture.css (all under .wc). Nav items 'Website Forms' (nav-webforms) + 'Website Chatbot' (nav-webchatbot) added under Administration/Integrations with perm integrations.manage.
- RBAC verified: BDE (rahul@crm.local) cannot see nav items and gets 403 on /forms & /chatbots.

Bugs fixed during QA: (1) forms-ui.js projects envelope (items||data||[]); (2) webcapture.js window.toast shadowed by <div id=toast> — now unconditional assignment.

Known pre-existing (out of scope, app-wide): unauthenticated /api/* returns 500 ("Route [login] not defined") instead of 401 when no Bearer header is sent. Real clients always send Bearer; not introduced by this change.

## 2026-06 — Flow Builder: Agrocorp starter + Sample JSON [DONE, self-tested]
- Added 4th starter pack "Agrocorp Way of Working" in public/assets/js/workflow.js (STARTERS): a single connected end-to-end lead journey (24 nodes / 23 links) spanning all 5 stages (Lead Entry → Processing → Handover → Conversion → Lead-to-Customer) with WhatsApp/email/task/status_change nodes wired in sequence. Snake layout (4 rows) so it stays one big path, not segmented. Fully editable + savable like other starters.
- All 4 starters remain global (no project filtering) — available for every project.
- Added "Sample JSON" topbar button (data-testid wf-sample-json) → downloadSampleJson() builds a valid Drawflow export offscreen (buildGraphFromBuild + SAMPLE_BUILD) and downloads agrocorp-flow-sample.json so process admins have a correct-format reference for Import JSON.
- Note: the user's uploaded process flow.json is a semantic state-machine SPEC (workflow.root_stages...), not a Drawflow export — that's why Import rejected it ("drawflow.Home.data missing"). Its journey was translated into the new starter instead.
- Verified via Playwright: picker shows 4 cards, Agrocorp loads 24 nodes/23 connections, sample file downloads, no page errors. Cache: workflow.js ?v=4.

## 2026-06 — Flow Builder: spec importer + team templates + branched Agrocorp [DONE, tested]
1. Spec importer: "Import JSON" now auto-detects file type. Drawflow export → imports as before. Rich workflow spec (workflow.root_stages, e.g. process flow.json) → translateSpec() walks stages, maps stage ids to statuses (STAGE_STATUS), collects template ids (whatsapp vs email heuristic), builds a connected snake flow. Verified: process flow.json → 36-node flow.
2. Save as template (team-shared): new backend flow_templates table + FlowTemplateController (index/store/destroy) under permission:workflow.manage. Topbar "Save as template" button (wf-save-template) exports canvas → POST /flow-templates. Starter picker now fetches GET /flow-templates and shows a "Your team's saved templates" section (load + delete per card). Verified create/list/delete + empty-graph 422.
3. Branched Agrocorp: rebuilt "Agrocorp Way of Working" starter with real Condition splits on call outcome — Positive (nurture→meeting→cost sheet→booking→customer), NRTY (email win-back), Negative (polite closure + reason capture). 32 nodes / 31 conns / 2 conditions. Added 'call_outcome' to condition field options.
Files: public/assets/js/workflow.js (v6 in blade), app/Http/Controllers/Api/FlowTemplateController.php, app/Models/FlowTemplate.php, migration 2026_06_11_000000_create_flow_templates, routes/api.php.

## 2026-06 — Integrations Hub → runtime bridge (WhatsApp, SMTP, Mcube) [DONE, tested]
IntegrationsServiceProvider::boot() now reads enabled Hub records (Integration::liveConfig) and injects them into runtime config, so the Hub UI is the single source of truth (no .env edits/restarts). Guarded by Schema::hasTable + try/catch.
- meta_whatsapp → driver=cloud, cloud token/phone_id/waba_id, webhook verify_token, app_secret.
- google_email → mail.default=smtp, smtp host/port/username/password/scheme (smtps for 465), mail.from.address/name.
- mcube → telephony driver=mcube + mcube base_url/auth_token/caller_id; added McubeDriver (click-to-call) + 'mcube' case in telephony binding; added mcube block to config/integrations.php.
Verified via Hub API (update flat fields + toggle): config reflects live values, McubeDriver resolves, webhook verifies with Hub token. Test rows deleted; defaults restored (mail=log, tel=mock, wa=mock).
Note: user must redeploy updated code to Hostinger, then fill Hub → Test → Enable per integration.

## 2026-06 — Template sync + connection dashboard + Mcube call logging [DONE, test-agent 100%]
1. WhatsApp template sync: 'Sync templates from Meta' button (ig-wa-sync) in the meta_whatsapp Manage modal (when configured) → POST /whatsapp/templates/sync; auto-syncs right after enabling meta_whatsapp. (integrations.js v4)
2. Connection dashboard: 'Integrations' card on dashboard (dash-integrations) with per-integration badge Connected/Configured/Not configured (int-status-<key>), click → #/integrations. Guarded by CRM.can('integrations.manage') so non-admins skip it. (dashboard.js v13)
3. Mcube call logging: added provider_call_id+status to calls (migration 2026_06_12). TelephonyService::clickToCall creates a Call row with provider_call_id; McubeDriver returns call_id. WebhookController::telephony matches Call by provider_call_id (callid/call_id/CallSid), updates duration/recording_url/outcome/status, logs a 'call' activity with duration+recording on the lead. Signature gate relaxed for provider callbacks.
Verified: iteration_32.json — backend 7/7 pytest, frontend 100%, no bugs. Test file /app/backend/tests/test_wave3_integrations_calls.py.


## 2026-06 — WhatsApp Template Picker (leads Comms tab) [DONE, agent-tested]
- leads.js (v15): "Use template" button (wa-template-btn) in the lead Comms panel → GET /whatsapp/templates → modal list (wa-tpl-<id>), filters out rejected. Picking a template with {{n}} vars opens a "Fill template variables" modal (wa-var-N inputs + live wa-tpl-preview); Insert (wa-tpl-insert) fills the WhatsApp body + sets template name for POST /leads/{id}/whatsapp. No-variable templates insert directly. Free-form send unchanged.

## 2026-06 — Meta WhatsApp Embedded Signup [DONE, agent-tested; live requires user's verified Meta app]
- config/integration_hub.php: meta_whatsapp now exposes app_id, config_id, graph_version alongside manual access_token/phone_number_id/waba_id/verify_token/app_secret.
- Frontend (integrations.js v5): green "Connect WhatsApp" button (ig-wa-connect) in the meta_whatsapp Manage modal loads FB SDK, listens for WA_EMBEDDED_SIGNUP postMessage (captures phone_number_id + waba_id), runs FB.login with config_id + response_type=code + extras.setup, then POSTs code+ids to /integrations/meta_whatsapp/oauth. launchWaSignup() joins the FB.login code and the message-event assets before submitting.
- Backend (IntegrationController::whatsappOauth + route integrations/meta_whatsapp/oauth): exchanges code via {graph}/oauth/access_token (app_id+app_secret), POST /{phone_number_id}/register (messaging_product=whatsapp, errors ignored/logged), POST /{waba_id}/subscribed_apps, then stores access_token/phone_number_id/waba_id, sets status=connected + enabled=true.
- Verified: integrations index returns new fields; oauth endpoint returns 422 "Save your Meta App ID and App Secret first." without app creds and proper field-validation 422 on bad payload; button renders in modal (screenshot). Live end-to-end popup NOT validated — needs user's Meta App with Facebook Login for Business config, App Review advanced access (whatsapp_business_management + whatsapp_business_messaging) and Business Verification.

## 2026-06 — Authentication & Session Security hardening [DONE, testing_agent iteration_33: backend 13/13, frontend 100%]
- Sliding 60-min INACTIVITY logout: Sanctum per-token expires_at pushed forward each authenticated request via SlidingSession middleware (config sanctum.token_ttl <- AUTH_TOKEN_TTL=60). Idle > 60 min -> Sanctum auto-rejects token -> 401.
- Server-side gate on every /api/*: ForceJsonAccept middleware (prependToGroup api) + shouldRenderJsonWhen so unauthenticated/expired requests always return 401 JSON (was 500 redirect-to-login without Accept header).
- Fresh token per login (fixation-safe); login records ip_address + user_agent on the token. Bcrypt hashing unchanged.
- Forgot/reset password: public POST /auth/forgot-password (generic response, no enumeration) emails a 60-min link (MAIL_MAILER=log in preview -> storage/logs/laravel.log); POST /auth/reset-password validates token, sets password, revokes all tokens. Throttled 10/min.
- Sessions/devices: GET /auth/sessions, DELETE /auth/sessions/{id}, POST /auth/logout-all. Profile > Security tab shows Active Sessions (IP, device, last active, This-device chip) with revoke + Log out all other devices.
- Disabling a user (PUT /users/{id} is_active=false) immediately deletes their tokens; SlidingSession also 401s a disabled user.
- Audit: auth_audit_logs table (user_id, email, event, ip_address, user_agent, meta, created_at) via AuthAuditLog::record for login/logout/login_failed/logout_all/session_revoked/password_reset(_requested)/account_disabled.
- Frontend: app.js #/forgot + #/reset screens, login "Forgot password?" link, client-side 60-min idle auto-logout mirroring server. Cache bumps app.js v31, profile.js v2.
- .env: SESSION_LIFETIME=60, SESSION_SECURE_COOKIE=true, SESSION_SAME_SITE=lax, AUTH_TOKEN_TTL=60.

## 2026-06 — Journey Builder (replaces Drawflow) + Lead Status State-Machine [DONE, testing_agent iteration_34: backend 10/10, frontend 100%]
- Replaced the complex Drawflow flow-builder with a guided, zero-tech "Journey Builder" (sidebar "Journey Builder", route #/workflows). Stage-lane Kanban: 5 fixed lanes (Lead Entry, Qualification, Meeting & Site Visit, Booking & Verification, Customer Lifecycle) with SLA badges, drag-reorder step cards (SortableJS), "+ Add step" palette (Send WhatsApp, Send Email, Wait, Create Task, Change Status, If/Branch), inline drawer editor, branch chips. Files: public/assets/js/journey.js, public/assets/css/journey.css, vendor/sortable.min.js.
- Pre-seeded with the full Agrocorp lead-to-customer journey from the Operating Guidebook; user extends/edits it. Builder compiles lanes -> an engine-ready Drawflow graph AND stores a "journey" view-model inside workflow.graph; FlowEngine runs it unchanged (simulate verified end-to-end). Old workflow.js no longer loaded.
- Gap #1 STATUS CATALOG: lead_statuses table (45 statuses across S1-S5) with allow-listed transitions + pipeline_slug mapping to the existing board. Model LeadStatus, seeder LeadJourneySeeder, migration 2026_06_14. leads gained status_code + status_sla_due_at.
- Gap #2 GATES: per-status gate_fields (e.g. S2_MEETING_SCHEDULED requires budget_min + timeline) enforced on transition (422 with missing fields).
- Gap #3 SLA: per-status sla_minutes stamps leads.status_sla_due_at on entry; lane-level SLA badges in the builder.
- API: GET /journey/statuses (catalog grouped by stage), POST /journey/leads/{lead}/transition (guarded). FlowEngine::applyStatus() enforces allow-list+gates+SLA and writes an AuditLog row; status_change nodes resolve catalog codes.
- NOTE: DB was rebuilt via migrate:fresh --seed during this work (preview DB had reset); fixed a migration-ordering bug where the auth-security migration altered personal_access_tokens before its create migration (guarded + added 2026_08_10 follow-up migration).
- Capability answer given to user: CRM already had stages, triggers->actions automations, templated WhatsApp/email, sequences, scoring, dedupe/routing, booking->customer, dispositions, audit; the 3 gaps above are now closed. Legal note flagged: RERA advance cap is project/state config, not hard-coded.

## 2026-06 — Journey Builder: Save as Template [DONE, self-tested]
- Wired the Journey Builder into the existing team-shared FlowTemplate API. New "Templates" button (jb-templates) opens a drawer to (a) save the current journey as a named, team-shared reusable template and (b) load/delete existing templates. Templates store the full compiled graph incl. the "journey" lane view-model, so loading restores the exact lanes/steps/branches.
- Added journeyFromGraph() decompiler: rebuilds lanes from graph.journey, or falls back to grouping Drawflow nodes by data.stage. Used on both workflow load and template load. journey.js v4.
- Verified: POST /flow-templates saves 27-node graph with journey lanes; GET lists; DELETE removes; UI drawer + Load/Delete confirmed via screenshot. QA template cleaned up (0 remaining).

## 2026-06 — Lead Detail reworked into full-width "Lead Cockpit" [DONE, testing_agent iteration_35: frontend 100%, 0 bugs]
- Replaced the half-screen right-side DRAWER with a full-page, full-width 3-column cockpit (route #/leads/{id}). Files: public/assets/css/lead-cockpit.css, public/assets/js/leads.js (openLead(view,id) rewrite), app.blade.php (lead-cockpit.css + leads.js?v=16).
- Layout: sticky full-width header (avatar, name, email/phone links, temperature badge, score bar, inline stage dropdown, journey-status pill, primary Schedule Visit button, Actions dropdown consolidating verify/recalc/enroll/dnc/invalid/won/lost). Left rail: Details, Qualification (Edit -> modal), Site Visits. Main: Journey card (live stepper), unified "Log an activity" composer with Note | Communicate sub-tabs (note add; WhatsApp incl. template picker, Email, Call), Activity Timeline. Right rail: Open Tasks + Quote/Booking/Post-Sales module widgets (open in modals via CRM.modal).
- All existing functionality preserved (reused stageChanger, qualifyForm, journeyTab, commsPanel, quote/booking/postsales tabs); data-testids retained/added. Matches design system (design_agent blueprint in design_guidelines.json).
- Known optional/minor: Schedule Visit modal still uses native datetime-local input (pre-existing, out of scope).

## 2026-06 — Designed date picker + SLA removal [DONE, self-tested via UI]
- New CRM.datePicker() (public/assets/js/datepicker.js + datepicker.css): styled inline month-grid calendar with prev/next, disabled past days, today marker, lime selection, and a 30-min time dropdown. Returns YYYY-MM-DDTHH:mm.
- Wired into Schedule Site Visit and Reschedule modals (inventory.js v12), replacing native datetime-local. Verified: schedules correct date/time, stamps visit + task + confirmation activity.
- Removed SLAs per user: dropped lane SLA badges from the Journey Builder (journey.js v5, 0 .jb-sla), removed SLA wording from the status-change hint, and FlowEngine::applyStatus no longer stamps leads.status_sla_due_at (column left dormant). Allow-listed transitions + required-field gates remain.
- Blade: added datepicker.css/js, bumped inventory.js v12, journey.js v5.

## 2026-06 — Quick Reschedule + configurable Reminder Windows [DONE, self-tested]
- Quick Reschedule: exposed CRM.rescheduleVisit(visit,onDone) (inventory.js) and added a one-tap reschedule icon on each site-visit row in the Lead Cockpit (leads.js v17) using the designed CRM.datePicker. Site Visits page reuses the same helper.
- Reminder Windows: admin-configurable via a preset-chip card in the Automations config page (config.js v11, data-testid reminder-windows). Backend: app_settings table + AppSetting model (get/set), SettingsController (GET/PUT /settings/reminders; PUT gated by config.manage; validates 5min..14d, dedupes, sorts desc). RunReminders now reads site_visit_reminder_windows (default [1440,60]), widens the scan to the max window, sends WhatsApp per window (email for >=4h windows), tracks sent per window tag (w{minutes}). Removed the hardcoded 24h/1h logic.
- Verified: settings get/put/validation (422 on <5min), crm:reminders runs across configured windows, reminder card + cockpit reschedule modal via screenshots.

## 2026-06 — Role-aware Dashboards [DONE, self-tested]
Dashboard now renders per role via a `view` discriminator from GET /dashboard (DashboardController):
- **Admin** (role.slug=admin / dept=admin): original company-wide overview restored (hero ring, KPIs, funnel, sources, recent leads, integrations strip). `view=admin`.
- **Sales** (dept=sales): rich cockpit — top KPIs, railway-style "Lead Flow Journey" pipeline map, Top Prospects with **AI conversation summaries** (Gemini 3 Flash via Emergent LLM key), weekly calendar of tasks+visits, funnel, leads-over-time trend, sources, activity feed. Scoped: BDE (tier=exec) sees own leads (owner_id=self); BDM/Head see the whole sales dept rollup. `view=sales`, `scope=you|team`.
- **Accounts/Legal/CRM** (functional): minimal function dashboards — Accounts=Collections Overview (dues/overdue/received/demand letters + payments table), Legal=Agreements & docs, CRM=Customer Success (bookings). `view=functional` with kpis[] + panels[] (generic renderer).

AI summaries: LeadSummaryService builds context from recent WhatsApp/calls/activities + lead attrs, calls scripts/llm_summarize.py (emergentintegrations, gemini-3-flash-preview) via Process. Cached in lead.meta (ai_summary + ai_summary_sig signature); regenerated only when conversation state changes. Endpoint GET /dashboard/summaries generates+caches lazily; frontend patches summaries in after first paint (~7s first run, instant cached).
Files: app/Http/Controllers/Api/DashboardController.php, app/Services/LeadSummaryService.php, scripts/llm_summarize.py, public/assets/js/dashboard.js (v16), public/assets/css/dashboard.css (v2), routes/api.php (dashboard/summaries).
Verified: all 6 role logins return correct view; BDE scoped to 2 own leads vs admin 4; AI summaries generate+cache; admin & accounts screenshots confirmed.

## 2026-06 — WATI-parity WhatsApp Suite (P1: Template Builder) [DONE, self-tested]
User wants an in-app WATI clone: templates, WhatsApp chatbots, rules, flow builder, campaigns. Building phase-by-phase (P1 templates → P2 chatbot/flow builder → P3 inbound rules → P4 campaign manager), brand-new WATI-style UI, access = Admin + Sales Head + CRM Head (new `messaging.manage` permission), built in mock/sandbox now (ready for live Meta).
P1 done: WhatsApp Template Builder. Migration 2026_06_17 adds header_type/header_text/footer/buttons(json)/example(json)/rejection_reason/provider_id/created_by/submitted_at to whatsapp_templates. WhatsAppTemplateController: store/update/destroy/submit/sync (submit → live Meta POST /{waba}/message_templates when connected, else sandbox auto-APPROVE). Routes under permission:messaging.manage. UI: whatsapp.js waTemplates rewritten as builder (composer + live WhatsApp preview + button editor + status badges + submit/edit/delete), app.css WA builder styles, nav perm changed config.manage→messaging.manage. Verified: create/submit/403-for-BDE via curl; builder + live preview via screenshot.
NEXT: P2 WhatsApp Chatbot/Flow Builder (brand-new visual builder, inbound-triggered, buttons/lists/capture/agent-handoff), then P3 inbound rules, then P4 campaign manager.

## 2026-06 — WATI Suite P2: WhatsApp Chatbot/Flow Builder [DONE, self-tested]
Brand-new visual bot builder. Table wa_flows (2026_06_18) stores each bot as a graph JSON {entry, nodes:{key:{type,title,config,x,y}}}. Node types: message, buttons (max 3), list menu, capture (saves reply to a lead field), agent handoff, end. Model WaFlow; WaFlowEngine service (start/step/run + matchFlow keyword/default resolver, handoff action); WaFlowController (index/show/store/update/destroy/activate/test) under permission:messaging.manage. Sandbox test endpoint /wa-flows/{id}/test runs the engine step-by-step.
Frontend public/assets/js/wa-flows.js (new, blade v1): list of bots + drag-and-drop canvas with color-coded node cards, connector SVG lines, inline editing, per-option target dropdowns, start-step star, palette, trigger/keyword bar, Save/Activate, and a WhatsApp-style live Test simulator (buttons/list chips + free-text capture). Nav item 'WhatsApp Bots' (messaging.manage). CSS in app.css v14.
Verified: engine start→buttons→capture→handoff (captures preferred_location) via curl; builder canvas + live simulator via screenshots. Runs for real via webhook once Meta WhatsApp connected.
NEXT: P3 inbound rules (keyword/office-hours/away/auto-assign), P4 campaign manager (segmented scheduled template broadcasts + analytics).

## 2026-06 — WATI Suite P3: Inbound Rules [DONE, self-tested + live-wired]
Table wa_inbound_rules (2026_06_19) + whatsapp_conversations.bot_state json (2026_06_19_010000). Config in AppSetting key 'wa_inbound' (office_hours_enabled, per-day hours, away_message, auto_assign_mode off|round_robin|specific, auto_assign_agents, rr_pointer). Service InboundRouter->evaluate(text,dt,persist) → away/reply/assigned_to/bot/tags/steps. Model WaInboundRule (keywords, match_type contains|exact, action bot|assign|tag|reply, flow_id/assignee_id/tag/reply_text, priority, enabled). Controller InboundRuleController (index/updateSettings/store/update/destroy/test) under permission:messaging.manage.
LIVE WIRING: WebhookController::handleMetaWhatsapp now calls handleInboundAutomation() after recordInbound — drives an active bot session (WaFlowEngine::step, persists bot_state, applies captured fields to the lead, handoff→assign) OR evaluates inbound rules (assign/tag/start bot/auto-reply). Falls back to existing runAutoReplies when nothing handled. Guarded in try/catch so it can't break the webhook. Buttons/list rendered as text options for now (interactive payloads later).
Frontend public/assets/js/wa-inbound.js (blade v1): business-hours grid + away, auto-assignment mode+agents, keyword rules table (add/edit/delete modal), live inbound test simulator. Nav 'Inbound Rules' (messaging.manage). CSS app.css v15.
Verified: curl during/after hours (keyword reply + round-robin; away after hours); simulated Meta webhook inbound → conversation auto-assigned + auto-reply sent (recorded outbound); UI screenshot.
NEXT: P4 campaign manager (segmented scheduled template broadcasts + delivery/read/reply analytics).

## 2026-06 — WATI Suite P4: Campaign Manager [DONE, self-tested] — WATI SUITE COMPLETE
Tables wa_campaigns + wa_campaign_recipients (2026_06_20). Models WaCampaign/WaCampaignRecipient. WaCampaignService: audienceQuery(filters: temperature/status/source/owner_id, phone not null, not opted out), audienceCount, launch (live via driver->sendTemplate if connected, else sandbox simulate ~92% delivered/64% read/16% replied, clearly labelled simulated=true), computeStats funnel. WaCampaignController (index/show/preview/store/update/destroy/launch) under permission:messaging.manage. Command wa:campaigns:dispatch (scheduled every minute in routes/console.php) sends due scheduled campaigns.
Frontend public/assets/js/wa-campaigns.js (blade v1): campaign cards with mini funnel + Send now/delete, New-campaign modal (approved-template picker + live preview + audience filters with live count + optional schedule), analytics modal (6-stat funnel + animated bars + recipients table + sandbox banner). Nav 'Campaigns' (messaging.manage). CSS app.css v16.
Verified: audience preview=5, create+launch with simulated funnel (5/5/5/3/1/0) via curl; analytics + builder via screenshots.
WATI-parity suite now covers P1 Templates, P2 Bot builder, P3 Inbound rules, P4 Campaigns — all sandbox-ready, live once Meta WhatsApp connected.
REMAINING ENHANCEMENTS (not yet built): Interactive button/list messages over live API (currently text fallback); Template-to-Bot quick-reply link; per-agent availability for round-robin. Connect WhatsApp = user's one-time Meta step.

## 2026-06 — WhatsApp: Interactive Messages + Template-to-Bot Link [DONE, self-tested E2E via webhook sim]
User request: (1) send REAL WhatsApp button/list messages (not text fallbacks) once connected; (2) let an approved template's quick-reply buttons launch a chatbot flow (per-button); (3) one-time Connect-WhatsApp on live app (user step — checklist provided).
- INTERACTIVE MESSAGES: Added `Contract::sendList()` + implementations (CloudApiDriver builds real Meta `interactive.type=list` payload w/ sections/rows; Mock ok; Wati text). CloudApiDriver::sendInteractive already sent real button payloads. InboxService::reply now supports `type=list` (stores rows/button_label in meta). WebhookController bot-runtime `$send` closure now sends bot `buttons`/`list` nodes as REAL interactive/list payloads via InboxService (falls back gracefully to text if the provider rejects, so the bot never stalls). In mock mode messages are recorded with message_type interactive/list + meta so the inbox renders chips.
- TEMPLATE-TO-BOT LINK (per button): template quick-reply buttons carry optional `flow_id` (stored in the existing buttons json — no migration). WhatsAppTemplateController validates `buttons.*.flow_id` exists in wa_flows. Template Builder UI (whatsapp.js v17) shows a "🤖 Launch bot" dropdown per QUICK_REPLY button (loads active wa-flows); live preview shows a robot marker on linked buttons. Webhook: on inbound `button` (template quick-reply) or `interactive` reply with no active bot session, WebhookController::templateButtonFlow() matches the tapped button (by text/id) against the conversation's most recent outbound template and launches the linked WaFlow.
- Inbound interactive replies: extractReply() pulls button_reply.id / list_reply.id / button.payload; passed as the flow-step input so button IDs match node option ids exactly.
- Verified via curl webhook sim: template with linked quick-reply button → customer taps → linked bot launches (welcome text + real interactive buttons menu); button_reply id=b1 advances the session to the capture node; list reply stored with rows meta. Frontend builder dropdown confirmed via screenshot. Test artifacts cleaned up.
- LIVE: all real Meta payloads activate automatically once WhatsApp is connected (WHATSAPP_DRIVER=cloud via Integration Hub). Connect = user's one-time Meta step on Hostinger (Embedded Signup already built).

## 2026-06 — WhatsApp Suite polish: Bot Analytics + List Builder + Reusable Bot Templates + Go-Live Check [DONE, self-tested E2E]
Four follow-up enhancements to the WATI-style suite (all messaging.manage gated):
- BOT ANALYTICS: new wa_flow_events table (migration 2026_06_21_000000) + WaFlowEvent model. WaFlowEngine now records enter/reach/choose/handoff/complete events (best-effort, non-blocking) when driven live from the webhook (start/step gained $convId+$track params; WebhookController passes track=true for session-step, template-to-bot, and inbound-rule bot starts). GET /wa-flows/{flow}/analytics returns sessions, completed, handoffs, completion_rate + a per-node funnel (reached counts, per-button/row tap counts, drop-off). UI: "Analytics" button in the bot builder topbar + a chart icon on each bot card → analytics modal (stat cards + funnel bars + tap counts + drop-off). Verified via webhook sim: 1 session, 100% completion, button "Book a site visit" tap=1, handoff reached=1.
- LIST BUILDER: bot builder list-menu node now has a "Menu button label" input (config.button_label, max 20) + a per-row Description input (max 10 rows enforced). Feeds the real Meta interactive list payload (sendList). Verified via screenshot.
- REUSABLE BOT TEMPLATES: new wa_flow_templates table (migration 2026_06_21_010000) + WaFlowTemplate model. "Save as template" in the builder topbar (POST /wa-flows/{flow}/save-template); "Templates" button on the bot list opens a library modal (GET /wa-flow-templates) to Use (POST .../use → clones graph into a new draft bot) or Delete. Verified: save→list→use (4-node clone)→delete.
- GO-LIVE CONNECT CHECK: POST /integrations/meta_whatsapp/connection-check runs 5 checks (credentials saved, live mode active, WhatsApp number verified via Graph /{phone_id}, approved templates present, webhook callback URL+verify token) → overall pass/warn/fail. UI: "Run connection check" button in the meta_whatsapp Manage modal → checklist modal with colour-coded rows + the exact webhook URL. Verified via screenshot (sandbox shows credentials fail / templates pass / webhook warn).
- Cache bumps: app.css v17, wa-flows.js v2, integrations.js v6. All test artifacts cleaned up. Live behaviour (real interactive/list send, real number verify) activates once WhatsApp is connected.

## 2026-06 — WhatsApp bots: auto-trigger from inbound (no rule needed) [DONE, self-tested E2E]
Keyword/Default WaFlow bots now start on their own from any inbound WhatsApp message — no inbound rule required.
- WebhookController::handleInboundAutomation now, when no active session / template-link / inbound-rule handled the message and it's within business hours, calls WaFlowEngine::matchFlow($body): keyword-triggered active flows fire whenever their keyword is contained in the message; the Default (fallback) active bot greets ONLY the customer's first inbound (guarded by inbound message count ≤ 1) so it never re-greets on subsequent replies. Handoff auto-assign preserved. Respects office-hours away logic (skipped when away).
- UI hint added to the bot list intro + keyword-field tooltip explaining auto-start. wa-flows.js v3.
- Verified via webhook sim (office hours temporarily off): keyword bot auto-started with NO inbound rule; default bot greeted first message; after the session ended a 2nd generic message did NOT restart the default bot (outbound count unchanged). Office hours restored + test data cleaned.

## 2026-06 — WhatsApp bots: Book-a-Visit node + Repeat-Message cooldown [DONE, self-tested E2E]
- BOOK-A-VISIT NODE: new bot step type `book_visit` (WaFlowEngine treats it like a capture that waits for a date/time). When a customer answers a book_visit step, WebhookController parses the free-text date via Carbon (accepts "tomorrow 11am", "25 Dec 4pm", "next saturday 4pm"); invalid/past → re-prompts with a hint (stays on the step); valid → calls SiteVisitService::schedule($lead, ['scheduled_at'=>...]) which creates a real SiteVisit, moves the lead to Site Visit Scheduled, creates the rep task, sends WhatsApp+email confirmation, and reminders auto-run via crm:reminders. Builder: new "Book visit" palette node (calendar-check, #0EA5E9) with prompt + "After booking" target; simulator treats it as capture (no real visit created in test). wa-flows.js v4.
- REPEAT-MESSAGE GUARD: 30-minute per-conversation cooldown on the keyword/default auto-trigger path — WebhookController::recentlyTriggered() checks wa_flow_events for an 'enter' of the same (conversation, flow) within 30 min and skips re-starting the bot. Applies only to auto-trigger (explicit template-button/inbound-rule bot starts and active-session steps are unaffected).
- Verified via webhook sim (office hours temporarily off): keyword "visit" → bot asks date; "maybe sometime" → 0 visits (re-prompt); "next saturday 4pm" → SiteVisit scheduled 2026-08-22 16:00. Re-sending the keyword within cooldown did NOT re-trigger the bot (outbound count unchanged). Builder palette + node render confirmed via screenshot. Office hours restored, all test data cleaned.


## 2026-06 — Finance & Operations modules (stakeholder finance/ops dashboard, native) [DONE, tested]
Rebuilt the real-estate "stakeholder finance/ops dashboard" (from the deb782/post-sales-react-app & InternalDashboard repos — both were the same product, different stacks) NATIVELY inside the Laravel CRM. Covers the COST-OUT / site-operations side to complement the CRM's existing sales/money-IN side. User decisions: revenue = derived roll-up (no double entry); add roles management+site_manager; project_user scoping CRM-wide (assignment-based, empty=unrestricted); expenses always two-stage, NO threshold, reject needs reason; stock inward links to an approved expense.
- MIGRATION 2026_06_25_000000_finance_operations: project_user pivot; expenses (two-stage status: pending_accounts→pending_management→approved|rejected, receipt_path, meta); stock_items (opening_qty per project); stock_movements (inward|outward, expense_id link); revenue_targets (month/quarter).
- ROLES: `management` (finance.overview, expenses.approve_final, stock.view, reports.*, leads.view, projects.manage) + `site_manager` (expenses.raise, stock.manage — project-scoped operations persona). Accounts Head/Support gained expenses.view/approve + finance.overview/stock.view. Seeded in DatabaseSeeder roles()/role_defaults.php. Demo users: management@crm.local, site1@crm.local (→Skyline), site2@crm.local (→Green Valley), all Demo@12345.
- PROJECT SCOPING (app/Support/ProjectScope.php): assignment-based. A user with NO project_user rows is unrestricted (zero regression for legacy users); admin always unrestricted. Applied in ExpenseController, StockController, FinanceController, LeadController::index, InventoryController::tree. Assign via PUT /users/{id}/projects {project_ids} (UserController::assignProjects) + Users page card icon (people.js projectForm modal). userPayload now includes projects[].
- EXPENSES (ExpenseService, ExpenseController): raise→pending_accounts; approve-accounts (perm expenses.approve)→pending_management; approve-management (perm expenses.approve_final)→approved; reject (perm expenses.approve OR expenses.approve_final, pipe-any-of in CheckPermission) needs reason. Endpoints under /expenses/*, receipt upload via ObjectStorage. AuditService records each transition.
- STOCK BOOK (StockController): GET /stock/items returns computed opening/inward/outward/closing. Inward movement MUST reference an approved expense of the same project (422 otherwise); outward is free. GET /stock/approved-expenses for the picker.
- REVENUE OVERVIEW (FinanceController): GET /finance/overview?period=YYYY-MM derives accrued (bookings.deal_value), received (payments where status in received/verified/reconciled, joined via booking), receivable, approved-expense cost, net, plus target-vs-variance from revenue_targets. Targets via POST /finance/targets. Demo bookings+payments seeded so numbers are non-zero.
- FRONTEND: new nav group "Finance & Operations" (app.js, gated by expenses.view) → Revenue Overview (finance.overview), Site Expenses (expenses.view), Stock Book (stock.view). New module public/assets/js/finance-ops.js (CRM.pages.finance/.expenses/.stockBook). people.js v4 (project-assignment modal). Cache: app.js v34, config.js v12, people.js v4, finance-ops.js v2.
- VERIFIED: testing_agent iteration_36 backend 19/19 pass; frontend RBAC (management sees group+Revenue; site_manager sees Expenses+Stock only; sales sees no group), two-stage approval, reject-needs-reason (422), inward-needs-approved-expense (422), scoping (site1 sees only project 1 in expenses/leads/inventory), revenue derivation (accrued 33.9M / received 17.81M). Post-report fixes (assign-projects button moved to people.js; management reject enabled; pipe middleware) re-verified via curl + screenshot.
- NOTE: site_manager intentionally has NO leads.view (operations persona) — scoping still applies to any lead-viewing role that has project assignments.


## 2026-06 — Channel Partner module (ported from CP-Ref repo) [DONE, tested]
Ported the Channel Partner portal + lead-capture from the deb782/CP-Ref reference (raw PHP + external "PropFlo" push) NATIVELY into the CRM. User decisions: 1d (full enrollment+KYC + authenticated portal to submit/track leads + sub-representatives), 2b (SEPARATE partner login, own credentials — not CRM users), 3b (CP leads stored separately, NO auto-routing, + admin manual "Accept into CRM" bridge), 4 a/b/d (inventory lookup + documents + support tickets; NO reports/EOI/collaborator), 5 (admin-invite only, no public signup).
- MIGRATION 2026_06_26_000000_channel_partner_module: extends channel_partners with cp_code, contact_name/email/designation, password_hash, status (pending|approved|suspended), must_change_password, last_login_at + full KYC (address/entity/PAN/GSTIN/RERA/bank/signature, kyc_status). New tables: cp_representatives, cp_leads (converted_lead_id bridge), cp_lead_events, cp_documents, cp_tickets, cp_ticket_messages, cp_password_resets.
- SEPARATE AUTH (adapted Sanctum, integration_expert consulted): ChannelPartner uses HasApiTokens (polymorphic tokenable). Middleware `cp.auth` (CpAuth.php) resolves partner from bearer token + status gating. FULL ISOLATION: SlidingSession + CheckPermission now reject any non-User token on staff routes (partner token → 401 on staff routes; staff token → 401 on /cp/*; bogus → 401). CpAuthService handles invite (gen cp_code VV/CP/NNN + temp password + email creds), login (bcrypt via Hash), change/forgot/reset password.
- PORTAL (standalone SPA at /partner): resources/views/cp.blade.php + public/assets/js/cp-portal.js + css/cp-portal.css. Own token in localStorage 'cp_token'. Pages: login/forgot/forced-change-password, Dashboard, My Leads (submit+track+edit, locked once converted), My Team (sub-reps CRUD), Inventory (read-only plot availability), Documents (download), Support (tickets+reply), Profile & KYC (edit + submit for review). Distinct green partner-facing theme.
- LEADS (stored separately, no routing): partner submits → cp_leads (status new). Admin bridge: POST /admin/cp-leads/{id}/accept → CpLeadService.acceptIntoCrm → LeadService::capture(force=true) creates a real CRM lead (routing/scoring apply), sets converted_lead_id + status converted (idempotent, 422 on re-accept). Reject requires reason (422 if empty).
- ADMIN (staff SPA, perm `partners.manage` → admin, process_admin, crm_head): public/assets/js/partners-admin.js pages cpPartners (invite/approve-KYC/set-status), cpLeadsAdmin (accept/reject), cpDocs (upload/delete via ObjectStorage), cpTicketsAdmin (reply/status). Under existing "Partners" nav group. Endpoints under /admin/partners, /admin/cp-leads, /admin/cp-documents, /admin/cp-tickets.
- DEMO: cp@partner.local / Partner@12345 (Skyline Realtors, VV/CP/001, KYC approved, 2 reps + seeded cp_leads). Invite emails use MAIL_MAILER=log in preview; invite JSON returns temp_password for testing (gate before prod).
- VERIFIED: testing_agent iteration_37 backend 27/27 pass; frontend 100% after fixing (a) native .append(null) printing "null", (b) silent login error — portal api() now only redirects on real session expiry (had-token) so login 401 shows "Invalid email or password.". Asset versions: app.js v35, cp-portal.js v3, partners-admin.js v1.

## 2026-06 — Lead Journey redesign + stage-change WhatsApp (demo) [DONE, tested]
Reshaped the Lead Journey to a simplified BDE-led 4-stage flow matching the client's status board, and wired customer WhatsApp on every stage change (Meta/WhatsApp now live-connected). User choices: customer-facing WhatsApp (not internal), do BOTH Step A (stage remap) + Step B (per-stage WhatsApp).
- JOURNEY STAGES (lead_statuses, seeded via LeadJourneySeeder — legacy 40-status model REPLACED, stale rows deleted): S1 **Lead Entry** [Not Contacted], S2 **Qualification** [Contacted, Junk/Invalid, No Response, Unresponsive], S2F **FollowUp Stage** (NEW, between Qualification & Meeting) [General Follow-Up 1/2/3], S3 **Meeting & Site Visit** [Converted to Opportunity, Lost]. Colours + display names mirror the client image (Not Contacted #E0A63C, Contacted #7C5CC4, Follow-Up 1/2/3 blue/green/pink, Junk #7A211B, No Response #E08A2B, Unresponsive #1B2338, Converted teal #3CBA9A, Lost #E0483D). allowed_next enforces the flow; each status maps to an existing pipeline_slug so board/bookings/post-sales stay intact.
- MIGRATION 2026_06_27_000000_lead_status_color_wa: added color, wa_message, wa_enabled to lead_statuses.
- STAGE-CHANGE WHATSAPP (Step B): FlowEngine::applyStatus now sends the status's wa_message to the customer (via WhatsAppService, {name}/{first_name} substitution) whenever a lead enters a wa_enabled status. Editable UI: new page "Journey Messages" (public/assets/js/journey-msgs.js, CRM.pages.journeyMsgs, nav under Configuration, perm workflow.manage) — colored status list with per-status message + Auto-send toggle + Save + Test-send-to-a-lead. Endpoints: PUT /journey/statuses/{code}, POST /journey/statuses/{code}/test-message. GET /journey/statuses now returns color + wa_message + wa_enabled.
- CONVERTED TO OPPORTUNITY = BDE books site visit: SiteVisitService::schedule now applies CONVERTED_OPPORTUNITY (pipeline opportunity) + transfers the lead from the BDE owner to the least-loaded active sales_bdm (handToBdm), and the site-visit-confirmation WhatsApp is the journey message (removed the old duplicate send).
- JOURNEY BUILDER: journey.js defaultJourney() rewritten to the 4 lanes (Lead Entry → Qualification → FollowUp Stage → Meeting & Site Visit) with the new status codes + per-stage WhatsApp/task/wait steps. Cache: app.js v36, journey.js v6, journey-msgs.js v1.
- VERIFIED (curl + tinker + screenshots): journey catalog/colors correct; transitions fire WhatsApp (status 'sent' — live Meta); allowed_next enforcement (illegal move 422); test-message endpoint sends with name substitution; site-visit → CONVERTED_OPPORTUNITY + BDE→BDM transfer (Rahul Verma→Karan Malhotra); Journey Builder shows 4 stages; Journey Messages page shows colored dots + editors. NOTE: since Meta is live, moving a lead into a wa_enabled status sends a REAL WhatsApp.
- CODE-REVIEW TODO (pre-prod): gate invite endpoint's temp_password in the JSON response to non-production only.
## 2026-06 — Journey stage WhatsApp quick-reply buttons [DONE, tested]
- Each lead status can carry up to 3 quick-reply buttons (label + target next_code). Column lead_statuses.wa_buttons (JSON); migration 2026_06_28_000000_lead_status_wa_buttons.
- Send: FlowEngine::applyStatus uses WhatsAppService::sendInteractive (new) when a status has buttons — button id = "jrny_<CODE>"; graceful text fallback if provider rejects interactive.
- Reply: WebhookController::handleInboundAutomation intercepts inbound reply id starting "jrny_" BEFORE bot logic → FlowEngine::applyStatus advances the lead to that status (which fires the next stage message) + sends a thank-you. extractReply already parses interactive button_reply ids.
- Config UI: Journey Messages page (journey-msgs.js v2) — per-status button editor (label + target-status dropdown from allowed_next, add/remove up to 3) + Save (PUT /journey/statuses/{code} validates wa_buttons.*.next_code exists) + Test-send preview renders WhatsApp bubble with tappable buttons.
- Demo seed: Contacted [Interested→FU1, Book a visit→Opportunity]; Follow-Up 1/2/3 [Book a visit→Converted to Opportunity, Not interested→Lost].
- VERIFIED (curl+tinker+screenshot): interactive send on transition (status sent, live Meta); tap advances lead (FOLLOWUP_1→CONVERTED_OPPORTUNITY); PUT save + invalid next_code 422; test-send returns buttons; UI editor + preview render. Cache: journey-msgs.js v2.
