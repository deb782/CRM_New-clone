"""
Phase 3 tests:
- Workflow builder RBAC (workflow.manage): admin + process_admin allowed, sales_head 403
- Workflow CRUD + activate + tally counts (whatsapp/email/task/trigger/condition/fallback)
- Onboarding reset (config.manage): admin ok, non-config forbidden
- Regression: Phase 2 forced-password-change + impersonation + Phase 1 RBAC subset
"""
import uuid
import requests
import pytest

BASE = "http://127.0.0.1:8000"
API = f"{BASE}/api/v1"


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}", "Accept": "application/json"}


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=10)
    assert r.status_code == 200, f"login {email} failed {r.status_code}: {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_tok():
    return _login("admin@crm.local", "Admin@12345")


@pytest.fixture(scope="module")
def process_tok():
    return _login("process@crm.local", "Demo@12345")


@pytest.fixture(scope="module")
def sales_head_tok():
    return _login("priya@crm.local", "Demo@12345")


@pytest.fixture(scope="module")
def accounts_tok():
    return _login("accounts@crm.local", "Demo@12345")


@pytest.fixture(scope="module")
def partner_tok():
    return _login("partner@crm.local", "Demo@12345")


def _sample_graph(nodes_spec):
    """Build a minimal Drawflow-shaped graph. nodes_spec is list of type strings."""
    data = {}
    for i, t in enumerate(nodes_spec, start=1):
        data[str(i)] = {
            "id": i,
            "name": t,
            "data": {"node_type": t},
            "class": t,
            "html": "<div>node</div>",
            "typenode": False,
            "inputs": {}, "outputs": {},
            "pos_x": 100 * i, "pos_y": 100,
        }
    return {"drawflow": {"Home": {"data": data}}}


class TestWorkflowRBAC:
    def test_process_admin_can_list(self, process_tok):
        r = requests.get(f"{API}/workflows", headers=_hdr(process_tok))
        assert r.status_code == 200, r.text
        assert "workflows" in r.json()

    def test_admin_can_list(self, admin_tok):
        r = requests.get(f"{API}/workflows", headers=_hdr(admin_tok))
        assert r.status_code == 200

    def test_sales_head_forbidden_list(self, sales_head_tok):
        r = requests.get(f"{API}/workflows", headers=_hdr(sales_head_tok))
        assert r.status_code == 403, r.text

    def test_sales_head_forbidden_create(self, sales_head_tok):
        r = requests.post(f"{API}/workflows", json={"name": "x"}, headers=_hdr(sales_head_tok))
        assert r.status_code == 403

    def test_partner_forbidden(self, partner_tok):
        r = requests.get(f"{API}/workflows", headers=_hdr(partner_tok))
        assert r.status_code == 403


class TestWorkflowCrudAndTally:
    def test_create_with_tally(self, process_tok):
        graph = _sample_graph(["trigger", "send_whatsapp", "send_whatsapp", "send_email", "condition", "task", "fallback"])
        payload = {"name": f"TEST_wf_{uuid.uuid4().hex[:6]}", "description": "phase3", "graph": graph}
        r = requests.post(f"{API}/workflows", json=payload, headers=_hdr(process_tok))
        assert r.status_code == 201, r.text
        wf = r.json()["workflow"]
        assert wf["name"] == payload["name"]
        t = wf["tally"]
        assert t["whatsapp"] == 2
        assert t["email"] == 1
        assert t["task"] == 1
        assert t["triggers"] == 1
        assert t["conditions"] == 1
        assert t["fallbacks"] == 1
        assert t["nodes"] == 7
        assert wf.get("status") in (None, "draft")

        # persistence: GET back
        wid = wf["id"]
        r2 = requests.get(f"{API}/workflows/{wid}", headers=_hdr(process_tok))
        assert r2.status_code == 200
        assert r2.json()["workflow"]["tally"]["whatsapp"] == 2

        # update recomputes tally
        new_graph = _sample_graph(["trigger", "send_whatsapp"])
        r3 = requests.put(f"{API}/workflows/{wid}", json={"name": payload["name"], "graph": new_graph}, headers=_hdr(process_tok))
        assert r3.status_code == 200, r3.text
        assert r3.json()["workflow"]["tally"]["whatsapp"] == 1
        assert r3.json()["workflow"]["tally"]["nodes"] == 2

        # activate
        r4 = requests.post(f"{API}/workflows/{wid}/activate", headers=_hdr(process_tok))
        assert r4.status_code == 200, r4.text
        assert r4.json()["workflow"]["status"] == "active"

        # cleanup
        rd = requests.delete(f"{API}/workflows/{wid}", headers=_hdr(process_tok))
        assert rd.status_code == 200

    def test_admin_can_activate_and_delete(self, admin_tok):
        graph = _sample_graph(["trigger", "send_email"])
        r = requests.post(f"{API}/workflows", json={"name": f"TEST_wf_a_{uuid.uuid4().hex[:6]}", "graph": graph}, headers=_hdr(admin_tok))
        assert r.status_code == 201
        wid = r.json()["workflow"]["id"]
        r2 = requests.post(f"{API}/workflows/{wid}/activate", headers=_hdr(admin_tok))
        assert r2.status_code == 200
        assert r2.json()["workflow"]["status"] == "active"
        rd = requests.delete(f"{API}/workflows/{wid}", headers=_hdr(admin_tok))
        assert rd.status_code == 200

    def test_validation_name_required(self, process_tok):
        r = requests.post(f"{API}/workflows", json={"graph": {}}, headers=_hdr(process_tok))
        assert r.status_code == 422


