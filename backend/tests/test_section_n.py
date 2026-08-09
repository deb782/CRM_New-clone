"""Section N — Post-Sales documents & verification tests."""
import os
import time
import uuid
import pytest
import requests

BASE = "http://127.0.0.1:8000/api/v1"


def _login(email, password):
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": password}, timeout=10)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_headers():
    return {"Authorization": f"Bearer {_login('admin@crm.local', 'Admin@12345')}", "Accept": "application/json"}


@pytest.fixture(scope="module")
def cs_headers():
    return {"Authorization": f"Bearer {_login('cs@crm.local', 'Demo@12345')}", "Accept": "application/json"}


@pytest.fixture(scope="module")
def rahul_headers():
    return {"Authorization": f"Bearer {_login('rahul@crm.local', 'Demo@12345')}", "Accept": "application/json"}


def _make_lead(headers):
    """Admin has leads.create."""
    suffix = uuid.uuid4().hex[:8]
    # Unique 10-digit phone starting with 9 based on random uuid
    phone = "9" + str(int(uuid.uuid4().int) % 1_000_000_000).zfill(9)
    payload = {
        "name": f"TEST_N_{suffix}",
        "phone": phone,
        "email": f"test_n_{suffix}@example.com",
        "source": "walk-in",
    }
    r = requests.post(f"{BASE}/leads", json=payload, headers=headers, timeout=10)
    assert r.status_code in (200, 201), r.text
    body = r.json()
    return body.get("lead") or body


def _confirmed_booking(admin_headers):
    lead = _make_lead(admin_headers)
    lid = lead["id"]
    # mark won -> booking
    r = requests.post(f"{BASE}/leads/{lid}/won",
                      json={"deal_value": 5000000, "token_amount": 50000},
                      headers=admin_headers, timeout=10)
    assert r.status_code in (200, 201), r.text
    booking = r.json().get("booking") or r.json()
    bid = booking["id"]
    assert booking["status"] in ("pending", "draft", "created", "verified", "confirmed", "form_sent", "form_pending")
    # verify
    r = requests.post(f"{BASE}/bookings/{bid}/verify", headers=admin_headers, timeout=10)
    assert r.status_code == 200, r.text
    assert (r.json().get("booking") or r.json()).get("status") == "verified"
    # pay token
    r = requests.post(f"{BASE}/bookings/{bid}/pay-token", headers=admin_headers, timeout=10)
    assert r.status_code == 200, r.text
    b = r.json().get("booking") or r.json()
    return lid, bid, b


