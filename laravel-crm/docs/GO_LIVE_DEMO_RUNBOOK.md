# Agrocorp CRM — Go-Live & Demo Runbook (beginner-friendly)

Goal: publish the CRM to your Hostinger domain, connect real WhatsApp + email, and run
tomorrow's demo on the live site. Follow the parts in order. Copy-paste commands exactly.
Replace anything in ANGLE BRACKETS like <yourdomain.com>.

IMPORTANT ground rules
- Keep the value of APP_KEY the same forever after first setup. If it changes, your saved
  integration passwords can't be decrypted and WhatsApp/email will silently stop.
- Web server must serve the `public/` folder as the site root (NOT the project root).
- PHP 8.2+, MySQL/MariaDB, and Composer are required.

============================================================
PART 0 — Accounts & things to have ready (do this first)
============================================================
[ ] Hostinger account with a plan that has SSH access (VPS, or Cloud/Business shared hosting).
[ ] Your domain pointed to Hostinger, with SSL/HTTPS enabled (hPanel → SSL → install free SSL).
[ ] A Facebook account + a Meta Business account (business.facebook.com).
[ ] A phone number for WhatsApp that is NOT already on the WhatsApp app (for later real use),
    OR just use Meta's free TEST number for the demo (recommended — see Part 5).
[ ] A Gmail/Google Workspace mailbox you control (e.g. crm@yourdomain.com) for sending email.
[ ] Your own personal WhatsApp number + email — you'll use these as the "demo customer"
    so messages actually arrive on your phone during the demo.

============================================================
PART 1 — Get the code onto Hostinger
============================================================
Easiest reliable method: SSH + Git.

1. In hPanel, open "Advanced → SSH Access", note the SSH host, port, username. Enable it.
2. From your computer, connect (Windows: use PowerShell; Mac: Terminal):
     ssh -p <port> <ssh-user>@<yourdomain.com>
3. Go to your web directory (Hostinger usually uses ~/domains/<yourdomain.com>):
     cd ~/domains/<yourdomain.com>
4. Put your project here. Two options:
   a) If your code is on GitHub (use the "Save to GitHub" button in Emergent first):
        git clone <your-repo-url> app
   b) Or upload a ZIP of /app/laravel-crm via hPanel File Manager and unzip into a folder `app`.
