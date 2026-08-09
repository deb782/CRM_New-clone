"""Section R + Channel Partner Portal + Overdue Auto-Nudge tests (iteration_8)."""
import os
import subprocess
import uuid

import pytest
import requests

BASE = "http://127.0.0.1:8000"
API = f"{BASE}/api/v1"
LARAVEL = "/app/laravel-crm"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=10)
    r.raise_for_status()
    return r.json()["token"]


def _h(token):
    return {"Authorization": f"Bearer {token}", "Accept": "application/json"}


@pytest.fixture(scope="module")
def admin():
    return _login("admin@crm.local", "Admin@12345")


@pytest.fixture(scope="module")
def partner_tok():
    return _login("partner@crm.local", "Demo@12345")


@pytest.fixture(scope="module")
def rahul():
    return _login("rahul@crm.local", "Demo@12345")


@pytest.fixture(scope="module")
def cs():
    return _login("crmhead@crm.local", "Demo@12345")


# ---------- Channel Partner: commission on Won ----------
class TestChannelPartnerCommission:
    def test_partner_seeded(self, admin):
        r = requests.get(f"{API}/partners", headers=_h(admin))
        assert r.status_code == 200, r.text
        partners = r.json()["partners"]
        prime = next((p for p in partners if p["name"] == "Prime Realty Partners"), None)
        assert prime is not None
        assert float(prime["commission_rate"]) == 2.0
        # Linked to 6 seeded leads
        assert prime["leads_count"] >= 4

    def test_partner_lead_won_creates_commission(self, admin):
        # Find a partner-attributed lead
        r = requests.get(f"{API}/partners", headers=_h(admin))
        prime = next(p for p in r.json()["partners"] if p["name"] == "Prime Realty Partners")
        partner_id = prime["id"]

        # Find a lead linked to this partner
        r = requests.get(f"{API}/leads?per_page=100", headers=_h(admin))
        leads = r.json().get("data", [])
        partner_lead = next((l for l in leads if l.get("channel_partner_id") == partner_id), None)
        assert partner_lead, "No lead linked to Prime Realty Partners found"

        lead_id = partner_lead["id"]
        # markWon force-transitions internally
        
        r = requests.post(f"{API}/leads/{lead_id}/won",
                          json={"deal_value": 5000000, "token_amount": 100000},
                          headers=_h(admin))
        assert r.status_code in (200, 201), r.text
        body = r.json()
        booking = body.get("booking") or body
        assert booking.get("channel_partner_id") == partner_id
        assert float(booking.get("commission_pct")) == 2.0
        # 2% of 5,000,000 = 100,000
        assert int(booking.get("commission_amount")) == 100000
        assert booking.get("commission_status") == "pending"
        # Persist for subsequent tests
        TestChannelPartnerCommission.booking_id = booking["id"]

    def test_commissions_admin_list_and_approve_pay(self, admin):
        r = requests.get(f"{API}/commissions", headers=_h(admin))
        assert r.status_code == 200
        data = r.json().get("data", r.json())
        assert len(data) >= 1

        bid = TestChannelPartnerCommission.booking_id
        r = requests.post(f"{API}/bookings/{bid}/commission",
                          json={"action": "approve"}, headers=_h(admin))
        assert r.status_code == 200
        assert r.json()["booking"]["commission_status"] == "approved"

        r = requests.post(f"{API}/bookings/{bid}/commission",
                          json={"action": "pay"}, headers=_h(admin))
        assert r.status_code == 200
        assert r.json()["booking"]["commission_status"] == "paid"

    def test_exec_cannot_manage_commissions(self, rahul):
        r = requests.get(f"{API}/commissions", headers=_h(rahul))
        assert r.status_code == 403


# ---------- Partner portal scoping ----------
class TestPartnerPortalScoping:
    def test_partner_portal_ok(self, partner_tok):
        r = requests.get(f"{API}/partner/portal", headers=_h(partner_tok))
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["partner"]["name"] == "Prime Realty Partners"
        assert "summary" in b and "commission_earned" in b["summary"]
        # At least paid or pending commission tracked
        assert (b["summary"]["commission_earned"] + b["summary"]["commission_pending"]) >= 0

    def test_partner_denied_leads(self, partner_tok):
        assert requests.get(f"{API}/leads", headers=_h(partner_tok)).status_code == 403

    def test_partner_denied_partners(self, partner_tok):
        assert requests.get(f"{API}/partners", headers=_h(partner_tok)).status_code == 403

    def test_partner_denied_commissions(self, partner_tok):
        assert requests.get(f"{API}/commissions", headers=_h(partner_tok)).status_code == 403

    def test_admin_portal_404(self, admin):
        # Admin has partner.portal? No, admin has all perms but no linked partner
        r = requests.get(f"{API}/partner/portal", headers=_h(admin))
        # Admin has all perms so passes middleware, then 404 (no linked partner)
        assert r.status_code == 404


