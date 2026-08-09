"""Section M: Deal Won/Lost, Booking, Public form, Verify/Pay, Lock, RBAC."""
import requests
import uuid
import pytest

BASE = "http://127.0.0.1:8000"
API = f"{BASE}/api/v1"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=10)
    r.raise_for_status()
    return r.json()["token"]


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Accept": "application/json"}


@pytest.fixture(scope="module")
def tokens():
    return {
        "admin": _login("admin@crm.local", "Admin@12345"),
        "rahul": _login("rahul@crm.local", "Demo@12345"),
        "cs": _login("crmhead@crm.local", "Demo@12345"),
        "mkt": _login("legalhead@crm.local", "Demo@12345"),
    }


@pytest.fixture()
def fresh_lead(tokens):
    uniq = uuid.uuid4().hex[:8]
    r = requests.post(f"{API}/leads", json={
        "name": f"TEST_M_{uniq}",
        "email": f"test_m_{uniq}@example.com",
        "phone": f"98000{uniq[:5]}",
        "source": "Website Form",
        "city": "Mumbai",
    }, headers=_h(tokens["admin"]))
    r.raise_for_status()
    return r.json().get("lead", r.json())


# ---------- M1.1 / M1.2 / M1.4 WON creates booking ----------
def test_won_creates_booking_and_locks_lead(tokens, fresh_lead):
    lid = fresh_lead["id"]
    r = requests.post(f"{API}/leads/{lid}/won", json={"token_amount": 800000}, headers=_h(tokens["admin"]))
    assert r.status_code in (200, 201), r.text
    body = r.json()
    bk = body.get("booking", body)
    assert bk["booking_ref"].startswith("BKG-")
    assert bk["form_token"]
    assert bk["status"] == "form_sent"
    assert bk["token_amount"] in (800000, "800000", 800000.0)
    assert bk.get("payment_link")

    # Lead is locked + stage = won
    r2 = requests.get(f"{API}/leads/{lid}", headers=_h(tokens["admin"]))
    lead = r2.json().get("lead", r2.json())
    stage_val = lead.get("stage")
    if isinstance(stage_val, dict):
        stage_val = stage_val.get("slug") or stage_val.get("name", "").lower()
    stage_val = stage_val or lead.get("status")
    assert stage_val == "won", lead
    assert lead["locked"] in (True, 1)
    # bookings[] included
    assert any(b["id"] == bk["id"] for b in lead.get("bookings", []))

    # Post-sales onboarding task created
    rt = requests.get(f"{API}/tasks?lead_id={lid}&per_page=100", headers=_h(tokens["admin"]))
    tasks = rt.json().get("data", rt.json().get("tasks", []))
    assert any(str(t.get("lead_id")) == str(lid) for t in tasks)


# ---------- M1.4 Lock enforcement ----------
def test_lock_blocks_sales_exec_and_allows_cs(tokens, fresh_lead):
    lid = fresh_lead["id"]
    requests.post(f"{API}/leads/{lid}/won", json={"token_amount": 500000}, headers=_h(tokens["admin"])).raise_for_status()

    r = requests.put(f"{API}/leads/{lid}", json={"city": "Pune"}, headers=_h(tokens["rahul"]))
    assert r.status_code == 423, r.text

    rq = requests.post(f"{API}/leads/{lid}/qualify", json={"budget": 5000000}, headers=_h(tokens["rahul"]))
    assert rq.status_code == 423, rq.text

    # CS/postsales can update
    r2 = requests.put(f"{API}/leads/{lid}", json={"city": "Bangalore"}, headers=_h(tokens["cs"]))
    assert r2.status_code == 200, r2.text

    # Admin also can
    r3 = requests.put(f"{API}/leads/{lid}", json={"city": "Chennai"}, headers=_h(tokens["admin"]))
    assert r3.status_code == 200, r3.text


# ---------- Public booking form ----------
def test_public_booking_form_get_and_submit(tokens, fresh_lead):
    lid = fresh_lead["id"]
    r = requests.post(f"{API}/leads/{lid}/won", json={"token_amount": 700000}, headers=_h(tokens["admin"]))
    bk = r.json().get("booking", r.json())
    tok = bk["form_token"]
    bid = bk["id"]

    # GET no-auth
    gr = requests.get(f"{API}/booking-form/{tok}")
    assert gr.status_code == 200, gr.text
    gb = gr.json()
    assert gb.get("booking_ref", "").startswith("BKG-")
    assert "lead" in gb
    assert gb.get("token_amount") in (700000, 700000.0, "700000")

    # POST no-auth
    pr = requests.post(f"{API}/booking-form/{tok}", json={
        "applicant_name": "Applicant One",
        "pan": "ABCDE1234F",
        "nominee": "Nom Person",
    })
    assert pr.status_code in (200, 201), pr.text
    submitted = pr.json().get("booking", pr.json())
    assert submitted["status"] == "form_submitted"

    # Verify then pay -> confirmed
    vr = requests.post(f"{API}/bookings/{bid}/verify", headers=_h(tokens["admin"]))
    assert vr.status_code == 200, vr.text
    vb = vr.json().get("booking", vr.json())
    assert vb["status"] in ("verified", "confirmed")

    pyr = requests.post(f"{API}/bookings/{bid}/pay-token", headers=_h(tokens["admin"]))
    assert pyr.status_code == 200, pyr.text
    pb = pyr.json().get("booking", pyr.json())
    assert pb.get("token_status") == "paid"
    assert pb["status"] == "confirmed"


# ---------- LOST ----------
def test_lost_sets_reason_and_releases(tokens, fresh_lead):
    lid = fresh_lead["id"]
    r = requests.post(f"{API}/leads/{lid}/lost", json={"reason": "chose competitor"}, headers=_h(tokens["admin"]))
    assert r.status_code == 200, r.text
    lead = r.json().get("lead", r.json())
    stage = lead.get("stage") or lead.get("status")
    assert stage == "lost"
    assert (lead.get("lost_reason") or "").lower().startswith("chose")


# ---------- Bookings listing ----------
def test_bookings_list_and_show(tokens, fresh_lead):
    lid = fresh_lead["id"]
    b = requests.post(f"{API}/leads/{lid}/won", json={"token_amount": 300000}, headers=_h(tokens["admin"])).json()
    bk = b.get("booking", b)
    bid = bk["id"]

    lr = requests.get(f"{API}/bookings", headers=_h(tokens["admin"]))
    assert lr.status_code == 200
    data = lr.json().get("data", lr.json())
    assert isinstance(data, list) and any(x["id"] == bid for x in data)

    sr = requests.get(f"{API}/bookings/{bid}", headers=_h(tokens["admin"]))
    assert sr.status_code == 200
    sb = sr.json().get("booking", sr.json())
    assert sb["id"] == bid
    assert "lead" in sb


# ---------- RBAC ----------
def test_rbac_marketing_cannot_won(tokens, fresh_lead):
    lid = fresh_lead["id"]
    r = requests.post(f"{API}/leads/{lid}/won", json={"token_amount": 100000}, headers=_h(tokens["mkt"]))
    assert r.status_code == 403, r.text


def test_rahul_can_initiate_won(tokens, fresh_lead):
    lid = fresh_lead["id"]
    r = requests.post(f"{API}/leads/{lid}/won", json={"token_amount": 200000}, headers=_h(tokens["rahul"]))
    assert r.status_code in (200, 201), r.text
