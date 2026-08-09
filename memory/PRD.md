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

## Backlog (prioritized)
- **P0 (Phase B — I–L)**: site-visit scheduling/execution/outcomes, sales handover, inventory board (Projects→Phases→Plots), cost-sheet/quotation, payment-plan selection, discount approvals, proposals.
- **P1 (Phase C — M–Q)**: deal closure + booking (Razorpay token/EOI), booking-form collection, payment verification + reconciliation, welcome/allotment letters, AFS + mock e-sign, milestone tracking + reminders, demand letters.
- **P2 (Phase D — R–T)**: Channel Partner portal + commission, full automation trigger engine + ~40 edge cases, audit/error dashboards, performance hardening (<2s search @100K), QA against A–T.

## Next tasks
1. Phase B site-visit scheduling + inventory board.
2. Razorpay integration playbook + token/EOI links (Phase C kickoff).
3. Wire real WATI/SMTP drivers when keys provided.
