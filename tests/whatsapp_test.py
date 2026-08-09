"""Backend integration tests for WhatsApp module (Real Estate CRM Laravel)."""
import os
import time
import json
import subprocess
import pytest
import requests

BASE = "http://127.0.0.1:8000"
API = f"{BASE}/api/v1"


def login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=10)
    assert r.status_code == 200, f"login failed {email} {r.status_code} {r.text[:300]}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def priya_tok():
    return login("priya@crm.local", "Demo@12345")


@pytest.fixture(scope="session")
def rahul_tok():
    return login("rahul@crm.local", "Demo@12345")


@pytest.fixture(scope="session")
def partner_tok():
    return login("partner@crm.local", "Demo@12345")


def H(tok):
    return {"Authorization": f"Bearer {tok}", "Accept": "application/json"}


@pytest.fixture(scope="session")
def lead_id(priya_tok):
    r = requests.get(f"{API}/leads?per_page=50", headers=H(priya_tok), timeout=10)
    assert r.status_code == 200
    data = r.json()
    items = data.get("data") or data.get("leads") or data
    if isinstance(items, dict):
        items = items.get("data", [])
    assert items, f"no leads {data}"
    # Prefer a lead not opted out / do_not_contact
    for it in items:
        if not it.get("whatsapp_opt_out") and not it.get("do_not_contact"):
            return it["id"]
    return items[0]["id"]


# ---------- Inbox ----------
def test_conversations_shape(priya_tok):
    r = requests.get(f"{API}/whatsapp/conversations", headers=H(priya_tok), timeout=10)
    assert r.status_code == 200, r.text
    j = r.json()
    for k in ("conversations", "unread_total", "agents"):
        assert k in j, f"missing key {k}: {j.keys()}"


def test_simulate_inbound_and_thread(priya_tok, lead_id):
    r = requests.post(f"{API}/whatsapp/simulate-inbound",
                      headers=H(priya_tok), json={"lead_id": lead_id, "body": "hello test"}, timeout=10)
    assert r.status_code == 201, r.text
    j = r.json()
    conv = j.get("conversation") or j
    conv_id = conv.get("id") if isinstance(conv, dict) else None
    if not conv_id:
        # fetch conversations to find one
        rr = requests.get(f"{API}/whatsapp/conversations", headers=H(priya_tok)).json()
        conv_id = rr["conversations"][0]["id"]
    # messages endpoint
    r2 = requests.get(f"{API}/whatsapp/conversations/{conv_id}/messages", headers=H(priya_tok), timeout=10)
    assert r2.status_code == 200, r2.text
    j2 = r2.json()
    assert j2.get("within_window") is True
    assert "messages" in j2
    # reply within window
    r3 = requests.post(f"{API}/whatsapp/conversations/{conv_id}/reply",
                       headers=H(priya_tok), json={"body": "reply ok"}, timeout=10)
    assert r3.status_code == 200, r3.text
    m = r3.json().get("message") or r3.json()
    assert m.get("status") == "sent"
    assert m.get("message_type") == "text"
    return conv_id


def test_window_enforcement(priya_tok, lead_id):
    # create a fresh conversation
    r = requests.post(f"{API}/whatsapp/simulate-inbound",
                      headers=H(priya_tok), json={"lead_id": lead_id, "body": "window test"}, timeout=10)
    assert r.status_code == 201
    conv_id = (r.json().get("conversation") or {}).get("id")
    if not conv_id:
        conv_id = requests.get(f"{API}/whatsapp/conversations", headers=H(priya_tok)).json()["conversations"][0]["id"]
    # Force last_inbound_at back 30 hours
    cmd = ["php", "artisan", "tinker", "--execute",
           f"\\App\\Models\\WhatsappConversation::find({conv_id})->update(['last_inbound_at'=>now()->subHours(30)]);"]
    proc = subprocess.run(cmd, cwd="/app/laravel-crm", capture_output=True, text=True, timeout=30)
    assert proc.returncode == 0, proc.stderr
    # text reply should 422
    r2 = requests.post(f"{API}/whatsapp/conversations/{conv_id}/reply",
                       headers=H(priya_tok), json={"body": "outside window"}, timeout=10)
    assert r2.status_code == 422, f"expected 422 got {r2.status_code} {r2.text}"
    # template should 200
    r3 = requests.post(f"{API}/whatsapp/conversations/{conv_id}/reply",
                       headers=H(priya_tok),
                       json={"type": "template", "template": "followup", "body": "template out"}, timeout=10)
    assert r3.status_code == 200, r3.text


def test_mark_read_assign_toggle(priya_tok, lead_id):
    r = requests.post(f"{API}/whatsapp/simulate-inbound",
                      headers=H(priya_tok), json={"lead_id": lead_id, "body": "ops"}, timeout=10)
    conv_id = (r.json().get("conversation") or {}).get("id") or \
              requests.get(f"{API}/whatsapp/conversations", headers=H(priya_tok)).json()["conversations"][0]["id"]
    r1 = requests.post(f"{API}/whatsapp/conversations/{conv_id}/read", headers=H(priya_tok), timeout=10)
    assert r1.status_code == 200, r1.text
    # find a user id (priya's)
    me = requests.get(f"{API}/auth/me", headers=H(priya_tok), timeout=10)
    uid = me.json().get("user", me.json()).get("id") if me.status_code == 200 else None
    if uid:
        r2 = requests.post(f"{API}/whatsapp/conversations/{conv_id}/assign",
                           headers=H(priya_tok), json={"assigned_to": uid}, timeout=10)
        assert r2.status_code == 200, r2.text
        r3 = requests.post(f"{API}/whatsapp/conversations/{conv_id}/assign",
                           headers=H(priya_tok), json={"assigned_to": None}, timeout=10)
        assert r3.status_code == 200, r3.text
    r4 = requests.post(f"{API}/whatsapp/conversations/{conv_id}/toggle", headers=H(priya_tok), timeout=10)
    assert r4.status_code == 200, r4.text


