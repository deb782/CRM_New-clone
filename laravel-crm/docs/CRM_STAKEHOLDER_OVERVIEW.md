# Real Estate CRM — Stakeholder Overview

*A plain-English briefing document for management, investors and partners. Use this to explain what the product is, what it does, and why it matters.*

---

## 1. Executive summary

This is a **complete, sellable Real Estate CRM** — one system that runs a property sales business end-to-end.

It captures every enquiry, makes sure the sales team follows up on time, manages site visits, bookings, payments and legal documents, sends WhatsApp and email at scale, and gives management a clear, live picture of the whole business.

- **Built for real estate**, not a generic sales tool.
- **One system, many roles** — sales, accounts, legal, customer care, management and channel partners all work together, each seeing only what they should.
- **Ready to sell as a product** — it has a premium, modern interface and can be set up for a new company through a guided wizard.
- **Safe by default** — it runs in a demo mode until the company connects its own messaging, email and calling accounts.

---

## 2. The problem it solves

Real estate sales teams typically lose deals because:

- **Leads slip through the cracks** — no single place to see every enquiry, so follow-ups are missed.
- **Slow follow-up** — the first company to respond usually wins; manual processes are too slow.
- **No visibility for management** — leadership can't see, in real time, where deals are or why they stall.
- **Scattered tools** — WhatsApp on personal phones, payments in spreadsheets, documents in email.
- **Weak accountability** — hard to know who did what, and whether deadlines were met.

This CRM fixes all of the above by putting the **entire customer journey in one accountable system** with automatic reminders and clear ownership.

---

## 3. What the CRM does (core capabilities)

### 3.1 Lead management
- Captures leads from **website, WhatsApp, manual entry, bulk import, and partner referrals**.
- Automatically **blocks duplicates** and flags similar records.
- **Scores** each lead and marks it **Hot, Warm or Cold** so the team focuses on the best opportunities.
- Routes leads to the right person automatically.

### 3.2 Sales execution
- **Pipeline board** to move deals through stages with simple drag-and-drop.
- **Daily call lists** and a **task list** so every rep knows what to do next.
- **Site visit scheduling** with reminders, no-show tracking, and location check-in/check-out.
- **SLA "Heat Board"** that surfaces anything overdue or at risk.

### 3.3 Deals, finance & documents
- **Cost sheets, payment plans and proposals**.
- **Discount approvals** with built-in limits and sign-off.
- **Bookings** with locked records for data integrity.
- **Payments, receipts, reconciliation** and welcome documents.
- **Allotment and agreements** triggered automatically at 10% collection.
- **Demand letters** with serial numbers, ageing, and interest on late payments.

### 3.4 Communication at scale
- **Built-in WhatsApp inbox** — a full chat centre with assignment, notes, tags, canned replies, broadcasts, auto-replies, templates and analytics. *(This is a built-in alternative to third-party tools like WATI.)*
- **Email marketing** — templates, bulk campaigns, scheduling, open/click tracking and one-click unsubscribe.
- **Website chat widget** — an embeddable chat box that captures leads directly from the company website.

### 3.5 Automation
- A **visual workflow builder** (drag-and-connect, no coding) to automate journeys such as: *"When a new hot lead arrives, send a WhatsApp, wait a day, then create a follow-up task."*
- Rules run automatically in the background based on real lead activity.

### 3.6 Management & governance
- **Role-aware dashboards** — every role gets a home screen built for their job: sales teams get a live selling **cockpit** with **AI-written summaries of their top prospects**, a railway-style pipeline map and a personal calendar; management gets a company-wide overview; Accounts, Legal and CRM each get a focused view of collections, agreements and customer success.
- **AI conversation summaries** — the system reads each hot lead's recent WhatsApp and notes and writes a one-line brief, so reps know where a customer stands before they call.
- **Full audit log** — who did what, when.
- **System health** monitoring.
- **Live "customer journey" tracker** on every lead, showing exactly where they are.

---

## 4. Roles & access (built for a whole organisation)

The CRM supports a **12-role hierarchy**, each with tailored access:

- **Super Admin** and **Process Admin** — own and run the system.
- **Sales:** Sales Head, BDM, BDE.
- **Accounts:** Accounts Head, Accounts Support.
- **Legal:** Legal Head, Legal Support.
- **CRM / Customer care:** CRM Head, CRM Support.
- **Channel Partner** — external referral partners, fully isolated.

