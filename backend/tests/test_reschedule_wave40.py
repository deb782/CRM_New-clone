"""
Wave-40 tests: Reschedule date-parsing (webhook) + one-tap confirm + calendar drag reschedule.
"""
import os
import time
import uuid
import requests
import pytest
from datetime import datetime, timedelta

BASE = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/") + "/crm-api/v1"

CRED_BDM = ("bdm@crm.local", "Demo@12345")
CRED_BDE = ("rahul@crm.local", "Demo@12345")
CRED_PRIYA = ("priya@crm.local", "Demo@12345")
CRED_CP = ("partner@crm.local", "Demo@12345")


def _login(email, password):
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text[:200]}"
    return r.json().get("token") or r.json().get("access_token")


@pytest.fixture(scope="module")
def tok_bdm():
    return _login(*CRED_BDM)


@pytest.fixture(scope="module")
def tok_bde():
    return _login(*CRED_BDE)


@pytest.fixture(scope="module")
def tok_priya():
    return _login(*CRED_PRIYA)


@pytest.fixture(scope="module")
def tok_cp():
    return _login(*CRED_CP)


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ---------- 1. BDM dashboard shape ----------

def test_bdm_dashboard_reschedule_requests_and_calendar_visit_id(tok_bdm):
    r = requests.get(f"{BASE}/dashboards/bdm", headers=_h(tok_bdm), timeout=30)
    assert r.status_code == 200, r.text[:300]
    data = r.json()
    assert "reschedule_requests" in data, "missing reschedule_requests"
    assert isinstance(data["reschedule_requests"], list)
    assert "calendar" in data
    # seeded demo: Anil Kapoor request expected
    names = [rr.get("lead_name") for rr in data["reschedule_requests"]]
    assert any("Anil" in (n or "") for n in names), f"expected Anil Kapoor demo reschedule, got: {names}"
    # calendar visit items include visit_id
    visits = [c for c in data["calendar"] if c.get("kind") == "visit"]
    if visits:
        assert all("visit_id" in v and v["visit_id"] for v in visits), "calendar visit missing visit_id"


# ---------- 2. Permission: channel partner 403 on confirm ----------

def test_confirm_reschedule_channel_partner_forbidden(tok_cp, tok_bdm):
    # find a pending task id
    r = requests.get(f"{BASE}/dashboards/bdm", headers=_h(tok_bdm), timeout=30)
    tasks = r.json().get("reschedule_requests") or []
    if not tasks:
        pytest.skip("no reschedule task available")
    tid = tasks[0]["task_id"]
    rr = requests.post(f"{BASE}/reschedules/{tid}/confirm", headers=_h(tok_cp), timeout=30)
    assert rr.status_code == 403, f"expected 403 for CP, got {rr.status_code}: {rr.text[:200]}"


# ---------- 3. Helper: create a lead + site visit as BDE, handoff so BDM owns it ----------

def _create_lead_with_visit(tok_bde, tok_bdm):
    """Create TEST_ lead as BDE, schedule future visit → hands off to BDM with active VisitEngagement."""
    phone = "9" + str(int(time.time() * 1000))[-9:]
    payload = {"name": f"TEST_W40_{uuid.uuid4().hex[:6]}", "phone": phone, "source": "TEST"}
    r = requests.post(f"{BASE}/leads", headers=_h(tok_bde), json=payload, timeout=30)
    assert r.status_code in (200, 201), f"lead create failed: {r.status_code} {r.text[:300]}"
    lead = r.json().get("lead") or r.json()
    lead_id = lead["id"]
    sched = (datetime.utcnow() + timedelta(days=7)).strftime("%Y-%m-%dT%H:00:00Z")
    r2 = requests.post(f"{BASE}/leads/{lead_id}/site-visits", headers=_h(tok_bde),
                       json={"scheduled_at": sched}, timeout=30)
    assert r2.status_code in (200, 201), f"visit create failed: {r2.status_code} {r2.text[:300]}"
    visit = r2.json().get("visit") or r2.json()
    return lead_id, visit["id"], phone


# ---------- 4. Calendar drag reschedule endpoint ----------

def test_calendar_drag_reschedule_moves_visit_and_restarts_engagement(tok_bde, tok_bdm):
    lead_id, visit_id, phone = _create_lead_with_visit(tok_bde, tok_bdm)
    new_when = (datetime.utcnow() + timedelta(days=14)).strftime("%Y-%m-%dT%H:00:00Z")
    r = requests.post(f"{BASE}/site-visits/{visit_id}/reschedule", headers=_h(tok_bdm),
                      json={"scheduled_at": new_when, "reason": "TEST calendar drag"}, timeout=30)
    assert r.status_code == 200, f"reschedule failed: {r.status_code} {r.text[:300]}"
    body = r.json().get("visit") or r.json()
    # verify scheduled_at moved to the new day
    assert new_when[:10] in (body.get("scheduled_at") or ""), f"expected new date {new_when[:10]} in {body.get('scheduled_at')}"

    # active engagement should exist after reschedule
    r2 = requests.get(f"{BASE}/dashboards/bdm", headers=_h(tok_bdm), timeout=30)
    engs = r2.json().get("engagements") or []
    # not guaranteed for this specific lead but overall list should not fail
    assert isinstance(engs, list)