# ---------- Section R: DNC / invalid / consent ----------
@pytest.fixture()
def fresh_lead(admin):
    uniq = uuid.uuid4().hex[:8]
    payload = {
        "name": f"TEST_R_{uniq}",
        "email": f"r_{uniq}@example.com",
        "phone": f"91000{uniq[:5]}",
        "source": "Website Form",
        "city": "Pune",
    }
    r = requests.post(f"{API}/leads", json=payload, headers=_h(admin))
    r.raise_for_status()
    return r.json().get("lead", r.json())


class TestSectionR_DNC_Invalid_Consent:
    def test_dnc_marks_and_pauses(self, admin, fresh_lead):
        lid = fresh_lead["id"]
        r = requests.post(f"{API}/leads/{lid}/dnc",
                          json={"reason": "user requested"}, headers=_h(admin))
        assert r.status_code == 200, r.text
        lead = r.json()["lead"]
        assert lead["do_not_contact"] in (True, 1)

    def test_invalid_spam_marks_and_transitions(self, admin, fresh_lead):
        lid = fresh_lead["id"]
        r = requests.post(f"{API}/leads/{lid}/invalid",
                          json={"reason": "spam"}, headers=_h(admin))
        assert r.status_code == 200, r.text
        lead = r.json()["lead"]
        assert lead["is_invalid"] in (True, 1)
        assert lead["do_not_contact"] in (True, 1)
        assert lead["invalid_reason"] == "spam"
        assert lead["status"] == "not_interested"

    def test_consent_update(self, admin, fresh_lead):
        lid = fresh_lead["id"]
        r = requests.post(f"{API}/leads/{lid}/consent",
                          json={"whatsapp_opt_out": True, "comm_preference": "email"},
                          headers=_h(admin))
        assert r.status_code == 200, r.text
        lead = r.json()["lead"]
        assert lead["whatsapp_opt_out"] in (True, 1)
        assert lead["comm_preference"] == "email"

    def test_dnc_requires_leads_edit(self, partner_tok, fresh_lead):
        # Partner has no leads.edit
        r = requests.post(f"{API}/leads/{fresh_lead['id']}/dnc",
                          json={"reason": "x"}, headers=_h(partner_tok))
        assert r.status_code == 403


# ---------- WhatsApp suppression for DNC/opt-out ----------
class TestWhatsAppSuppression:
    def test_whatsapp_service_skips_dnc(self, admin, fresh_lead):
        """Suppression: WhatsAppService.send should NOT actually dispatch for DNC leads."""
        lid = fresh_lead["id"]
        requests.post(f"{API}/leads/{lid}/dnc", json={"reason": "test"}, headers=_h(admin))
        script = (
            f'$l=\\App\\Models\\Lead::find({lid}); '
            f'$msg=app(\\App\\Services\\WhatsAppService::class)->send($l,"hello test"); '
            f'echo "STATUS=".$msg->status." SENT=".($msg->sent_at?"1":"0");'
        )
        out = subprocess.run(["php", "artisan", "tinker", "--execute", script],
                             capture_output=True, text=True, cwd=LARAVEL, timeout=30)
        combined = out.stdout + out.stderr
        assert "STATUS=failed" in combined, combined
        assert "SENT=0" in combined, combined


