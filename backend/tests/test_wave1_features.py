"""
Wave 1 backend tests: Reports (+RBAC), Notifications (+ownership), Payment receipt PDF.
Runs against local Laravel API at http://localhost:8000.
"""
import os
import pytest
import requests

BASE = "http://localhost:8000/api/v1"

CREDS = {
    "admin": ("admin@crm.local", "Admin@12345"),
    "sales_head": ("priya@crm.local", "Demo@12345"),
    "accounts_head": ("accountshead@crm.local", "Demo@12345"),
    "legal_head": ("legalhead@crm.local", "Demo@12345"),
    "crm_head": ("crmhead@crm.local", "Demo@12345"),
    "bde": ("rahul@crm.local", "Demo@12345"),
    "bde2": ("aisha@crm.local", "Demo@12345"),
}


def _login(email, password):
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text[:200]}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def tokens():
    return {k: _login(*v) for k, v in CREDS.items()}


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Accept": "application/json"}


# ---------- Reports: shape ----------
class TestReportsShape:
    def test_sales_shape(self, tokens):
        r = requests.get(f"{BASE}/reports/sales", headers=_h(tokens["admin"]), timeout=30)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        for k in ["total_leads", "won", "conversion_rate", "funnel", "by_source", "by_temperature", "by_rep", "ageing"]:
            assert k in d, f"missing key {k} in sales report; keys={list(d.keys())}"

    def test_financial_shape(self, tokens):
        r = requests.get(f"{BASE}/reports/financial", headers=_h(tokens["admin"]), timeout=30)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        for k in ["collected", "deal_value", "token_collected", "outstanding",
                  "payments_by_status", "payments_by_type", "bookings_by_status"]:
            assert k in d, f"missing key {k}; keys={list(d.keys())}"

    def test_activity_shape(self, tokens):
        r = requests.get(f"{BASE}/reports/activity", headers=_h(tokens["admin"]), timeout=30)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        for k in ["site_visits", "tasks_open", "tasks_overdue", "by_rep"]:
            assert k in d, f"missing key {k}; keys={list(d.keys())}"

    def test_sales_csv_export(self, tokens):
        r = requests.get(f"{BASE}/reports/sales?format=csv", headers=_h(tokens["admin"]), timeout=30)
        assert r.status_code == 200, r.text[:200]
        ct = r.headers.get("Content-Type", "")
        assert "text/csv" in ct, f"expected text/csv, got {ct}"


# ---------- Reports RBAC ----------
class TestReportsRBAC:
    def test_sales_head_access(self, tokens):
        t = tokens["sales_head"]
        assert requests.get(f"{BASE}/reports/sales", headers=_h(t), timeout=30).status_code == 200
        assert requests.get(f"{BASE}/reports/activity", headers=_h(t), timeout=30).status_code == 200
        assert requests.get(f"{BASE}/reports/financial", headers=_h(t), timeout=30).status_code == 403

    def test_accounts_head_access(self, tokens):
        t = tokens["accounts_head"]
        assert requests.get(f"{BASE}/reports/financial", headers=_h(t), timeout=30).status_code == 200
        assert requests.get(f"{BASE}/reports/activity", headers=_h(t), timeout=30).status_code == 200
        assert requests.get(f"{BASE}/reports/sales", headers=_h(t), timeout=30).status_code == 403

    def test_legal_head_access(self, tokens):
        t = tokens["legal_head"]
        assert requests.get(f"{BASE}/reports/activity", headers=_h(t), timeout=30).status_code == 200
        assert requests.get(f"{BASE}/reports/sales", headers=_h(t), timeout=30).status_code == 403
        assert requests.get(f"{BASE}/reports/financial", headers=_h(t), timeout=30).status_code == 403

    def test_crm_head_access(self, tokens):
        t = tokens["crm_head"]
        assert requests.get(f"{BASE}/reports/activity", headers=_h(t), timeout=30).status_code == 200
        assert requests.get(f"{BASE}/reports/sales", headers=_h(t), timeout=30).status_code == 403
        assert requests.get(f"{BASE}/reports/financial", headers=_h(t), timeout=30).status_code == 403

    def test_bde_forbidden_all(self, tokens):
        t = tokens["bde"]
        assert requests.get(f"{BASE}/reports/sales", headers=_h(t), timeout=30).status_code == 403
        assert requests.get(f"{BASE}/reports/financial", headers=_h(t), timeout=30).status_code == 403
        assert requests.get(f"{BASE}/reports/activity", headers=_h(t), timeout=30).status_code == 403