class TestOnboardingReset:
    def test_admin_can_reset(self, admin_tok):
        r = requests.post(f"{API}/onboarding/reset", headers=_hdr(admin_tok))
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True

    def test_process_admin_can_reset(self, process_tok):
        # process_admin has config.manage
        r = requests.post(f"{API}/onboarding/reset", headers=_hdr(process_tok))
        assert r.status_code == 200, r.text

    def test_sales_head_cannot_reset(self, sales_head_tok):
        r = requests.post(f"{API}/onboarding/reset", headers=_hdr(sales_head_tok))
        assert r.status_code == 403, r.text

    def test_accounts_support_cannot_reset(self, accounts_tok):
        r = requests.post(f"{API}/onboarding/reset", headers=_hdr(accounts_tok))
        assert r.status_code == 403


class TestRegressionPhase12:
    def test_partner_leads_forbidden(self, partner_tok):
        r = requests.get(f"{API}/leads", headers=_hdr(partner_tok))
        assert r.status_code == 403

    def test_accounts_support_cannot_edit_lead(self, admin_tok, accounts_tok):
        # create a lead first
        uniq = uuid.uuid4().hex[:6]
        rc = requests.post(f"{API}/leads", json={
            "name": f"TEST_p3_{uniq}", "email": f"p3_{uniq}@ex.com",
            "phone": f"9{uuid.uuid4().int % 10**9:09d}", "source": "Website Form", "city": "Mumbai"
        }, headers=_hdr(admin_tok))
        assert rc.status_code in (200, 201), rc.text
        lead = rc.json().get("lead") or rc.json()
        lid = lead["id"]
        r = requests.put(f"{API}/leads/{lid}", json={"city": "Delhi"}, headers=_hdr(accounts_tok))
        assert r.status_code == 403

    def test_sales_head_can_edit_lead(self, admin_tok, sales_head_tok):
        uniq = uuid.uuid4().hex[:6]
        rc = requests.post(f"{API}/leads", json={
            "name": f"TEST_p3_{uniq}", "email": f"p3_{uniq}@ex.com",
            "phone": f"9{uuid.uuid4().int % 10**9:09d}", "source": "Website Form", "city": "Mumbai"
        }, headers=_hdr(admin_tok))
        assert rc.status_code in (200, 201)
        lid = (rc.json().get("lead") or rc.json())["id"]
        r = requests.put(f"{API}/leads/{lid}", json={"city": "Delhi"}, headers=_hdr(sales_head_tok))
        assert r.status_code == 200, r.text

    def test_force_password_change_still_works(self, admin_tok):
        # Provision a user, they must get 409 on /dashboard until change-password
        # get bde role
        r = requests.get(f"{API}/roles", headers=_hdr(admin_tok))
        assert r.status_code == 200
        bde = next((x for x in r.json()["data"] if x["slug"] == "sales_bde"), None)
        assert bde
        uniq = uuid.uuid4().hex[:8]
        email = f"TEST_p3fpw_{uniq}@ex.com"
        phone = f"9{uuid.uuid4().int % 10**9:09d}"
        rc = requests.post(f"{API}/users", json={
            "name": f"TEST_p3fpw_{uniq}", "email": email, "phone": phone, "role_id": bde["id"]
        }, headers=_hdr(admin_tok))
        assert rc.status_code == 201, rc.text
        tok = _login(email, phone)
        r2 = requests.get(f"{API}/dashboard", headers=_hdr(tok))
        assert r2.status_code == 409
        assert r2.json().get("code") == "password_change_required"

    def test_impersonate_admin_only(self, sales_head_tok):
        r = requests.post(f"{API}/auth/impersonate", json={"user_id": 1}, headers=_hdr(sales_head_tok))
        assert r.status_code == 403