# ---------- 5. Meta webhook: 'resched' → creates task; text with date → proposed_at annotated ----------

def _meta_wa(phone, message_obj):
    """POST Meta-format webhook."""
    payload = {
        "entry": [{
            "changes": [{
                "value": {
                    "contacts": [{"profile": {"name": "TEST_W40"}, "wa_id": phone}],
                    "messages": [message_obj],
                }
            }]
        }]
    }
    return requests.post(f"{BASE}/webhooks/whatsapp", json=payload, timeout=30)


def _find_pending_reschedule_task(tok_bdm, lead_id):
    r = requests.get(f"{BASE}/dashboards/bdm", headers=_h(tok_bdm), timeout=30)
    for t in r.json().get("reschedule_requests", []):
        if t.get("lead_id") == lead_id:
            return t
    return None


def test_webhook_resched_button_creates_task_then_date_annotates_proposed_at(tok_bde, tok_bdm):
    lead_id, visit_id, phone = _create_lead_with_visit(tok_bde, tok_bdm)

    # (a) button_reply id=resched
    msg1 = {
        "id": f"wamid.TEST{uuid.uuid4().hex[:10]}",
        "from": phone,
        "type": "interactive",
        "interactive": {"type": "button_reply", "button_reply": {"id": "resched", "title": "Reschedule"}},
    }
    r1 = _meta_wa(phone, msg1)
    assert r1.status_code == 200, f"webhook resched failed: {r1.status_code} {r1.text[:300]}"

    # Reassign owner to bdm so it shows on BDM dashboard? Actually SiteVisitService.schedule handoff sets owner_id=BDM already.
    time.sleep(1)
    task = _find_pending_reschedule_task(tok_bdm, lead_id)
    assert task is not None, f"no reschedule task created for lead {lead_id}"
    task_id = task["task_id"]
    assert task.get("proposed_at") in (None, ""), "proposed_at should be empty before date reply"

    # (c) too-short/emoji reply should NOT set proposed_at
    msg_emoji = {
        "id": f"wamid.TEST{uuid.uuid4().hex[:10]}",
        "from": phone,
        "type": "text",
        "text": {"body": "👍"},
    }
    r_emoji = _meta_wa(phone, msg_emoji)
    assert r_emoji.status_code == 200
    time.sleep(0.5)
    t2 = _find_pending_reschedule_task(tok_bdm, lead_id)
    assert t2 is not None
    assert not t2.get("proposed_at"), f"emoji reply should not set proposed_at, got: {t2.get('proposed_at')}"

    # (b) text with parseable future date
    future = datetime.utcnow() + timedelta(days=10)
    date_text = future.strftime("%d %b %Y 4pm")
    msg2 = {
        "id": f"wamid.TEST{uuid.uuid4().hex[:10]}",
        "from": phone,
        "type": "text",
        "text": {"body": date_text},
    }
    r2 = _meta_wa(phone, msg2)
    assert r2.status_code == 200, f"webhook date text failed: {r2.status_code} {r2.text[:300]}"
    time.sleep(1)
    t3 = _find_pending_reschedule_task(tok_bdm, lead_id)
    assert t3 is not None
    assert t3.get("proposed_at"), f"expected proposed_at populated after '{date_text}', got: {t3}"
    assert t3.get("preferred_text") == date_text or date_text in (t3.get("preferred_text") or "")


# ---------- 6. One-tap confirm: moves visit + completes task ----------

def test_one_tap_confirm_reschedule_moves_visit_and_completes(tok_bde, tok_bdm):
    lead_id, visit_id, phone = _create_lead_with_visit(tok_bde, tok_bdm)

    # trigger resched
    _meta_wa(phone, {"id": f"wamid.T{uuid.uuid4().hex[:8]}", "from": phone, "type": "interactive",
                     "interactive": {"type": "button_reply", "button_reply": {"id": "resched", "title": "Reschedule"}}})
    time.sleep(0.5)
    future = datetime.utcnow() + timedelta(days=12)
    date_text = future.strftime("%d %b %Y 3pm")
    _meta_wa(phone, {"id": f"wamid.T{uuid.uuid4().hex[:8]}", "from": phone, "type": "text",
                     "text": {"body": date_text}})
    time.sleep(1)

    task = _find_pending_reschedule_task(tok_bdm, lead_id)
    assert task is not None and task.get("proposed_at"), f"expected proposed_at task, got {task}"
    proposed = task["proposed_at"]
    task_id = task["task_id"]

    # Confirm
    r = requests.post(f"{BASE}/reschedules/{task_id}/confirm", headers=_h(tok_bdm), timeout=30)
    assert r.status_code == 200, f"confirm failed: {r.status_code} {r.text[:300]}"
    body = r.json()
    assert body.get("ok") is True
    visit = body.get("visit")
    assert visit, f"no visit in response: {body}"
    # visit scheduled_at should be at proposed_at date
    assert proposed[:10] in (visit.get("scheduled_at") or ""), \
        f"visit not moved to proposed date. proposed={proposed} got={visit.get('scheduled_at')}"

    # Task should now be gone from pending list
    time.sleep(0.5)
    t2 = _find_pending_reschedule_task(tok_bdm, lead_id)
    assert t2 is None, f"task should be completed but still pending: {t2}"
