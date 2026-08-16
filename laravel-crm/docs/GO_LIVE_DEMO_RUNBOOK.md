# Agrocorp CRM — Super-Detailed Go-Live & Demo Runbook

Written for someone who has never deployed a web app. Do the parts in order. Do not skip.
Whenever you see <SOMETHING IN ANGLE BRACKETS>, replace it (and the brackets) with your real value.
Keep a notepad file open and write down every value you create (passwords, IDs, tokens) as you go.

GOLDEN RULES (read once, remember forever)
- After you run `php artisan key:generate` ONE time, the APP_KEY line in .env must NEVER change again.
  If it changes, every saved integration password becomes unreadable and WhatsApp/email stop working.
- The website must serve the `public` folder, not the project folder. (Part 3.)
- Anything you type into Meta's "Verify Token" box must be IDENTICAL to what you typed in the CRM.
- Write down: DB name/user/password, admin password, Meta tokens/IDs, Gmail app password.


================================================================================
PART 1 — WHAT YOU NEED BEFORE YOU START (gather these first)
================================================================================
1.1  A Hostinger plan that has SSH access. VPS is best; Cloud/Business shared hosting also works.
1.2  Your domain (e.g. crm.agrocorp.com) connected to Hostinger.
1.3  A computer with a terminal:
     - Windows: press Start, type "PowerShell", open it.
     - Mac: open "Terminal" (Applications → Utilities).
1.4  A Facebook personal account you can log into.
1.5  A Meta Business account. If you don't have one, you'll create it during Part 8.
1.6  A Gmail or Google Workspace mailbox you control (e.g. crm@agrocorp.com). Used to send emails.
1.7  YOUR OWN phone with WhatsApp installed, and your own email inbox. You'll use these as the
     "demo customer" so the audience sees real messages arrive.
1.8  About 2–3 focused hours. Meta template approval can take up to a few hours, so start early.


================================================================================
PART 2 — GET THE CODE ONTO HOSTINGER
================================================================================
You have two ways. Method A (Git) is cleaner; Method B (ZIP upload) needs no Git knowledge.

--- 2.A  Turn on SSH and connect ---
2.A.1  Log into Hostinger → hPanel.
2.A.2  Left menu → "Advanced" → "SSH Access".
2.A.3  If it says disabled, click "Enable". Note the three values shown:
        SSH IP/Host, SSH Port (often 65002), SSH Username.
2.A.4  On your computer's terminal, type (replace values), press Enter:
        ssh -p <SSH Port> <SSH Username>@<SSH IP/Host>