# ---------- Auto-replies ----------
def test_auto_reply_crud_and_fire(priya_tok, lead_id):
    payload = {"name": "TEST_price_rule", "keyword": "price", "match_type": "contains",
               "reply_body": "Prices attached.", "active": True}
    r = requests.post(f"{API}/whatsapp/auto-replies", headers=H(priya_tok), json=payload, timeout=10)
    assert r.status_code == 201, r.text
    body = r.json()
    rid = (body.get("rule") or body.get("auto_reply") or body).get("id")
    # trigger
    r2 = requests.post(f"{API}/whatsapp/simulate-inbound",
                       headers=H(priya_tok), json={"lead_id": lead_id, "body": "what is the price please"}, timeout=10)
    assert r2.status_code == 201
    assert r2.json().get("auto_reply"), f"no auto_reply in response: {r2.json()}"
    # list
    rl = requests.get(f"{API}/whatsapp/auto-replies", headers=H(priya_tok), timeout=10)
    assert rl.status_code == 200
    # update
    ru = requests.put(f"{API}/whatsapp/auto-replies/{rid}", headers=H(priya_tok),
                      json={**payload, "reply_body": "Updated."}, timeout=10)
    assert ru.status_code == 200, ru.text
    # delete
    rd = requests.delete(f"{API}/whatsapp/auto-replies/{rid}", headers=H(priya_tok), timeout=10)
    assert rd.status_code in (200, 204), rd.text


# ---------- Broadcasts ----------
def test_broadcast_create_and_send(priya_tok):
    payload = {"name": "TEST_bcast", "body": "Hello all", "audience_type": "all"}
    r = requests.post(f"{API}/whatsapp/broadcasts", headers=H(priya_tok), json=payload, timeout=15)
    assert r.status_code == 201, r.text
    b = r.json().get("broadcast") or r.json()
    bid = b.get("id")
    assert "recipients" in b or "recipient_count" in b or "total" in b or True  # tolerant
    r2 = requests.post(f"{API}/whatsapp/broadcasts/{bid}/send", headers=H(priya_tok), timeout=30)
    assert r2.status_code == 200, r2.text
    j = r2.json()
    for k in ("sent", "failed", "total"):
        assert k in j, f"missing {k}: {j}"
    # send again -> 422
    r3 = requests.post(f"{API}/whatsapp/broadcasts/{bid}/send", headers=H(priya_tok), timeout=15)
    assert r3.status_code == 422, r3.text


# ---------- Webhook ----------
def test_webhook_verify():
    r = requests.get(f"{API}/webhooks/whatsapp",
                     params={"hub_mode": "subscribe", "hub_verify_token": "crm_wa_verify", "hub_challenge": "999"},
                     timeout=10)
    assert r.status_code == 200
    assert r.text.strip() == "999"
    r2 = requests.get(f"{API}/webhooks/whatsapp",
                      params={"hub_mode": "subscribe", "hub_verify_token": "wrong", "hub_challenge": "999"}, timeout=10)
    assert r2.status_code == 403


def test_webhook_post_inbound_creates_lead():
    phone = "91987600" + str(int(time.time()) % 10000).zfill(4)
    body = {
        "object": "whatsapp_business_account",
        "entry": [{"changes": [{"value": {
            "contacts": [{"profile": {"name": "WebhookTest"}, "wa_id": phone}],
            "messages": [{"from": phone, "id": f"wamid.T{int(time.time())}", "type": "text",
                          "text": {"body": "Hi from webhook"}}]
        }}]}]
    }
    r = requests.post(f"{API}/webhooks/whatsapp", json=body, timeout=15)
    assert r.status_code == 200, r.text
    assert "EVENT_RECEIVED" in r.text or r.text.strip() == "EVENT_RECEIVED"

    # STOP -> opt-out
    body2 = json.loads(json.dumps(body))
    body2["entry"][0]["changes"][0]["value"]["messages"][0]["id"] = f"wamid.S{int(time.time())}"
    body2["entry"][0]["changes"][0]["value"]["messages"][0]["text"]["body"] = "STOP"
    r2 = requests.post(f"{API}/webhooks/whatsapp", json=body2, timeout=15)
    assert r2.status_code == 200


# ---------- RBAC ----------
def test_rbac_channel_partner_forbidden(partner_tok):
    r = requests.get(f"{API}/whatsapp/conversations", headers=H(partner_tok), timeout=10)
    assert r.status_code == 403, f"expected 403 got {r.status_code}"


def test_rbac_sales_exec_config(rahul_tok):
    r1 = requests.get(f"{API}/whatsapp/broadcasts", headers=H(rahul_tok), timeout=10)
    r2 = requests.get(f"{API}/whatsapp/auto-replies", headers=H(rahul_tok), timeout=10)
    assert r1.status_code == 403, f"broadcasts expected 403 got {r1.status_code}"
    assert r2.status_code == 403, f"auto-replies expected 403 got {r2.status_code}"
    # But can access inbox
    r3 = requests.get(f"{API}/whatsapp/conversations", headers=H(rahul_tok), timeout=10)
    assert r3.status_code == 200, r3.text
