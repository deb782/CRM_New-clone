"""Backend API tests for Laravel Real Estate CRM (Phase A Pre-Sales)."""
import pytest
import requests
import uuid

BASE = "http://127.0.0.1:8000"
API = f"{BASE}/api/v1"

ADMIN = {"email": "admin@crm.local", "password": "Admin@12345"}


def H(tok):
    return {"Authorization": f"Bearer {tok}", "Accept": "application/json", "Content-Type": "application/json"}


# -------- Auth --------
class TestAuth:
    def test_admin_login_role_perms(self):
        r = requests.post(f"{API}/auth/login", json=ADMIN)
        assert r.status_code == 200
        d = r.json()
        assert d.get("token")
        user = d.get("user", {})
        assert user.get("role") == "admin"
        perms = d.get("permissions") or user.get("permissions") or []
        assert "*" in perms, f"expected '*' in perms, got {perms}"

    def test_me_endpoint(self, admin_token):
        r = requests.get(f"{API}/me", headers=H(admin_token))
        assert r.status_code == 200
        body = r.json()
        user = body.get("user", body)
        assert user.get("email") == ADMIN["email"]

    def test_invalid_credentials_422(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN["email"], "password": "wrong"})
        assert r.status_code == 422


# -------- Dashboard --------
class TestDashboard:
    def test_dashboard_fields(self, admin_token):
        r = requests.get(f"{API}/dashboard", headers=H(admin_token))
        assert r.status_code == 200
        d = r.json()
        for k in ["total_leads", "hot_leads", "temperature", "funnel", "by_source", "recent_leads"]:
            assert k in d, f"missing {k}"


# -------- Lead capture --------
class TestLeadCapture:
    def test_lead_created_with_new_lead_status(self, seed_lead, admin_token):
        # Fetch back the seeded lead
        r = requests.get(f"{API}/leads/{seed_lead['id']}", headers=H(admin_token))
        assert r.status_code == 200
        lead = r.json().get("lead", r.json())
        assert lead.get("status") == "new_lead"
        assert lead.get("owner_id") is not None, "round-robin owner not assigned"

    def test_verify_task_created(self, seed_lead, admin_token):
        r = requests.get(f"{API}/tasks", headers=H(admin_token))
        assert r.status_code == 200
        data = r.json()
        items = data.get("tasks") or data.get("data") or (data if isinstance(data, list) else [])
        matched = [t for t in items if t.get("lead_id") == seed_lead["id"]
                   and "verify" in ((t.get("type") or "") + " " + (t.get("title") or "")).lower()]
        assert matched, f"no verify task for lead {seed_lead['id']}"

    def test_missing_email_and_phone_422(self, admin_token):
        r = requests.post(f"{API}/leads", json={"name": "NoContact", "source": "Website Form"},
                          headers=H(admin_token))
        assert r.status_code == 422


# -------- Duplicate --------
class TestDuplicate:
    def test_duplicate_returns_409(self, seed_lead, admin_token):
        r = requests.post(f"{API}/leads", json={
            "name": "DupTry", "email": seed_lead["email"], "phone": seed_lead["phone"],
            "source": "Website Form"
        }, headers=H(admin_token))
        assert r.status_code == 409, r.text
        body = r.json()
        assert "duplicate" in str(body).lower() or body.get("matches") or body.get("block")

    def test_duplicate_force(self, seed_lead, admin_token):
        r = requests.post(f"{API}/leads", json={
            "name": "DupForce", "email": seed_lead["email"], "phone": seed_lead["phone"],
            "source": "Website Form", "force": True
        }, headers=H(admin_token))
        assert r.status_code in (200, 201), r.text

    def test_check_duplicate_endpoint(self, seed_lead, admin_token):
        r = requests.get(f"{API}/leads/check-duplicate",
                         params={"email": seed_lead["email"], "phone": seed_lead["phone"]},
                         headers=H(admin_token))
        assert r.status_code == 200
        d = r.json()
        assert any(k in d for k in ("block", "flag", "matches", "reason"))


# -------- Qualify --------
class TestQualify:
    def test_qualify_updates_score_status(self, seed_lead, admin_token):
        r = requests.post(f"{API}/leads/{seed_lead['id']}/qualify", json={
            "interest_level": "high", "budget_min": 5000000, "budget_max": 8000000,
            "timeline": "1-3m", "financing": "loan", "decision_maker": "self",
            "preferred_location": "Mumbai"
        }, headers=H(admin_token))
        assert r.status_code == 200, r.text
        lead = r.json().get("lead", r.json())
        assert isinstance(lead.get("score"), (int, float))
        assert lead.get("temperature") in ("hot", "warm", "cold")
        assert lead.get("status") == "contacted", f"expected contacted, got {lead.get('status')}"


