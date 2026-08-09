# Real Estate CRM — Laravel 11 (Phase A: Pre-Sales)

Production-style Laravel 11 + MySQL CRM. This build delivers **Phase A (Sections A–H)** of the
build.docx acceptance spec on the architecture described in `README-Tech.md`, with Sales /
Post-Sales / Channel-Partner foundations in place (schema + pipeline stages) for later phases.

## Stack
- Laravel 11 (PHP 8.2+), `bootstrap/app.php` bootstrap pattern
- MySQL 8 / MariaDB + Eloquent + one unified schema migration
- Laravel Sanctum bearer-token auth + `CheckPermission` RBAC middleware
- Database queue + scheduler (no Redis)
- Vanilla JS SPA served through Blade (no npm/build) — `public/assets/{css,js}`
- Integration adapters: WhatsApp (mock/wati/cloud), Telephony (mock/exotel), Email (SMTP/log)

## Quick start
```bash
composer install
cp .env.example .env      # (a working .env is already committed)
php artisan key:generate
mysql -u root -e "CREATE DATABASE crm CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
php artisan migrate:fresh --seed --force
php artisan serve         # http://127.0.0.1:8000
```
Login: `admin@crm.local` / `Admin@12345`

## Background workers
```bash
php artisan schedule:work          # runs all three every minute/5m/10m
# or individually:
php artisan crm:automation         # nurture sequence steps + daily re-scoring
php artisan crm:reminders          # verify-task SLA escalation + follow-up SLAs
php artisan crm:webhooks           # retry failed outbound comms / webhooks
```

## Feature coverage (build.docx A–H)
- **A. Lead capture** — website/Meta form webhook, manual entry, bulk CSV import (preview + per-row status + error log), auto-acknowledgement, source/campaign/geo tagging, round-robin routing to pre-sales.
- **B. Duplicate detection** — real-time email/phone block + fuzzy name+domain flag, manual merge (history consolidation), periodic scan report, lead↔contact linking.
- **C. Verification & contact** — auto "Verify Lead" task + 2h SLA escalation, call logging (outcome/duration/notes/recording), WhatsApp send + inbound import, contact-verified flags.
- **D. Qualification & scoring** — qualification fields, auto score + temperature (Hot 70+/Warm 40–69/Cold <40), admin-configurable scoring rules, intent/objection capture.
- **E. Nurturing** — Hot/Warm/Cold sequences (6 touchpoints each), auto-enroll by temperature, auto-pause on negative/won, welcome automation.
- **F. Follow-up tracking** — per-channel logging (call/WhatsApp/email) with read/open/click tracking, over-contact guards, escalation flags.
- **G. Status engine** — positive/negative/special transitions, manual override with reason + audit, manager approval for downgrades.
- **H. Scoring & prioritization** — configurable factors, daily recalculation command, prioritized call list (hot→warm→cold, score, recency).

Integrations are MOCK by default; switch drivers in `.env` (`WHATSAPP_DRIVER`, `TELEPHONY_DRIVER`, `EMAIL_DRIVER`).

## API
Base `/api/v1`, JSON in/out, Bearer auth. See `routes/api.php` for the full surface.
