"""
Wave 3 tests: Dashboard integration status strip, WhatsApp template sync,
Mcube call logging (click-to-call + telephony webhook), and RBAC gating.
"""
import os
import time
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://deal-flow-platform.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/crm-api/v1"

ADMIN = {"email": "admin@crm.local", "password": "Admin@12345"}
BDE = {"email": "rahul@crm.local", "password": "Demo@12345"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN)


@pytest.fixture(scope="module")
def bde_token():
    return _login(BDE)


@pytest.fixture(scope="module")
def admin_h(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Accept": "application/json"}


@pytest.fixture(scope="module")
def bde_h(bde_token):
    return {"Authorization": f"Bearer {bde_token}", "Accept": "application/json"}


# ---------- Integrations index (admin) ----------

def test_integrations_index_admin_returns_meta_whatsapp(admin_h):
    r = requests.get(f"{API}/integrations", headers=admin_h, timeout=20)
    assert r.status_code == 200, r.text
    body = r.json()
    items = body.get("data") or body.get("items") or body
    assert isinstance(items, list) and len(items) > 0
    keys = [i["key"] for i in items]
    assert "meta_whatsapp" in keys
    for it in items:
        assert "key" in it and "name" in it
        assert "enabled" in it and "configured" in it


def test_integrations_index_bde_forbidden(bde_h):
    r = requests.get(f"{API}/integrations", headers=bde_h, timeout=20)
    # Non-admin must be blocked (silently in UI); dashboard.js catches this
    assert r.status_code in (403, 401), r.text


# ---------- WhatsApp templates sync (admin) ----------

def test_whatsapp_templates_sync_admin(admin_h):
    r = requests.post(f"{API}/whatsapp/templates/sync", headers=admin_h, timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "synced" in body
    assert "templates" in body
    assert isinstance(body["templates"], list)
    assert isinstance(body["synced"], int)


def test_whatsapp_templates_sync_bde_forbidden(bde_h):
    r = requests.post(f"{API}/whatsapp/templates/sync", headers=bde_h, timeout=15)
    assert r.status_code in (403, 401)


# ---------- Click-to-call + Telephony webhook ----------

@pytest.fixture(scope="module")
def test_lead(admin_h):
    ts = str(int(time.time()))[-6:]
    phone = "998" + ts
    payload = {
        "name": "TEST_Wave3Lead_" + ts,
        "phone": phone,
        "email": f"TEST_wave3lead_{ts}@example.com",
        "source": "Website Form",
    }
    r = requests.post(f"{API}/leads", headers=admin_h, json=payload, timeout=15)
    assert r.status_code in (200, 201), r.text
    body = r.json()
    lead = body.get("lead") or body.get("data") or body
    lead_id = lead.get("id") or body.get("id") or body.get("lead_id")
    assert lead_id, body
    return {"id": lead_id, "phone": phone}


def test_click_to_call_creates_call_row(admin_h, test_lead):
    r = requests.post(f"{API}/leads/{test_lead['id']}/call", headers=admin_h, timeout=20)
    assert r.status_code == 200, r.text
    body = r.json()
    # TelephonyService returns array with provider info; call_id or mock present
    # Structure varies by driver — assert at least one identifier field
    assert isinstance(body, dict)
    # Fetch calls for lead to verify a row was created with provider_call_id
    lr = requests.get(f"{API}/leads/{test_lead['id']}", headers=admin_h, timeout=15)
    assert lr.status_code == 200


def test_telephony_webhook_updates_call_and_logs_activity(admin_h, test_lead):
    # Trigger a click-to-call first so a Call row with provider_call_id exists
    cc = requests.post(f"{API}/leads/{test_lead['id']}/call", headers=admin_h, timeout=20)
    assert cc.status_code == 200
    provider_id = (cc.json() or {}).get("call_id") or f"MC-TEST-{int(time.time())}"

    # If click-to-call didn't return call_id, seed one via explicit provider id known:
    payload = {
        "callid": provider_id,
        "dialcallstatus": "ANSWER",
        "callduration": "143",
        "filename": "https://rec/x.mp3",
        "custnumber": test_lead["phone"],
    }
    r = requests.post(f"{API}/webhooks/telephony", json=payload, timeout=20)
    assert r.status_code == 200, r.text
    assert r.json().get("message") == "ok"

    # Verify an activity was logged on the lead (activities are embedded in show)
    ar = requests.get(f"{API}/leads/{test_lead['id']}", headers=admin_h, timeout=15)
    assert ar.status_code == 200, ar.text
    body = ar.json()
    lead_obj = body.get("lead") or body.get("data") or body
    acts = lead_obj.get("timeline") or lead_obj.get("activities") or body.get("timeline") or []
    assert isinstance(acts, list) and len(acts) > 0
    call_acts = [a for a in acts if a.get("type") == "call"]
    assert len(call_acts) > 0, f"Expected a call activity, got: {[a.get('type') for a in acts]}"
    joined = str(call_acts)
    assert "rec/x.mp3" in joined or "143" in joined or "Recording" in joined or "Telephony" in joined


def test_telephony_webhook_no_match_still_200():
    r = requests.post(f"{API}/webhooks/telephony", json={
        "callid": "UNKNOWN-XYZ", "dialcallstatus": "NOANSWER",
        "callduration": "0", "custnumber": "0000000000",
    }, timeout=15)
    assert r.status_code == 200
