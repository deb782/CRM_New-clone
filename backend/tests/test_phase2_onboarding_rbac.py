"""
Phase 2 tests:
  - Department-user provisioning (temp_password=phone, must_change_password, mocked email)
  - Forced password change gate (409 code=password_change_required)
  - Change password unlocks the app
  - Preview Roles / impersonate (super admin only)
  - Onboarding wizard state (GET/PUT)
  - RBAC regression from Phase 1
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
    if r.status_code != 200:
        raise AssertionError(f"login failed {r.status_code}: {r.text}")
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_tok():
    return _login("admin@crm.local", "Admin@12345")


@pytest.fixture(scope="module")
def bde_role_id(admin_tok):
    r = requests.get(f"{API}/roles", headers=_hdr(admin_tok))
    r.raise_for_status()
    for role in r.json()["data"]:
        if role["slug"] == "sales_bde":
            return role["id"]
    pytest.skip("bde role not found")


# ---------- Onboarding endpoint ----------
class TestOnboarding:
    def test_get_state(self, admin_tok):
        r = requests.get(f"{API}/onboarding", headers=_hdr(admin_tok))
        assert r.status_code == 200
        d = r.json()
        for k in ("setup_choice", "completed", "steps", "progress", "signals"):
            assert k in d
        for step in ["profile", "projects", "users", "inventory", "process_admin"]:
            assert step in d["steps"]
        assert "pct" in d["progress"]

    def test_put_setup_choice_later(self, admin_tok):
        r = requests.put(f"{API}/onboarding", json={"setup_choice": "later"}, headers=_hdr(admin_tok))
        assert r.status_code == 200, r.text
        assert r.json()["setup_choice"] == "later"

    def test_put_step_marking(self, admin_tok):
        r = requests.put(f"{API}/onboarding", json={"step": "profile", "value": True}, headers=_hdr(admin_tok))
        assert r.status_code == 200
        assert r.json()["steps"]["profile"] is True


# ---------- Provisioning ----------
class TestProvisioning:
    def test_full_provisioning_and_force_change_flow(self, admin_tok, bde_role_id):
        uniq = uuid.uuid4().hex[:8]
        email = f"TEST_prov_{uniq}@example.com"
        phone = f"9{uuid.uuid4().int % 10**9:09d}"
        payload = {"name": f"TEST User {uniq}", "email": email, "phone": phone, "role_id": bde_role_id}
        r = requests.post(f"{API}/users", json=payload, headers=_hdr(admin_tok))
        assert r.status_code == 201, r.text
        d = r.json()
        assert d["temp_password"] == phone
        assert d["email_status"] == "mocked"
        assert "credential_text" in d and phone in d["credential_text"]
        assert d["user"]["email"] == email

        rl = requests.get(f"{API}/users", headers=_hdr(admin_tok))
        assert rl.status_code == 200
        assert any(u["email"] == email for u in rl.json()["data"])

        # Login as new user with phone as password
        tok = _login(email, phone)
        r = requests.get(f"{API}/me", headers=_hdr(tok))
        assert r.status_code == 200
        assert r.json()["user"]["must_change_password"] is True

        # Force-change gate blocks other endpoints
        r = requests.get(f"{API}/dashboard", headers=_hdr(tok))
        assert r.status_code == 409, r.text
        assert r.json().get("code") == "password_change_required"

        # onboarding also gated
        r = requests.get(f"{API}/onboarding", headers=_hdr(tok))
        assert r.status_code == 409

        # Change password (no current-password required on forced flow)
        new_pw = "NewPass@2026"
        r = requests.post(
            f"{API}/auth/change-password",
            json={"new_password": new_pw, "new_password_confirmation": new_pw},
            headers=_hdr(tok),
        )
        assert r.status_code == 200, r.text
        assert r.json()["user"]["must_change_password"] is False

        # After change, gated endpoint reachable
        r = requests.get(f"{API}/dashboard", headers=_hdr(tok))
        assert r.status_code == 200

        # Old password no longer works
        rl2 = requests.post(f"{API}/auth/login", json={"email": email, "password": phone})
        assert rl2.status_code in (401, 422)


# ---------- Impersonation ----------
class TestImpersonate:
    def test_super_admin_can_impersonate_and_get_target_user(self, admin_tok):
        # find a BDE user
        r = requests.get(f"{API}/users", headers=_hdr(admin_tok))
        assert r.status_code == 200
        target = next((u for u in r.json()["data"] if u.get("email") == "rahul@crm.local"), None)
        assert target, "expected seed user rahul"
        r = requests.post(f"{API}/auth/impersonate", json={"user_id": target["id"]}, headers=_hdr(admin_tok))
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["user"]["email"] == "rahul@crm.local"
        # token works
        r2 = requests.get(f"{API}/me", headers=_hdr(d["token"]))
        assert r2.status_code == 200
        assert r2.json()["user"]["email"] == "rahul@crm.local"

    def test_non_admin_cannot_impersonate(self):
        tok = _login("priya@crm.local", "Demo@12345")
        # need a user id -> use /me id itself is fine; but users list needs perm; just try id=1
        r = requests.post(f"{API}/auth/impersonate", json={"user_id": 1}, headers=_hdr(tok))
        assert r.status_code == 403, r.text

    def test_channel_partner_cannot_impersonate(self):
        tok = _login("partner@crm.local", "Demo@12345")
        r = requests.post(f"{API}/auth/impersonate", json={"user_id": 1}, headers=_hdr(tok))
        assert r.status_code == 403


# ---------- Phase 1 RBAC regression ----------
class TestRbacRegression:
    def _seed_lead(self, admin_tok):
        uniq = uuid.uuid4().hex[:6]
        r = requests.post(
            f"{API}/leads",
            json={"name": f"TEST_reg_{uniq}", "email": f"reg_{uniq}@ex.com",
                  "phone": f"9{uuid.uuid4().int % 10**9:09d}", "source": "Website Form", "city": "Mumbai"},
            headers=_hdr(admin_tok),
        )
        r.raise_for_status()
        j = r.json()
        return (j.get("lead") or j)["id"]

    def test_accounts_support_cannot_edit_lead(self, admin_tok):
        lead_id = self._seed_lead(admin_tok)
        tok = _login("accounts@crm.local", "Demo@12345")
        r = requests.put(f"{API}/leads/{lead_id}", json={"city": "Delhi"}, headers=_hdr(tok))
        assert r.status_code == 403, r.text

    def test_sales_head_can_edit_lead(self, admin_tok):
        lead_id = self._seed_lead(admin_tok)
        tok = _login("priya@crm.local", "Demo@12345")
        r = requests.put(f"{API}/leads/{lead_id}", json={"city": "Delhi"}, headers=_hdr(tok))
        assert r.status_code == 200, r.text

    def test_partner_leads_forbidden_portal_ok(self):
        tok = _login("partner@crm.local", "Demo@12345")
        r1 = requests.get(f"{API}/leads", headers=_hdr(tok))
        assert r1.status_code == 403
        r2 = requests.get(f"{API}/partner/portal", headers=_hdr(tok))
        assert r2.status_code == 200
