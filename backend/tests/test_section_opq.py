"""Section O/P/Q tests: allotment + AFS + milestones + collections + demand letters."""
import os
import uuid
import subprocess
import pytest
import requests

BASE = "http://127.0.0.1:8000"
API = f"{BASE}/api/v1"

DEAL_VALUE = 10_000_000
TOKEN_AMOUNT = 1_000_000  # 10% -> triggers allotment


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=10)
    r.raise_for_status()
    return r.json()["token"]


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Accept": "application/json"}


@pytest.fixture(scope="module")
def admin():
    return _login("admin@crm.local", "Admin@12345")


@pytest.fixture(scope="module")
def cs_tok():
    return _login("crmhead@crm.local", "Demo@12345")


@pytest.fixture(scope="module")
def exec_tok():
    return _login("rahul@crm.local", "Demo@12345")


def _new_confirmed_booking(admin_token, deal=DEAL_VALUE, token=TOKEN_AMOUNT):
    """Create fresh lead -> won -> verify -> pay-token; returns booking dict."""
    u = uuid.uuid4().hex[:8]
    payload = {
        "name": f"TEST_OPQ_{u}",
        "email": f"opq_{u}@example.com",
        "phone": f"91{u}"[:12],
        "source": "Website Form",
        "city": "Mumbai",
    }
    r = requests.post(f"{API}/leads", json=payload, headers=_h(admin_token))
    r.raise_for_status()
    lead = r.json().get("lead", r.json())
    lid = lead["id"]

    r = requests.post(f"{API}/leads/{lid}/won", json={"deal_value": deal, "token_amount": token}, headers=_h(admin_token))
    assert r.status_code in (200, 201), r.text
    booking = r.json().get("booking") or r.json()
    bid = booking["id"]

    r = requests.post(f"{API}/bookings/{bid}/verify", headers=_h(admin_token))
    assert r.status_code in (200, 201), r.text

    r = requests.post(f"{API}/bookings/{bid}/pay-token", headers=_h(admin_token))
    assert r.status_code in (200, 201), r.text
    return {"lead_id": lid, "booking_id": bid}


@pytest.fixture(scope="module")
def booking(admin):
    return _new_confirmed_booking(admin)


# ---------------- Section P: milestones + collections ----------------

class TestMilestones:
    def test_schedule_generated_after_token(self, admin, booking):
        r = requests.get(f"{API}/bookings/{booking['booking_id']}/milestones", headers=_h(admin))
        assert r.status_code == 200, r.text
        d = r.json()
        assert "milestones" in d and "collected" in d and "deal_value" in d
        ms = d["milestones"]
        assert len(ms) == 5, f"expected 5 default milestones, got {len(ms)}"
        pcts = [float(m["pct"]) for m in ms]
        assert pcts == [10, 15, 25, 25, 25]
        assert d["deal_value"] == DEAL_VALUE
        # token (10%) auto-fills the first milestone
        assert ms[0]["status"] == "paid", f"first ms should be paid, got {ms[0]['status']}"
        assert d["collected"] >= TOKEN_AMOUNT

    def test_pay_milestone_neft(self, cs_tok, admin, booking):
        r = requests.get(f"{API}/bookings/{booking['booking_id']}/milestones", headers=_h(admin))
        ms = r.json()["milestones"]
        # Pay the 2nd milestone (On Agreement, 15%)
        target = ms[1]
        amt = int(target["amount"])
        r = requests.post(f"{API}/milestones/{target['id']}/pay",
                          json={"amount": amt, "method": "neft", "reference": f"NEFT-{uuid.uuid4().hex[:6]}"},
                          headers=_h(cs_tok))
        assert r.status_code in (200, 201), r.text
        r = requests.get(f"{API}/bookings/{booking['booking_id']}/milestones", headers=_h(admin))
        ms2 = r.json()["milestones"]
        assert ms2[1]["status"] == "paid"

    def test_pay_partial(self, cs_tok, admin):
        b = _new_confirmed_booking(admin)
        r = requests.get(f"{API}/bookings/{b['booking_id']}/milestones", headers=_h(admin))
        ms = r.json()["milestones"]
        target = ms[1]
        # partial
        partial = int(int(target["amount"]) / 2)
        r = requests.post(f"{API}/milestones/{target['id']}/pay",
                          json={"amount": partial, "method": "neft", "reference": "PART-1"},
                          headers=_h(cs_tok))
        assert r.status_code in (200, 201), r.text
        r = requests.get(f"{API}/bookings/{b['booking_id']}/milestones", headers=_h(admin))
        ms2 = r.json()["milestones"]
        assert ms2[1]["status"] == "partial", ms2[1]

    def test_rbac_pay_requires_postsales_manage(self, exec_tok, admin, booking):
        r = requests.get(f"{API}/bookings/{booking['booking_id']}/milestones", headers=_h(admin))
        ms = r.json()["milestones"]
        target = ms[2]
        r = requests.post(f"{API}/milestones/{target['id']}/pay",
                          json={"amount": 100000, "method": "neft", "reference": "X"},
                          headers=_h(exec_tok))
        assert r.status_code == 403, r.status_code