# ---------- Notifications ----------
class TestNotifications:
    def test_index_shape(self, tokens):
        r = requests.get(f"{BASE}/notifications", headers=_h(tokens["admin"]), timeout=15)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert "data" in d and isinstance(d["data"], list)
        assert "unread" in d and isinstance(d["unread"], int)

    def test_unread_count(self, tokens):
        r = requests.get(f"{BASE}/notifications/unread-count", headers=_h(tokens["admin"]), timeout=15)
        assert r.status_code == 200
        d = r.json()
        # accept either {unread: n} or {count: n}
        assert any(k in d for k in ("unread", "count")), f"resp={d}"

    def test_scoped_to_user(self, tokens):
        # Admin and BDE should get different lists (scoped by user_id)
        r1 = requests.get(f"{BASE}/notifications", headers=_h(tokens["admin"]), timeout=15).json()
        r2 = requests.get(f"{BASE}/notifications", headers=_h(tokens["bde"]), timeout=15).json()
        ids1 = {n.get("id") for n in r1.get("data", [])}
        ids2 = {n.get("id") for n in r2.get("data", [])}
        # No overlap expected (each user sees own)
        assert ids1.isdisjoint(ids2), f"scope leaked: overlap={ids1 & ids2}"

    def test_mark_read_ownership(self, tokens):
        # Get a notification belonging to admin
        r = requests.get(f"{BASE}/notifications", headers=_h(tokens["admin"]), timeout=15).json()
        items = r.get("data", [])
        if not items:
            pytest.skip("No notifications for admin to test ownership")
        nid = items[0]["id"]
        # Another user tries to mark it read => 403 (or 404)
        r2 = requests.post(f"{BASE}/notifications/{nid}/read", headers=_h(tokens["bde"]), timeout=15)
        assert r2.status_code in (403, 404), f"expected 403/404 got {r2.status_code} {r2.text[:200]}"
        # Owner can mark read
        r3 = requests.post(f"{BASE}/notifications/{nid}/read", headers=_h(tokens["admin"]), timeout=15)
        assert r3.status_code in (200, 204), f"owner mark-read failed: {r3.status_code} {r3.text[:200]}"

    def test_mark_all_read(self, tokens):
        r = requests.post(f"{BASE}/notifications/read-all", headers=_h(tokens["bde"]), timeout=15)
        assert r.status_code in (200, 204), r.text[:200]
        r2 = requests.get(f"{BASE}/notifications/unread-count", headers=_h(tokens["bde"]), timeout=15).json()
        val = r2.get("unread", r2.get("count", -1))
        assert val == 0, f"expected 0 unread, got {val}"


# ---------- Payment notification trigger + receipt PDF ----------
class TestPaymentFlow:
    @pytest.fixture(scope="class")
    def booking_id(self, tokens):
        # Find any existing booking to attach a payment to
        r = requests.get(f"{BASE}/bookings?per_page=1", headers=_h(tokens["admin"]), timeout=15)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        items = d.get("data") or d.get("items") or []
        if not items:
            pytest.skip("No bookings available to test payment flow")
        return items[0]["id"]

    def test_payment_creates_notification_and_receipt(self, tokens, booking_id):
        # Baseline unread for accounts head
        acc = tokens["accounts_head"]
        before = requests.get(f"{BASE}/notifications/unread-count", headers=_h(acc), timeout=15).json()
        before_n = before.get("unread", before.get("count", 0))

        ref = "QA-TEST-" + os.urandom(4).hex()
        payload = {
            "type": "token",
            "amount": 1234,
            "method": "upi",
            "reference": ref,
        }
        r = requests.post(f"{BASE}/bookings/{booking_id}/payments",
                          headers=_h(tokens["admin"]), json=payload, timeout=30)
        assert r.status_code in (200, 201), f"payment create failed: {r.status_code} {r.text[:400]}"
        pay = r.json()
        # response may be wrapped
        pay_obj = pay.get("payment") or pay.get("data") or pay
        payment_id = pay_obj.get("id") if isinstance(pay_obj, dict) else None
        assert payment_id, f"no payment id in resp: {pay}"

        # Accounts head should now have +1 unread with amount mentioned in title
        after = requests.get(f"{BASE}/notifications", headers=_h(acc), timeout=15).json()
        after_unread = after.get("unread", 0)
        assert after_unread >= before_n + 1, f"unread did not increase: before={before_n} after={after_unread}"
        titles = " | ".join([str(n.get("title", "")) for n in after.get("data", [])[:5]])
        assert "1234" in titles or "1,234" in titles or "₹1,234" in titles, f"amount not in titles: {titles}"

        # Receipt PDF
        rr = requests.get(f"{BASE}/payments/{payment_id}/receipt", headers=_h(tokens["admin"]), timeout=60)
        assert rr.status_code == 200, f"receipt failed: {rr.status_code} {rr.text[:200]}"
        ct = rr.headers.get("Content-Type", "")
        assert "application/pdf" in ct, f"expected pdf, got {ct}"
        assert rr.content[:4] == b"%PDF", f"body does not start with %PDF: {rr.content[:10]!r}"

        # Cleanup: delete the payment if endpoint exists (best-effort)
        try:
            requests.delete(f"{BASE}/payments/{payment_id}", headers=_h(tokens["admin"]), timeout=10)
        except Exception:
            pass