5. Point the website to the app's public folder. In hPanel → "Websites → your domain →
   Change website root / Document root", set it to:
        ~/domains/<yourdomain.com>/app/public
   (On a VPS with its own nginx/apache, set the site's document root to the same path.)

============================================================
PART 2 — Install and configure the app
============================================================
Run these on the server, inside the project folder (the `app` folder from Part 1):

  cd ~/domains/<yourdomain.com>/app

1. Install PHP dependencies (production):
     composer install --no-dev --optimize-autoloader

2. Create the environment file:
     cp .env.example .env        # if .env.example exists; otherwise create .env (see below)

3. Generate the encryption key (do this ONCE, then never change it):
     php artisan key:generate

4. Create a MySQL database in hPanel → "Databases → MySQL". Note the DB name, user, password.

5. Edit `.env` (use hPanel File Manager or `nano .env`). Set at least these lines:
     APP_NAME="Agrocorp CRM"
     APP_ENV=production
     APP_DEBUG=false
     APP_URL=https://<yourdomain.com>
     APP_TIMEZONE=Asia/Kolkata

     DB_CONNECTION=mysql
     DB_HOST=127.0.0.1
     DB_PORT=3306
     DB_DATABASE=<your_db_name>
     DB_USERNAME=<your_db_user>
     DB_PASSWORD=<your_db_password>

     SESSION_SECURE_COOKIE=true
     # Leave MAIL as log for now; we'll connect Gmail from the app's Integration Hub in Part 6.
     MAIL_MAILER=log
   Do NOT delete the APP_KEY line that key:generate created.

6. Create the database tables and demo data:
     php artisan migrate --force
     php artisan db:seed --force

7. Make storage public and set permissions:
     php artisan storage:link
     chmod -R 775 storage bootstrap/cache

8. Cache config for speed:
     php artisan config:cache
     php artisan route:cache

9. Open https://<yourdomain.com> in a browser. You should see the login page.
   Log in with the seeded admin (see /app/memory/test_credentials.md) and CHANGE the password.

If you see a blank page or 500 error, run `php artisan config:clear` then check
`storage/logs/laravel.log` for the last error.

============================================================
PART 3 — Turn on the scheduler (cron) — REQUIRED for reminders/campaigns
============================================================
Reminders, scheduled emails, and WhatsApp campaigns run every minute via Laravel's scheduler.
Without this, payment/visit reminders and scheduled sends will NOT fire.

1. hPanel → "Advanced → Cron Jobs → Create".
2. Set it to run "Every Minute" and use this command (replace the path):
     cd ~/domains/<yourdomain.com>/app && php artisan schedule:run >> /dev/null 2>&1
3. Save. That's it — the scheduler now drives crm:reminders, crm:automation,
   crm:email-scheduled, wa:campaigns:dispatch, crm:flow-run.

============================================================
PART 4 — Quick sanity check before integrations
============================================================
[ ] Login works, you changed the admin password.
[ ] Create a test Project + a Phase + a few Plots (Inventory).
[ ] Add a test lead manually — it should get assigned (round-robin) to an active sales user.
Everything above works WITHOUT any external integration.

============================================================
PART 5 — Connect real WhatsApp (the fast demo path)
============================================================
You do NOT need Business Verification or App Review to demo. Meta gives you a free TEST
number that can message up to 5 phone numbers you add. Use that for tomorrow.

STEP A — Create the Meta app
1. Go to https://developers.facebook.com → My Apps → Create App.
2. Choose type "Business". Give it a name (e.g. "Agrocorp CRM"). Create.
3. In the app dashboard, find "WhatsApp" and click "Set up".
4. It creates a WhatsApp test business account and shows:
     - a TEST phone number (the "From" number),
     - a temporary Access Token,
     - a "Phone number ID" and a "WhatsApp Business Account ID (WABA ID)".
   Keep this screen open.

STEP B — Add your recipients (so messages actually arrive)
1. On the same WhatsApp → API Setup screen, under "To", click "Manage phone number list".
2. Add YOUR personal WhatsApp number (and any teammates' numbers you'll demo to). Each gets a
   confirmation code on WhatsApp — enter it to verify. (Max 5 numbers on the test tier.)

STEP C — Get the credentials the CRM needs
- Access Token: the temporary one works for ~24h (fine for a demo). For something longer-lived,
  create a "System User" token in Business Settings, but the temp token is enough for tomorrow.
- Phone Number ID: shown on the API Setup screen.
- WABA ID: shown on the API Setup screen.
- App Secret: App dashboard → Settings → Basic → "App Secret" (click Show).
- Verify Token: make up any random word, e.g. "agrocorp_verify_2026". Remember it.

STEP D — Enter them in the CRM
1. Log into the CRM → Integrations → open "Meta WhatsApp Cloud".
2. Fill the fields:
     Permanent Access Token  = <the token from Step C>
     Phone Number ID         = <phone number id>
     WhatsApp Business Account ID = <waba id>
     App Secret              = <app secret>
     Webhook Verify Token    = agrocorp_verify_2026   (your made-up word)
   Click Save.
3. Click "Run connection check" — you want "WhatsApp number verified" to be green.
4. Toggle the integration ON (Enable). Templates auto-sync.

STEP E — Set the webhook (so replies/receipts come back)
1. In the Meta app dashboard → WhatsApp → Configuration → Webhooks → "Edit".
2. Callback URL:  https://<yourdomain.com>/api/v1/webhooks/whatsapp
   Verify Token:  agrocorp_verify_2026   (must match exactly what you typed in the CRM)
3. Click "Verify and Save". It should succeed.
4. Under "Webhook fields", click "Manage" and Subscribe to: messages.
   (This lets inbound customer messages + delivery/read receipts flow into the CRM.)

STEP F — Templates (needed for first-contact messages)
- A template named "hello_world" is pre-approved by Meta — great for a first live send.
- For your own templates: CRM → WhatsApp Templates → create → Submit. On live, Meta must approve
  them (usually a few minutes to a couple of hours). Submit any you want to demo TODAY so they're
  approved by tomorrow.

Now: sending a template or a session message from the CRM will land on the real phones you added
in Step B.

============================================================
PART 6 — Connect real email (Gmail / Google Workspace)
============================================================
1. Use a dedicated mailbox, e.g. crm@yourdomain.com (Workspace) or a Gmail address.
2. Turn on 2-Step Verification for that Google account (myaccount.google.com → Security).
3. Create an "App Password": Google Account → Security → App passwords → generate one for "Mail".
   You'll get a 16-character password. Copy it.
4. CRM → Integrations → "Google / SMTP Email" → fill:
     SMTP Host    = smtp.gmail.com
     Port         = 587
     Mailbox      = crm@yourdomain.com
     App Password = <the 16-character app password>
     From Name    = Agrocorp Realty
     From Email   = crm@yourdomain.com
   Save → click "Test" → you want "SMTP authenticated". Then Enable.
Now CRM emails (welcome, confirmations, campaigns, password reset) are really delivered.

============================================================
PART 7 — Final pre-demo prep (do the evening before)
============================================================
[ ] Rotate all demo user passwords (admin + the roles you'll show).
[ ] Create the users you'll demo, using REAL phone/email you control, so comms arrive live.
[ ] WhatsApp office hours: CRM → Inbound Rules → set your business hours to cover demo time,
    OR turn office hours off. (Outside hours, bots send an "away" message instead of replying.)
[ ] Server timezone is Asia/Kolkata (set in Part 2 .env). Restart if you changed it.
[ ] Pre-warm the dashboard AI summaries: log in as a Sales user and open the dashboard once
    (first load is slow ~10-30s; after that it's instant/cached).
[ ] Do ONE full dry-run end-to-end with your own phone + email as the demo customer.
[ ] Record a screen capture of the happy path as a backup, just in case.

============================================================
PART 8 — Demo-day quick reference
============================================================
- Login → Onboarding wizard (team, project, inventory) → Integrations (show green connections).
- Create/submit a WhatsApp template → show it approved.
- Capture a lead (website form / WhatsApp inbound / manual) → round-robin assigns it.
- BDE opens the Lead Cockpit → qualifies → schedules a site visit (customer gets a real WhatsApp).
- Show automations firing (activity timeline) + a bot conversation on your phone.
- Move lead pre-sales → sales → post-sales: Won → booking → cost sheet → payment plan.
- Trigger a payment/visit reminder: with cron running it fires on schedule; to show it instantly,
  an admin can run (SSH):  php artisan crm:reminders
- Show Collections / receipts / demand letters.

============================================================
Troubleshooting cheatsheet
============================================================
- 500 error / blank page:   php artisan config:clear && tail -n 50 storage/logs/laravel.log
- WhatsApp not sending:      re-run the Integration "Run connection check"; confirm the token
                             isn't expired and the recipient number is on your test list.
- Webhook won't verify:      the Verify Token in Meta must EXACTLY match the CRM field.
- Reminders not firing:      confirm the cron job (Part 3) exists and points to the right path.
- Emails not arriving:       re-Test SMTP; check the app password (not your login password);
                             look in spam.
- Login/session weirdness:   confirm APP_URL is your https domain and SESSION_SECURE_COOKIE=true.