# -------- Transition / automation --------
class TestTransition:
    def test_transition_interested(self, seed_lead, admin_token):
        r = requests.post(f"{API}/leads/{seed_lead['id']}/transition",
                          json={"stage": "interested"}, headers=H(admin_token))
        assert r.status_code == 200, r.text

    def test_automation_logs_status_changed(self, admin_token):
        r = requests.get(f"{API}/automation-logs", headers=H(admin_token))
        assert r.status_code == 200
        data = r.json()
        items = data.get("logs") or data.get("data") or (data if isinstance(data, list) else [])
        assert any((l.get("event") == "status.changed" and l.get("status") == "success") for l in items), \
            f"no status.changed success log, sample: {items[:3]}"

    def test_downgrade_blocked_for_exec(self, admin_token, exec_token):
        uniq = uuid.uuid4().hex[:8]
        cr = requests.post(f"{API}/leads", json={
            "name": f"TESTdg_{uniq}", "email": f"dg_{uniq}@e.com",
            "phone": f"91111{uniq[:5]}", "source": "Website Form"
        }, headers=H(admin_token))
        assert cr.status_code in (200, 201)
        lid = (cr.json().get("lead") or cr.json())["id"]
        requests.post(f"{API}/leads/{lid}/transition", json={"stage": "contacted"}, headers=H(admin_token))
        requests.post(f"{API}/leads/{lid}/transition", json={"stage": "interested"}, headers=H(admin_token))
        r = requests.post(f"{API}/leads/{lid}/transition", json={"stage": "new_lead"}, headers=H(exec_token))
        assert r.status_code == 403, f"expected 403, got {r.status_code}"


# -------- Communication --------
class TestComms:
    def test_call_log_no_answer(self, seed_lead, admin_token):
        r = requests.post(f"{API}/leads/{seed_lead['id']}/call-log",
                          json={"outcome": "no_answer", "notes": "no pickup"}, headers=H(admin_token))
        assert r.status_code in (200, 201), r.text

    def test_whatsapp_mock(self, seed_lead, admin_token):
        r = requests.post(f"{API}/leads/{seed_lead['id']}/whatsapp",
                          json={"body": "Hi from test"}, headers=H(admin_token))
        assert r.status_code in (200, 201), r.text

    def test_email_mock(self, seed_lead, admin_token):
        r = requests.post(f"{API}/leads/{seed_lead['id']}/email",
                          json={"subject": "Hi", "body": "Body"}, headers=H(admin_token))
        assert r.status_code in (200, 201), r.text


# -------- Call list --------
class TestCallList:
    def test_call_list_ordered(self, admin_token):
        r = requests.get(f"{API}/leads/call-list", headers=H(admin_token))
        assert r.status_code == 200
        data = r.json()
        items = data.get("leads") or data.get("data") or (data if isinstance(data, list) else [])
        assert items, "call-list empty"
        rank = {"hot": 0, "warm": 1, "cold": 2}
        prev = -1
        for it in items[:15]:
            cur = rank.get(it.get("temperature", "cold"), 3)
            assert cur >= prev, f"call list not ordered by temperature at {it}"
            prev = cur


# -------- Bulk import --------
class TestBulkImport:
    def test_preview_and_commit(self, admin_token):
        uniq = uuid.uuid4().hex[:6]
        csv = f"name,email,phone,source\nTESTIMP_{uniq},imp_{uniq}@e.com,9500{uniq}00,Website Form"
        r = requests.post(f"{API}/leads-import/preview", json={"csv": csv}, headers=H(admin_token))
        assert r.status_code == 200, r.text
        prev = r.json()
        assert prev.get("rows") or prev.get("data") or prev, "empty preview"
        r2 = requests.post(f"{API}/leads-import/commit", json={"csv": csv}, headers=H(admin_token))
        assert r2.status_code in (200, 201), r2.text
        s = r2.json()
        text = str(s)
        for k in ["imported", "duplicates", "failed"]:
            assert k in text, f"missing {k} in commit summary: {s}"


# -------- Config CRUD --------
@pytest.mark.parametrize("path", [
    "/scoring-rules", "/automation-rules", "/templates",
    "/sequences", "/users", "/roles"
])
def test_config_lists(admin_token, path):
    r = requests.get(f"{API}{path}", headers=H(admin_token))
    assert r.status_code == 200, f"{path} -> {r.status_code} {r.text[:200]}"


# -------- Public webhook --------
class TestWebhook:
    def test_webhook_no_auth(self):
        uniq = uuid.uuid4().hex[:8]
        r = requests.post(f"{API}/webhooks/lead-form",
                          json={"name": f"WH_{uniq}", "phone": f"9700{uniq[:6]}00", "source": "Meta"})
        assert r.status_code == 201, r.text
        d = r.json()
        lid = d.get("lead_id") or (d.get("lead") or {}).get("id")
        assert lid, f"no lead_id in webhook response: {d}"