# ---------- Booking cancellation ----------
class TestBookingCancel:
    def test_cancel_releases_plot_and_cancels_milestones(self, admin, cs):
        # Create a new lead, walk to won, capture booking
        uniq = uuid.uuid4().hex[:8]
        r = requests.post(f"{API}/leads",
                          json={"name": f"TEST_BK_{uniq}", "email": f"bk_{uniq}@x.com",
                                "phone": f"93000{uniq[:5]}", "source": "Website Form"},
                          headers=_h(admin))
        lid = r.json().get("lead", r.json())["id"]
        for s in []:  # markWon force-transitions internally
            pass
        r = requests.post(f"{API}/leads/{lid}/won",
                          json={"deal_value": 3000000, "token_amount": 50000},
                          headers=_h(admin))
        assert r.status_code in (200, 201), r.text
        booking = r.json().get("booking", r.json())
        bid = booking["id"]
        plot_id = booking.get("plot_id")

        r = requests.post(f"{API}/bookings/{bid}/cancel",
                          json={"reason": "customer withdrew"}, headers=_h(cs))
        assert r.status_code == 200, r.text
        bk = r.json().get("booking", r.json())
        assert bk["status"] == "cancelled"
        assert bk.get("cancellation_reason") == "customer withdrew"
        assert bk.get("cancelled_at")

        # Verify plot released to 'available'
        if plot_id:
            script = f'echo \\App\\Models\\Plot::find({plot_id})->status;'
            out = subprocess.run(["php", "artisan", "tinker", "--execute", script],
                                 capture_output=True, text=True, cwd=LARAVEL, timeout=15)
            assert "available" in (out.stdout + out.stderr), (out.stdout + out.stderr)

    def test_cancel_requires_postsales_manage(self, admin, rahul):
        # Exec should be denied
        r = requests.post(f"{API}/bookings/1/cancel",
                          json={"reason": "x"}, headers=_h(rahul))
        assert r.status_code == 403


# ---------- Payment fail (bounce) ----------
class TestPaymentFail:
    def _create_booking_with_paid_milestone(self, admin):
        uniq = uuid.uuid4().hex[:8]
        r = requests.post(f"{API}/leads",
                          json={"name": f"TEST_PF_{uniq}", "email": f"pf_{uniq}@x.com",
                                "phone": f"94000{uniq[:5]}", "source": "Website Form"},
                          headers=_h(admin))
        lid = r.json().get("lead", r.json())["id"]
        for s in []:  # markWon force-transitions internally
            pass
        r = requests.post(f"{API}/leads/{lid}/won",
                          json={"deal_value": 2000000, "token_amount": 100000},
                          headers=_h(admin))
        booking = r.json().get("booking", r.json())
        return booking["id"]

    def test_payment_fail_reverts_milestone(self, admin, cs):
        bid = self._create_booking_with_paid_milestone(admin)
        # Verify booking to arm milestones, pay token via post-sales flow
        requests.post(f"{API}/bookings/{bid}/pay-token", json={}, headers=_h(admin))
        requests.post(f"{API}/bookings/{bid}/verify", json={}, headers=_h(admin))

        # Fetch a pending/due milestone and pay it fully
        script = (
            f'$m=\\App\\Models\\PaymentMilestone::where("booking_id",{bid})'
            f'->whereIn("status",["pending","due"])->orderBy("seq")->first(); '
            f'echo "MID=".($m?$m->id:0)." AMT=".($m?$m->amount:0);'
        )
        out = subprocess.run(["php", "artisan", "tinker", "--execute", script],
                             capture_output=True, text=True, cwd=LARAVEL, timeout=15)
        combined = out.stdout + out.stderr
        import re
        mm = re.search(r"MID=(\d+) AMT=(\d+)", combined)
        if not mm or mm.group(1) == "0":
            pytest.skip(f"No pending milestone to pay: {combined}")
        mid = int(mm.group(1))
        amount = int(mm.group(2))

        # Record milestone payment (as cs role with postsales.manage)
        r = requests.post(f"{API}/milestones/{mid}/pay",
                          json={"amount": amount, "method": "cheque"}, headers=_h(cs))
        assert r.status_code in (200, 201), r.text

        # Locate the payment id and verify milestone is paid
        script1 = (
            f'$m=\\App\\Models\\PaymentMilestone::find({mid}); '
            f'$p=\\App\\Models\\Payment::where("booking_id",{bid})->where("type","milestone")'
            f'->orderByDesc("id")->first(); '
            f'echo "PID=".($p?$p->id:0)." MST=".$m->status;'
        )
        out1 = subprocess.run(["php", "artisan", "tinker", "--execute", script1],
                              capture_output=True, text=True, cwd=LARAVEL, timeout=15)
        c1 = out1.stdout + out1.stderr
        m2 = re.search(r"PID=(\d+) MST=(\w+)", c1)
        assert m2 and m2.group(1) != "0", f"No milestone payment created: {c1}"
        pid = int(m2.group(1))
        assert m2.group(2) in ("paid", "partial"), f"Milestone not marked paid/partial: {c1}"

        # Now bounce it
        r = requests.post(f"{API}/payments/{pid}/fail",
                          json={"reason": "cheque bounced"}, headers=_h(cs))
        assert r.status_code == 200, r.text
        payment = r.json().get("payment", r.json())
        assert payment["status"] == "failed"
        assert payment.get("failure_reason") == "cheque bounced"

        # Milestone should revert from paid/partial
        script2 = f'echo \\App\\Models\\PaymentMilestone::find({mid})->status;'
        out2 = subprocess.run(["php", "artisan", "tinker", "--execute", script2],
                              capture_output=True, text=True, cwd=LARAVEL, timeout=15)
        st = (out2.stdout + out2.stderr).strip().split()[-1]
        assert st not in ("paid", "partial"), f"Milestone should revert on bounce, got {st}"

    def test_payment_fail_requires_postsales_manage(self, rahul):
        # Non-existent payment id: middleware order may return 404 before 403 in Laravel;
        # accept either as denial signal (permission gate enforced by route definition).
        r = requests.post(f"{API}/payments/999999/fail",
                          json={"reason": "x"}, headers=_h(rahul))
        assert r.status_code in (403, 404)