**Key principles:**
- **Department heads** can create, edit, approve and delete within their area.
- **Support staff** can view and assist, but not delete or approve.
- **Channel partners** only ever see their own referrals, bookings and commissions — complete data isolation.
- Access can be **fine-tuned per role** by the Admin, with a one-click reset to defaults.

---

## 5. Channel Partner programme

A dedicated capability that turns external agents into a sales channel:

- **Partner portal** showing only their own leads, bookings and commissions.
- **Referral links** with automatic attribution when a referred lead converts.
- **Commission lifecycle** with admin approval controls.
- **Branded website chat widget** per partner.
- **Automatic WhatsApp nudges** for overdue items.
- Strong **safeguards** — consent, do-not-contact, and anti-spam throttling.

---

## 6. Integrations (own-your-accounts model)

A **self-service Integrations Hub** lets the customer connect their own accounts — no dependency on the vendor for credentials:

- **Meta WhatsApp Cloud** — real WhatsApp messaging.
- **Google Workspace Email** — real email via a dedicated mailbox.
- **Mcube** — calling / telephony.

**How it's designed:**
- Admin/Process Admin connect accounts through a **simple guided form** inside the CRM.
- Secrets are **encrypted and never displayed again** after saving.
- Each connection has a **"Test connection"** button before going live.
- The framework is **extensible** — more services (payments, SMS, e-sign) can be added later.
- Until connected, the CRM runs safely in **demo mode**.

> Current status: The Integrations Hub is built and tested. Live operation begins once the company enters its own credentials and completes provider validation. Payments (e.g. Razorpay), SMS and e-signature are prepared but not yet live.

---

## 7. Design & user experience

- **Premium, modern interface** — designed to feel like a high-end SaaS product, not a generic admin panel.
- **Warm, calm, editorial look** — clean layouts, generous spacing, clear numbers, restrained accent colour.
- **Fast navigation** — a keyboard command palette (Ctrl/Cmd + K) to search and jump anywhere instantly.
- **Guided onboarding** — a first-time setup wizard walks a new company through projects, plots and users.
- **Bespoke screens** — dashboards, pipeline, inventory maps and messaging are purpose-built, not repetitive templates.

---

## 8. Technology & quality (kept simple)

- Built on a **proven, secure web technology stack** (Laravel + MySQL).
- **Role-based security** ensures people only access what they should.
- **Automatic background jobs** handle reminders, follow-ups and scheduled messages.
- **Extensively tested** — the full feature set has passed automated end-to-end testing across many rounds.
- **Performance-ready** — lead search stays under 2 seconds even at 100,000+ leads.
- **Single-company today**, with a clear path to support multiple communities/farms in future.

---

## 9. Business rules baked in

The CRM enforces the company's operating standards automatically:

- **Lead temperature:** Hot = 70+, Warm = 40–69, Cold = below 40.
- **Discount approvals** required above 5% and above 10%.
- **Allotment** triggered at 10% collections.
- **Site visit reports** targeted within 2 hours.
- **Sales handover** first contact within 24 hours.
- **Performance targets:** lead search under 2 seconds; automation runs under 2 minutes.

These rules mean the process is consistent no matter who is using the system.

---

## 10. Current status & what's next

**Delivered and tested:**
- Full lead-to-booking-to-collection lifecycle.
- 12-role access model and partner portal.
- Built-in WhatsApp and email communication.
- Visual automation builder and live journey tracker.
- Premium redesigned interface.
- Self-service Integrations Hub.

**Next steps to go fully live:**
- Company connects its own WhatsApp, email and calling accounts.
- Validate live sending/receiving with real credentials.
- Optionally activate payments (Razorpay), SMS and e-signature providers.

**Growth opportunities:**
- Multi-community / multi-project expansion.
- Additional integrations (payments, SMS, e-sign).
- Advanced analytics and reporting for leadership.

---

## 11. The one-paragraph pitch

*"This is a complete, ready-to-sell Real Estate CRM that runs the entire sales journey — from the first enquiry to booking, payment and handover — in one beautifully designed system. It keeps every lead accountable, automates follow-up over WhatsApp and email, gives management a live view of the business, and lets each customer plug in their own messaging, email and calling accounts. It's built for the whole organisation, protects data across roles, and is designed to look and feel like a premium product from day one."*

---

*Prepared for stakeholder discussion. Figures and rules reflect the system as configured; live messaging/calling features activate once the company connects its own accounts.*