class TestCollections:
    def test_dashboard_shape(self, admin, booking):
        r = requests.get(f"{API}/collections", headers=_h(admin))
        assert r.status_code == 200
        d = r.json()
        for k in ("collected", "scheduled", "outstanding", "aging", "overdue_milestones"):
            assert k in d, f"missing key {k}"
        for b in ("current", "0_30", "31_60", "61_90", "90_plus"):
            assert b in d["aging"], f"missing bucket {b}"

    def test_exec_can_read_collections(self, exec_tok):
        r = requests.get(f"{API}/collections", headers=_h(exec_tok))
        assert r.status_code == 200

    def test_overdue_aging_bucket(self, admin, cs_tok):
        b = _new_confirmed_booking(admin)
        r = requests.get(f"{API}/bookings/{b['booking_id']}/milestones", headers=_h(admin))
        ms = r.json()["milestones"]
        target = ms[1]
        # force 45 days overdue via tinker
        cmd = f"cd /app/laravel-crm && php artisan tinker --execute=\"\\App\\Models\\PaymentMilestone::where('id',{target['id']})->update(['due_at'=>now()->subDays(45)]);\""
        subprocess.run(cmd, shell=True, check=True, capture_output=True)
        # trigger sync via GET
        requests.get(f"{API}/bookings/{b['booking_id']}/milestones", headers=_h(admin))
        r = requests.get(f"{API}/collections", headers=_h(admin))
        assert r.status_code == 200
        d = r.json()
        assert d["aging"]["31_60"] > 0, f"expected 31_60 bucket >0, got {d['aging']}"
        ids = [m["id"] for m in d["overdue_milestones"]]
        assert target["id"] in ids


# ---------------- Section O: allotment + AFS ----------------

class TestAllotmentAndAFS:
    def test_allotment_auto_at_10pct(self, admin, booking):
        r = requests.get(f"{API}/bookings/{booking['booking_id']}/post-sales", headers=_h(admin))
        assert r.status_code == 200
        letters = r.json().get("letters", [])
        alt = [l for l in letters if l.get("type") == "allotment"]
        assert len(alt) == 1, f"expected 1 allotment letter, got {len(alt)}"
        assert alt[0]["serial_no"].startswith("ALT-")

    def test_allotment_idempotent(self, admin, booking):
        # Trigger sync again (any milestone GET runs syncStatuses -> checkAllotment)
        requests.get(f"{API}/bookings/{booking['booking_id']}/milestones", headers=_h(admin))
        r = requests.get(f"{API}/bookings/{booking['booking_id']}/post-sales", headers=_h(admin))
        alt = [l for l in r.json().get("letters", []) if l.get("type") == "allotment"]
        assert len(alt) == 1, "allotment must not duplicate"

    def test_afs_full_lifecycle(self, cs_tok, admin, booking):
        bid = booking["booking_id"]
        r = requests.post(f"{API}/bookings/{bid}/agreements", headers=_h(cs_tok))
        assert r.status_code in (200, 201), r.text
        ag = r.json()["agreement"]
        assert ag["type"] == "afs"
        assert ag["status"] == "draft"
        assert ag["serial_no"].startswith("AFS-")
        aid = ag["id"]

        # idempotent
        r2 = requests.post(f"{API}/bookings/{bid}/agreements", headers=_h(cs_tok))
        assert r2.json()["agreement"]["id"] == aid, "AFS should be idempotent per booking"

        # send-for-sign
        r = requests.post(f"{API}/agreements/{aid}/send-for-sign", headers=_h(cs_tok))
        assert r.status_code == 200
        ag = r.json()["agreement"]
        assert ag["status"] == "sent_for_sign"
        assert ag.get("esign_ref"), "esign_ref should be set"
        assert ag.get("review_until"), "review_until should be set (+5d)"

        # sign
        r = requests.post(f"{API}/agreements/{aid}/sign", headers=_h(cs_tok))
        assert r.status_code == 200
        assert r.json()["agreement"]["status"] == "signed"

        # register
        reg_no = f"REG-{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{API}/agreements/{aid}/register", json={"registration_no": reg_no}, headers=_h(cs_tok))
        assert r.status_code == 200
        ag = r.json()["agreement"]
        assert ag["status"] == "registered"
        assert ag["registration_no"] == reg_no

        # list
        r = requests.get(f"{API}/bookings/{bid}/agreements", headers=_h(admin))
        assert r.status_code == 200
        assert any(a["id"] == aid for a in r.json()["agreements"])

    def test_afs_rbac(self, exec_tok, admin):
        b = _new_confirmed_booking(admin)
        r = requests.post(f"{API}/bookings/{b['booking_id']}/agreements", headers=_h(exec_tok))
        assert r.status_code == 403