class TestSectionN:

    def test_login(self, admin_headers):
        assert admin_headers["Authorization"].startswith("Bearer ")

    def test_won_verify_paytoken_confirms_booking(self, admin_headers):
        lid, bid, b = _confirmed_booking(admin_headers)
        assert b["status"] == "confirmed", b
        assert b["token_status"] == "paid"

    def test_pay_token_creates_receipt_and_welcome_and_checklist(self, admin_headers):
        lid, bid, b = _confirmed_booking(admin_headers)
        r = requests.get(f"{BASE}/bookings/{bid}/post-sales", headers=admin_headers, timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["booking"]["status"] == "confirmed"
        assert len(data["documents"]) == 7, data["documents"]
        assert len(data["letters"]) >= 1
        wel = [l for l in data["letters"] if l["type"] == "welcome"]
        assert wel, data["letters"]
        assert wel[0]["serial_no"].startswith("WEL-")

    def test_welcome_letter_idempotent(self, admin_headers):
        lid, bid, _ = _confirmed_booking(admin_headers)
        r1 = requests.post(f"{BASE}/bookings/{bid}/welcome-letter", headers=admin_headers, timeout=10)
        r2 = requests.post(f"{BASE}/bookings/{bid}/welcome-letter", headers=admin_headers, timeout=10)
        assert r1.status_code == 200 and r2.status_code == 200
        assert r1.json()["letter"]["id"] == r2.json()["letter"]["id"]

    def test_record_milestone_payment_creates_serial_receipt(self, admin_headers):
        _, bid, _ = _confirmed_booking(admin_headers)
        payload = {"type": "milestone", "amount": 100000, "method": "neft", "reference": "TXN_TEST_1"}
        r = requests.post(f"{BASE}/bookings/{bid}/payments", json=payload, headers=admin_headers, timeout=10)
        assert r.status_code == 201, r.text
        p = r.json()["payment"]
        assert p["status"] == "received"
        assert p["type"] == "milestone"
        assert int(p["amount"]) == 100000
        assert p["method"] == "neft"
        assert p["reference"] == "TXN_TEST_1"
        assert p["receipt_no"].startswith("RCPT-")

    def test_verify_payment(self, admin_headers):
        _, bid, _ = _confirmed_booking(admin_headers)
        r = requests.post(f"{BASE}/bookings/{bid}/payments",
                          json={"type": "milestone", "amount": 20000, "method": "upi"},
                          headers=admin_headers, timeout=10)
        pid = r.json()["payment"]["id"]
        r = requests.post(f"{BASE}/payments/{pid}/verify", headers=admin_headers, timeout=10)
        assert r.status_code == 200, r.text
        p = r.json()["payment"]
        assert p["status"] == "verified"
        assert p["verified_at"] is not None

    def test_reconcile_matched_and_discrepancy(self, admin_headers):
        _, bid, _ = _confirmed_booking(admin_headers)
        # matched
        r = requests.post(f"{BASE}/bookings/{bid}/payments",
                          json={"type": "milestone", "amount": 30000, "method": "neft"},
                          headers=admin_headers, timeout=10)
        pid = r.json()["payment"]["id"]
        r = requests.post(f"{BASE}/payments/{pid}/reconcile",
                          json={"result": "matched"}, headers=admin_headers, timeout=10)
        assert r.status_code == 200
        assert r.json()["payment"]["status"] == "reconciled"
        # discrepancy
        r = requests.post(f"{BASE}/bookings/{bid}/payments",
                          json={"type": "milestone", "amount": 40000, "method": "cheque"},
                          headers=admin_headers, timeout=10)
        pid2 = r.json()["payment"]["id"]
        r = requests.post(f"{BASE}/payments/{pid2}/reconcile",
                          json={"result": "discrepancy", "note": "amount mismatch"},
                          headers=admin_headers, timeout=10)
        assert r.status_code == 200
        p = r.json()["payment"]
        assert p["status"] == "discrepancy"
        assert p["reconcile_note"] == "amount mismatch"

    def test_reconciliation_dashboard(self, admin_headers):
        r = requests.get(f"{BASE}/payments/reconciliation", headers=admin_headers, timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "summary" in data and "collected" in data and "discrepancies" in data
        for k in ["received", "verified", "reconciled", "discrepancy", "failed"]:
            assert k in data["summary"]
            assert "count" in data["summary"][k] and "total" in data["summary"][k]
        assert isinstance(data["collected"], int)

    def test_documents_update_flow(self, admin_headers):
        _, bid, _ = _confirmed_booking(admin_headers)
        r = requests.get(f"{BASE}/bookings/{bid}/post-sales", headers=admin_headers, timeout=10)
        docs = r.json()["documents"]
        assert docs
        item = docs[0]
        # received
        r = requests.put(f"{BASE}/documents/{item['id']}",
                         json={"status": "received"}, headers=admin_headers, timeout=10)
        assert r.status_code == 200, r.text
        d = r.json()["document"]
        assert d["status"] == "received"
        assert d["received_at"] is not None
        # verified
        r = requests.put(f"{BASE}/documents/{item['id']}",
                         json={"status": "verified"}, headers=admin_headers, timeout=10)
        assert r.status_code == 200
        d = r.json()["document"]
        assert d["status"] == "verified"
        assert d["verified_at"] is not None

    def test_rahul_forbidden_from_postsales(self, admin_headers, rahul_headers):
        _, bid, _ = _confirmed_booking(admin_headers)
        r = requests.post(f"{BASE}/bookings/{bid}/payments",
                          json={"type": "milestone", "amount": 1000, "method": "upi"},
                          headers=rahul_headers, timeout=10)
        assert r.status_code == 403, r.status_code
        # create with admin to test verify/reconcile 403
        r = requests.post(f"{BASE}/bookings/{bid}/payments",
                          json={"type": "milestone", "amount": 2000, "method": "upi"},
                          headers=admin_headers, timeout=10)
        pid = r.json()["payment"]["id"]
        r = requests.post(f"{BASE}/payments/{pid}/verify", headers=rahul_headers, timeout=10)
        assert r.status_code == 403
        r = requests.post(f"{BASE}/payments/{pid}/reconcile",
                          json={"result": "matched"}, headers=rahul_headers, timeout=10)
        assert r.status_code == 403

    def test_cs_can_record_but_not_create_leads(self, admin_headers, cs_headers):
        _, bid, _ = _confirmed_booking(admin_headers)
        r = requests.post(f"{BASE}/bookings/{bid}/payments",
                          json={"type": "milestone", "amount": 5000, "method": "upi"},
                          headers=cs_headers, timeout=10)
        assert r.status_code == 201, r.text
        # CS lacks leads.create
        r = requests.post(f"{BASE}/leads",
                          json={"name": "TEST_cs", "phone": "9999999999", "source": "walk-in"},
                          headers=cs_headers, timeout=10)
        assert r.status_code == 403

    def test_regression_lead_locked_after_won(self, admin_headers):
        lid, bid, _ = _confirmed_booking(admin_headers)
        r = requests.get(f"{BASE}/leads/{lid}", headers=admin_headers, timeout=10)
        assert r.status_code == 200
        lead = r.json().get("lead") or r.json()
        # Deal-won should mark the lead as locked and status=won
        assert lead.get("locked") in (True, 1), lead
        assert lead.get("status") == "won", lead