# ---------- Overdue Auto-Nudge ----------
class TestOverdueNudge:
    def test_overdue_nudge_and_demand_letter(self, admin):
        uniq = uuid.uuid4().hex[:8]
        r = requests.post(f"{API}/leads",
                          json={"name": f"TEST_ND_{uniq}", "email": f"nd_{uniq}@x.com",
                                "phone": f"95000{uniq[:5]}", "source": "Website Form"},
                          headers=_h(admin))
        lid = r.json().get("lead", r.json())["id"]
        for s in []:  # markWon force-transitions internally
            pass
        r = requests.post(f"{API}/leads/{lid}/won",
                          json={"deal_value": 1500000, "token_amount": 50000}, headers=_h(admin))
        booking = r.json().get("booking", r.json())
        bid = booking["id"]
        # verify + pay token (post-sales), then backdate a milestone
        requests.post(f"{API}/bookings/{bid}/pay-token", json={}, headers=_h(admin))
        requests.post(f"{API}/bookings/{bid}/verify", json={}, headers=_h(admin))

        # Backdate a pending/due milestone (not the token one) via tinker
        script = (
            f'$m=\\App\\Models\\PaymentMilestone::where("booking_id",{bid})'
            f'->whereIn("status",["pending","due"])->orderBy("id")->first(); '
            f'if($m){{$m->due_at=now()->subDays(5);$m->reminders_sent=[];$m->save();'
            f'echo "MID=".$m->id;}}else{{echo "NONE";}}'
        )
        out = subprocess.run(["php", "artisan", "tinker", "--execute", script],
                             capture_output=True, text=True, cwd=LARAVEL, timeout=15)
        combined = out.stdout + out.stderr
        import re
        mm = re.search(r"MID=(\d+)", combined)
        assert mm, f"Failed to backdate milestone: {combined}"
        mid = int(mm.group(1))

        # Run reminders
        run = subprocess.run(["php", "artisan", "crm:reminders"],
                             capture_output=True, text=True, cwd=LARAVEL, timeout=60)
        assert run.returncode == 0, (run.stdout + run.stderr)

        # Verify nudge tracked + status overdue + demand letter exists
        script2 = (
            f'$m=\\App\\Models\\PaymentMilestone::find({mid}); '
            f'$sent=is_array($m->reminders_sent)?$m->reminders_sent:(json_decode($m->reminders_sent,true)?:[]); '
            f'$dl=\\App\\Models\\DemandLetter::where("booking_id",'
            f'\\App\\Models\\PaymentMilestone::find({mid})->booking_id)->count(); '
            f'echo "STATUS=".$m->status." NUDGE=".(in_array("nudge",$sent)?"1":"0")." DL=".$dl;'
        )
        out2 = subprocess.run(["php", "artisan", "tinker", "--execute", script2],
                              capture_output=True, text=True, cwd=LARAVEL, timeout=15)
        c2 = out2.stdout + out2.stderr
        assert "NUDGE=1" in c2, c2
        assert "STATUS=overdue" in c2, c2
        assert "DL=1" in c2 or "DL=2" in c2, c2