# ---------------- Section Q: demand letters ----------------

class TestDemandLetters:
    def _overdue_ms(self, admin_tok, days=45):
        b = _new_confirmed_booking(admin_tok)
        r = requests.get(f"{API}/bookings/{b['booking_id']}/milestones", headers=_h(admin_tok))
        ms = r.json()["milestones"]
        target = ms[1]  # not yet paid
        cmd = f"cd /app/laravel-crm && php artisan tinker --execute=\"\\App\\Models\\PaymentMilestone::where('id',{target['id']})->update(['due_at'=>now()->subDays({days})]);\""
        subprocess.run(cmd, shell=True, check=True, capture_output=True)
        return b, target

    def test_generate_and_interest(self, admin, cs_tok):
        b, target = self._overdue_ms(admin, days=45)
        outstanding = int(target["amount"])
        r = requests.post(f"{API}/milestones/{target['id']}/demand-letter", headers=_h(cs_tok))
        assert r.status_code in (200, 201), r.text
        d = r.json()["demand_letter"]
        assert d["serial_no"].startswith("DMD-")
        expected_int = round(outstanding * 18 / 100 * 45 / 365)
        # Allow ±1 for rounding
        assert abs(int(d["late_interest"]) - expected_int) <= 2, (d["late_interest"], expected_int)
        assert int(d["total_due"]) == outstanding + int(d["late_interest"])

        # idempotent
        r2 = requests.post(f"{API}/milestones/{target['id']}/demand-letter", headers=_h(cs_tok))
        assert r2.status_code in (200, 201)
        # Same serial expected
        d2 = r2.json().get("demand_letter") or r2.json()
        assert d2["id"] == d["id"], "demand letter should be idempotent per milestone"

    def test_422_on_not_overdue(self, admin, cs_tok):
        b = _new_confirmed_booking(admin)
        r = requests.get(f"{API}/bookings/{b['booking_id']}/milestones", headers=_h(admin))
        ms = r.json()["milestones"]
        # ms[1] is not overdue (due in future)
        r = requests.post(f"{API}/milestones/{ms[1]['id']}/demand-letter", headers=_h(cs_tok))
        assert r.status_code == 422

    def test_deliver_and_escalate(self, admin, cs_tok):
        b, target = self._overdue_ms(admin, days=60)
        r = requests.post(f"{API}/milestones/{target['id']}/demand-letter", headers=_h(cs_tok))
        assert r.status_code in (200, 201)
        letter_id = r.json()["demand_letter"]["id"]

        # deliver
        r = requests.post(f"{API}/demand-letters/{letter_id}/deliver",
                          json={"via": "registered_post", "registered_post_ref": "RPS-123"},
                          headers=_h(cs_tok))
        assert r.status_code == 200
        d = r.json()["demand_letter"]
        assert d["delivered_via"] == "registered_post"
        assert d["registered_post_ref"] == "RPS-123"
        assert d["delivered_at"]

        # escalate
        r = requests.post(f"{API}/demand-letters/{letter_id}/escalate", headers=_h(cs_tok))
        assert r.status_code == 200
        assert r.json()["demand_letter"]["status"] == "escalated"

        # list with filter
        r = requests.get(f"{API}/demand-letters", params={"booking_id": b["booking_id"]}, headers=_h(admin))
        assert r.status_code == 200
        data = r.json()
        items = data.get("data", data if isinstance(data, list) else [])
        assert any(it["id"] == letter_id for it in items)

        r = requests.get(f"{API}/demand-letters", params={"status": "escalated"}, headers=_h(admin))
        assert r.status_code == 200

    def test_rbac_demand_mutations(self, admin, exec_tok):
        b, target = self._overdue_ms(admin, days=45)
        r = requests.post(f"{API}/milestones/{target['id']}/demand-letter", headers=_h(exec_tok))
        assert r.status_code == 403