2.A.5  The first time it asks "Are you sure you want to continue connecting?" → type: yes → Enter.
2.A.6  Enter your Hostinger password when asked (you won't see characters as you type — that's normal).
2.A.7  You are now "inside" the server. Move to your domain's folder:
        cd ~/domains/<yourdomain.com>
       (If that folder doesn't exist, run `ls ~/domains` to see the exact folder name, then cd into it.)

--- 2.B  Put the project files in a folder called `app` ---
Option 1 — from GitHub (recommended):
2.B.1  In the Emergent chat, use the "Save to GitHub" button to push the code to a repo.
2.B.2  Copy the repo URL (looks like https://github.com/<you>/<repo>.git).
2.B.3  On the server, run:
        git clone <your-repo-url> app
2.B.4  Wait until it finishes ("done."). You now have ~/domains/<yourdomain.com>/app

Option 2 — upload a ZIP (no Git):
2.B.1  In Emergent/your machine, make a ZIP of the /app/laravel-crm folder contents.
2.B.2  hPanel → "Files" → "File Manager" → open ~/domains/<yourdomain.com>.
2.B.3  Create a new folder named `app`. Enter it. Click "Upload", pick your ZIP.
2.B.4  After upload, right-click the ZIP → "Extract" → extract into the `app` folder.
2.B.5  Make sure files sit directly in `app` (you should see `artisan`, `composer.json`, `public`,
        `app`, `routes` inside `app`). If they extracted into an extra nested folder, move them up.


================================================================================
PART 3 — MAKE THE WEBSITE SHOW THE `public` FOLDER (critical)
================================================================================
Laravel must be served from the `public` subfolder or you'll get a blank page.

--- If you are on Hostinger SHARED/Cloud hosting ---
3.1  hPanel → "Websites" → click your domain → "Dashboard".
3.2  Look for "Website root" / "Document root" (sometimes under "Advanced" or "Website Settings").
3.3  Change it to:  domains/<yourdomain.com>/app/public
3.4  Save. (If your plan has no such setting, use the alternative below.)

--- Alternative for shared hosting without a document-root setting ---
Some Hostinger plans serve from `public_html`. In that case:
3.5  Move the app so its `public` maps to `public_html`. Easiest: in File Manager, put the whole
     project OUTSIDE public_html (e.g. in ~/domains/<yourdomain.com>/app), then edit
     `app/public/index.php` two lines to point up one more level:
        require __DIR__.'/../../app/vendor/autoload.php';
        $app = require_once __DIR__.'/../../app/bootstrap/app.php';
     and copy everything inside `app/public/` into `public_html/`.
     If this feels risky, prefer the "Website root" setting (3.3) or a VPS.

--- If you are on a VPS ---
3.6  Your nginx/apache virtual host's "root" must be
     /home/<user>/domains/<yourdomain.com>/app/public (or wherever you cloned).
     Then reload the web server: `sudo systemctl reload nginx` (or apache2).


================================================================================
PART 4 — INSTALL DEPENDENCIES AND CONFIGURE THE APP
================================================================================
Run every command below from inside the project folder:
        cd ~/domains/<yourdomain.com>/app

4.1  Install PHP libraries (production mode):
        composer install --no-dev --optimize-autoloader
     If it says "composer: command not found", try `composer2 install ...` or ask Hostinger
     support to enable Composer; on VPS install it per getcomposer.org.

4.2  Create the environment file:
        cp .env.example .env
     (If .env.example is missing, create an empty .env: `nano .env`, then paste the block in 4.6.)

4.3  Generate the app key ONE time:
        php artisan key:generate
     You should see "Application key set successfully." Do not run this again later.

4.4  Create the database in hPanel:
        hPanel → "Databases" → "Management" (MySQL).
        - Under "Create a New MySQL Database":
            Database name: agrocorp_crm         (Hostinger may prefix it, e.g. u123_agrocorp_crm)
            Username:      agrocorp_user
            Password:      <make a strong password and WRITE IT DOWN>
        - Click "Create".
        - Note the FULL final names it shows (with the u123_ prefix) — you need those exact strings.

4.5  Find your DB host: on Hostinger shared hosting it is usually `localhost` (not 127.0.0.1).
     If unsure, the Databases page lists "MySQL hostname".

4.6  Edit `.env` (`nano .env` on the server, or File Manager → edit). Make it contain at least:
        APP_NAME="Agrocorp CRM"
        APP_ENV=production
        APP_KEY=base64:...(leave the value key:generate created — do NOT touch)...
        APP_DEBUG=false
        APP_URL=https://<yourdomain.com>
        APP_TIMEZONE=Asia/Kolkata

        LOG_CHANNEL=stack

        DB_CONNECTION=mysql
        DB_HOST=localhost
        DB_PORT=3306
        DB_DATABASE=<full db name, e.g. u123_agrocorp_crm>
        DB_USERNAME=<full db user, e.g. u123_agrocorp_user>
        DB_PASSWORD=<the db password you set>

        SESSION_DRIVER=database
        SESSION_LIFETIME=60
        SESSION_SECURE_COOKIE=true
        SESSION_SAME_SITE=lax
        AUTH_TOKEN_TTL=60

        # Keep email in "log" mode for now — we connect real Gmail from inside the app (Part 9).
        MAIL_MAILER=log
     Save the file. (In nano: Ctrl+O, Enter, then Ctrl+X.)

4.7  Build the database tables and load starter/demo data:
        php artisan migrate --force
        php artisan db:seed --force
     `migrate` prints a list of "DONE" lines. `db:seed` creates roles, permissions and demo users.

4.8  Make uploaded files publicly reachable and fix permissions:
        php artisan storage:link
        chmod -R 775 storage bootstrap/cache

4.9  Speed up the app:
        php artisan config:cache
        php artisan route:cache
     (Whenever you later change .env, run `php artisan config:clear` then `php artisan config:cache`.)


================================================================================
PART 5 — TURN ON HTTPS (SSL)
================================================================================
5.1  hPanel → "Security" → "SSL".
5.2  Select your domain → "Install SSL" (free Let's Encrypt). Wait until status = "Active".
5.3  Force HTTPS: on the same SSL page toggle "Force HTTPS" ON (or in Websites → your domain →
     Advanced → "Force HTTPS"). This makes http:// auto-redirect to https://.


================================================================================
PART 6 — TURN ON THE SCHEDULER (CRON) — REQUIRED
================================================================================
Reminders, scheduled emails and WhatsApp campaigns run every minute. Without cron they NEVER fire.
6.1  hPanel → "Advanced" → "Cron Jobs".
6.2  Under "Create a New Cron Job":
       - "Type": choose "Custom" if asked.
       - "Common Settings" / frequency: choose "Every Minute" (or set all five boxes to *).
       - "Command to run": paste (replace the path):
           cd /home/<your-user>/domains/<yourdomain.com>/app && /usr/bin/php artisan schedule:run >> /dev/null 2>&1
         (To find the exact PHP path, run `which php` on the server and use that instead of /usr/bin/php.)
6.3  Click "Create". Done — the scheduler now drives crm:reminders, crm:automation,
     crm:email-scheduled, wa:campaigns:dispatch, crm:flow-run.


================================================================================
PART 7 — FIRST LOGIN AND SANITY CHECK
================================================================================
7.1  Open a browser → https://<yourdomain.com> → you should see the Agrocorp CRM login page.
     If blank/500: run `php artisan config:clear`, then check the last lines of the log:
       tail -n 60 storage/logs/laravel.log
7.2  Log in with the seeded admin. The email is admin@crm.local and the password is in
     /app/memory/test_credentials.md. IMMEDIATELY change the password (top-right avatar → Account
     Settings → Security → change password).
7.3  Quick capability check (no integrations needed yet):
     - Inventory → create a Project, a Phase, and a few Plots.
     - Leads → add one lead manually → confirm it auto-assigns to an active sales user (round-robin).
   If these work, your deployment is healthy.


================================================================================
PART 8 — CONNECT REAL WHATSAPP (click-by-click, demo-fast path)
================================================================================
You do NOT need Business Verification or App Review for the demo. Meta's free TEST number can send
to up to 5 phone numbers you personally verify. Use that.

--- 8.1  Create the Meta app ---
8.1.1  Go to https://developers.facebook.com and log in with your Facebook account.
8.1.2  Top-right → "My Apps" → "Create App".
8.1.3  "What do you want your app to do?" → choose "Other" → Next.
8.1.4  App type → choose "Business" → Next.
8.1.5  Name it: "Agrocorp CRM". Pick your Business account if asked. → "Create app".
       (It may ask for your Facebook password to confirm.)

--- 8.2  Add the WhatsApp product ---
8.2.1  In the app's left menu you'll see product cards. Find "WhatsApp" → click "Set up".
8.2.2  If prompted, select/create a Meta Business Account to attach → Continue.
8.2.3  You now land on "WhatsApp → API Setup" (or "Getting Started"). Keep this tab open — it
       shows the four things you need.

--- 8.3  Note the credentials shown on API Setup ---
On that screen you will see:
   - "From" = a TEST phone number Meta gave you (this is what sends messages).
   - "Temporary access token" — a long string. Click "Copy". (Valid ~24h; fine for a demo.)
   - "Phone number ID" — a number under the From field. Copy it.
   - "WhatsApp Business Account ID" (WABA ID) — usually shown here or in Business Settings. Copy it.
Write all three down.

--- 8.4  Add YOUR phone as a recipient (so messages actually arrive) ---
8.4.1  On the same API Setup screen, find the "To" dropdown → "Manage phone number list"
       (or "Add recipient").
8.4.2  Enter your own WhatsApp number in full international format (e.g. +91XXXXXXXXXX).
8.4.3  Meta sends a code to that number on WhatsApp. Enter the code to verify.
8.4.4  Repeat for any teammate numbers you'll message during the demo (max 5 total).

--- 8.5  Get the App Secret ---
8.5.1  Left menu → "App settings" → "Basic".
8.5.2  Find "App Secret" → click "Show" → enter your FB password → copy the value. Write it down.

--- 8.6  Invent a Verify Token ---
8.6.1  Make up any random word/phrase, e.g.:  agrocorp_verify_2026
       Write it down. You'll type this in TWO places and they must match exactly.

--- 8.7  Enter everything into the CRM ---
8.7.1  In the CRM (logged in as admin) → left menu → "Integrations".
8.7.2  Click the "Meta WhatsApp Cloud" card → the panel opens.
8.7.3  Fill the fields (scroll to the manual fields below the green Connect button):
         Permanent Access Token       = <temporary token from 8.3>
         Phone Number ID              = <from 8.3>
         WhatsApp Business Account ID = <WABA ID from 8.3>
         App Secret                   = <from 8.5>
         Webhook Verify Token         = agrocorp_verify_2026
8.7.4  Click "Save".
8.7.5  Click "Run connection check". You want "WhatsApp number verified" to be GREEN. If it's red,
       your token expired (regenerate it on the API Setup screen and paste again) or an ID is wrong.
8.7.6  Toggle the integration switch to ON / "Enable". Templates will auto-sync.

--- 8.8  Set the webhook so replies and delivery/read receipts come back ---
8.8.1  Back in the Meta app dashboard → left menu → "WhatsApp" → "Configuration".
8.8.2  Find "Webhook" → click "Edit".
8.8.3  Callback URL:   https://<yourdomain.com>/api/v1/webhooks/whatsapp
       Verify token:   agrocorp_verify_2026     (EXACTLY what you typed in 8.7.3)
8.8.4  Click "Verify and save". It should succeed (green tick). If it fails, the token doesn't match
       or the site isn't reachable over HTTPS — re-check Parts 5 and 8.7.3.
8.8.5  Under "Webhook fields" click "Manage" → find "messages" → click "Subscribe".
       (This delivers inbound customer messages + sent/delivered/read status into the CRM.)

--- 8.9  Templates (needed to start a conversation with a new lead) ---
8.9.1  A template named "hello_world" is pre-approved by Meta — perfect for your first live send.
8.9.2  To make your own: CRM → "WhatsApp Templates" → "New template" → fill name (lowercase_with_
       underscores), category, body, buttons → "Save draft" → "Submit".
8.9.3  On live, Meta must APPROVE new templates. This usually takes minutes but can take a few hours.
       SUBMIT ANY TEMPLATES YOU WANT TO DEMO NOW so they're approved by tomorrow. Watch the status
       change from PENDING to APPROVED (click "Sync from Meta" to refresh).
8.9.4  Test: CRM → WhatsApp Inbox → "Simulate inbound" won't be needed now; instead open a lead that
       has YOUR verified number and send the template — it should arrive on your phone within seconds.


================================================================================
PART 9 — CONNECT REAL EMAIL (Gmail / Google Workspace)
================================================================================
--- 9.1  Prepare the mailbox ---
9.1.1  Decide the sending mailbox, e.g. crm@agrocorp.com (Workspace) or a Gmail address.
9.1.2  Go to https://myaccount.google.com → "Security".
9.1.3  Turn ON "2-Step Verification" if it isn't already (follow Google's prompts).

--- 9.2  Create an App Password ---
9.2.1  Still under Security, search/find "App passwords" (only appears after 2-Step is ON).
9.2.2  App: choose "Mail". Device: "Other" → type "Agrocorp CRM" → "Generate".
9.2.3  Google shows a 16-character password (four groups of four). Copy it (ignore the spaces).
       This is NOT your normal login password.

--- 9.3  Enter it into the CRM ---
9.3.1  CRM → "Integrations" → "Google / SMTP Email" card.
9.3.2  Fill:
         SMTP Host    = smtp.gmail.com
         Port         = 587
         Mailbox      = crm@agrocorp.com   (the address from 9.1)
         App Password = <the 16-char password, no spaces>
         From Name    = Agrocorp Realty
         From Email   = crm@agrocorp.com
9.3.3  Click "Save" → click "Test". You want "SMTP authenticated as ...". 
       If it fails: 2-Step isn't on, or you used the login password instead of the app password.
9.3.4  Toggle "Enable".
9.3.5  Real test: trigger any CRM email (e.g. add a lead with YOUR email, or use "Forgot password").
       Check your inbox (and spam) — it should arrive.


================================================================================
PART 10 — CREATE YOUR DEMO USERS AND DEMO CUSTOMER
================================================================================
10.1  CRM → "Users & Roles" (admin) → add the users you'll act as (e.g. a BDE, a Sales Head).
      Use REAL emails you can open, so notification emails arrive during the demo.
10.2  Rotate/known passwords: set memorable demo passwords and WRITE THEM DOWN.
10.3  Create the "demo customer" lead using YOUR OWN phone number (the one you verified in 8.4)
      and YOUR OWN email — so every WhatsApp/email in the demo lands on your devices on screen.


================================================================================
PART 11 — LAST SETTINGS THE NIGHT BEFORE
================================================================================
11.1  WhatsApp office hours: CRM → "Inbound Rules". Either set business hours to COVER your demo
      time, or turn "Office hours" OFF. (Outside hours, bots reply with an "away" message.)
11.2  Confirm timezone: .env has APP_TIMEZONE=Asia/Kolkata (Part 4.6). If you changed it after
      caching, run: php artisan config:clear && php artisan config:cache
11.3  Pre-warm AI: log in as a Sales user and open the Dashboard once. The AI "Top Prospects"
      summaries are slow on first load (10–30s) then cached/instant. Do this before you present.
11.4  Approved templates: re-check WhatsApp Templates → all the ones you'll show say APPROVED.
11.5  FULL DRY RUN: do the entire demo once, end to end, with your phone + email as the customer.
11.6  Backup: screen-record that dry run so you have a fallback video if the internet misbehaves.


================================================================================
PART 12 — DEMO-DAY SCRIPT (suggested order that matches your 12 points)
================================================================================
1.  Admin login (show the branded dashboard).
2.  Team assignment (Users & Roles / onboarding wizard).
3.  Project mapping (Inventory → create/show a project).
4.  Inventory mapping (phases + plots, colour-coded availability).
5.  Integrations (open Integrations, show WhatsApp + Email connected/green; run the connection check).
6.  Template creation (create or show an APPROVED WhatsApp template + an email template).
7.  Lead capture from sources (website form/chatbot embed on the live URL; or WhatsApp inbound by
    messaging your test number from your phone — it appears as a new lead).
8.  Lead capture in the CRM + round-robin (add a lead; show it auto-assign to a BDE).
9.  BDE works the lead (log in as BDE → Lead Cockpit → qualify → schedule a site visit; your phone
    receives the real WhatsApp confirmation).
10. Communications + automations (show the activity timeline filling with sent WhatsApp/emails; show
    a bot conversation on your phone; a template message arriving).
11. Pre-sales → sales → post-sales (move the lead through stages; note gates that need fields).
12. Booking + cost sheet + payments (Won → booking → generate cost sheet → payment plan → record a
    payment → receipt). To show a payment/visit REMINDER instantly instead of waiting, SSH in and run:
        cd ~/domains/<yourdomain.com>/app && php artisan crm:reminders
    (and for scheduled emails/campaigns: `php artisan crm:email-scheduled` and `php artisan wa:campaigns:dispatch`)


================================================================================
PART 13 — TROUBLESHOOTING (symptom → fix)
================================================================================
- Blank page / HTTP 500:
    php artisan config:clear
    tail -n 60 storage/logs/laravel.log     (read the last error line)
  Common causes: website root not set to /public (Part 3), wrong DB credentials (Part 4.6),
  storage not writable (`chmod -R 775 storage bootstrap/cache`).
- "419 page expired" on login: APP_URL must be your exact https domain; SESSION_SECURE_COOKIE=true;
  then `php artisan config:clear`.
- WhatsApp won't send: Integration "Run connection check". If the number check is red, the token
  expired (regenerate on Meta API Setup) or the recipient isn't in your verified list (8.4).
- Webhook "Verify and save" fails: the Verify Token in Meta must EXACTLY equal the CRM field; the
  site must be reachable on https. Re-check Parts 5 and 8.7.3.
- Reminders/campaigns not firing: the cron (Part 6) is missing or the path/php is wrong. Run
  `which php` and use that full path; test manually with `php artisan crm:reminders`.
- Emails not arriving: re-Test SMTP; ensure 2-Step is ON and you used the 16-char app password;
  check spam; confirm the integration is Enabled.
- Templates stuck PENDING: that's Meta reviewing — use `hello_world` meanwhile; click "Sync from
  Meta" to refresh status.
- Razorpay payments / e-sign: these remain simulated ("mock") unless you add those provider keys.
  For the demo, narrate them as mock, or ask the developer to wire Razorpay (a test key is already
  available in the app environment).

================================================================================
WHERE TO GET HELP FAST
================================================================================
- Deployment/hosting steps (Parts 1–7): Hostinger 24/7 chat support (hPanel → Help).
- Meta app / WhatsApp (Part 8): developers.facebook.com/docs/whatsapp/cloud-api → "Get started".
- Everything CRM-side: the in-app Integrations "Run connection check" tells you exactly what's
  missing (credentials, live mode, verified number, templates, webhook).
