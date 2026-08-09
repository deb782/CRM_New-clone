"""Integrations Hub — Backend tests (iteration_28)

Covers:
- RBAC on GET /api/v1/integrations (admin=200, process_admin=200, sales BDE=403)
- Registry shape: 3 providers present with expected fields
- Save (PUT) + masking on subsequent GET (secret returned as ••••XXXX, has_value=true)
- Toggle guard: enable before configuration required fields => 422
- Toggle: enable AFTER configured => persists
- Live test-connection for Meta with fake creds => ok:false 422 (Meta rejected)
- Google Email + Mcube field definitions
- Cleanup at the end via TRUNCATE-equivalent DELETE
"""
import os
import time
import pytest
import requests

BASE = "http://localhost:8000"
API = f"{BASE}/api/v1"

ADMIN = ("admin@crm.local", "Admin@12345")
PROCESS = ("process@crm.local", "Demo@12345")
BDE = ("rahul@crm.local", "Demo@12345")


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text[:200]}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_tok():
    return _login(*ADMIN)


@pytest.fixture(scope="module")
def process_tok():
    # small stagger to avoid 60/min throttle bursts
    time.sleep(1)
    return _login(*PROCESS)


@pytest.fixture(scope="module")
def bde_tok():
    time.sleep(1)
    return _login(*BDE)


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Accept": "application/json"}


# -------------------- RBAC --------------------
class TestRBAC:
    def test_admin_can_list(self, admin_tok):
        r = requests.get(f"{API}/integrations", headers=_h(admin_tok))
        assert r.status_code == 200
        data = r.json().get("data", [])
        keys = [d["key"] for d in data]
        assert set(["meta_whatsapp", "google_email", "mcube"]).issubset(set(keys))

    def test_process_admin_can_list(self, process_tok):
        r = requests.get(f"{API}/integrations", headers=_h(process_tok))
        assert r.status_code == 200

    def test_bde_forbidden(self, bde_tok):
        r = requests.get(f"{API}/integrations", headers=_h(bde_tok))
        assert r.status_code == 403


# -------------------- Registry shape --------------------
class TestRegistryShape:
    def test_meta_fields(self, admin_tok):
        data = requests.get(f"{API}/integrations", headers=_h(admin_tok)).json()["data"]
        meta = next(d for d in data if d["key"] == "meta_whatsapp")
        keys = [f["key"] for f in meta["fields"]]
        for k in ["access_token", "phone_number_id", "waba_id", "verify_token", "app_secret"]:
            assert k in keys

    def test_google_fields(self, admin_tok):
        data = requests.get(f"{API}/integrations", headers=_h(admin_tok)).json()["data"]
        g = next(d for d in data if d["key"] == "google_email")
        keys = [f["key"] for f in g["fields"]]
        for k in ["host", "port", "username", "app_password", "from_name", "from_email"]:
            assert k in keys

    def test_mcube_fields(self, admin_tok):
        data = requests.get(f"{API}/integrations", headers=_h(admin_tok)).json()["data"]
        m = next(d for d in data if d["key"] == "mcube")
        keys = [f["key"] for f in m["fields"]]
        for k in ["base_url", "auth_token", "caller_id"]:
            assert k in keys


# -------------------- Save + Masking --------------------
class TestSaveAndMasking:
    def test_save_meta_and_mask(self, admin_tok):
        # Save
        payload = {"access_token": "EAAtestsecret1234", "phone_number_id": "9988776655"}
        r = requests.put(f"{API}/integrations/meta_whatsapp", headers=_h(admin_tok), json=payload)
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True

        # Reload & inspect
        data = requests.get(f"{API}/integrations", headers=_h(admin_tok)).json()["data"]
        meta = next(d for d in data if d["key"] == "meta_whatsapp")
        assert meta["configured"] is True

        f_by_key = {f["key"]: f for f in meta["fields"]}
        at = f_by_key["access_token"]
        assert at["has_value"] is True
        assert at["value"].startswith("••••"), f"expected masked, got {at['value']!r}"
        assert at["value"].endswith("1234")
        # Non-secret returned in the clear
        assert f_by_key["phone_number_id"]["value"] == "9988776655"
        assert f_by_key["phone_number_id"]["has_value"] is True

    def test_update_keeps_secret_when_blank(self, admin_tok):
        # Send empty access_token — must keep existing secret
        r = requests.put(f"{API}/integrations/meta_whatsapp", headers=_h(admin_tok),
                         json={"access_token": "", "phone_number_id": "9988776655"})
        assert r.status_code == 200
        data = requests.get(f"{API}/integrations", headers=_h(admin_tok)).json()["data"]
        meta = next(d for d in data if d["key"] == "meta_whatsapp")
        at = next(f for f in meta["fields"] if f["key"] == "access_token")
        assert at["has_value"] is True
        assert at["value"].endswith("1234")


# -------------------- Toggle guard --------------------
class TestToggleGuard:
    def test_toggle_unconfigured_blocked(self, admin_tok):
        r = requests.post(f"{API}/integrations/mcube/toggle", headers=_h(admin_tok),
                          json={"enabled": True})
        assert r.status_code == 422
        assert "Configure" in (r.json().get("message") or "")

    def test_toggle_configured_ok(self, admin_tok):
        # Meta was configured in the previous class
        r = requests.post(f"{API}/integrations/meta_whatsapp/toggle", headers=_h(admin_tok),
                          json={"enabled": True})
        assert r.status_code == 200
        assert r.json().get("enabled") is True
        # Disable back to avoid live paths
        requests.post(f"{API}/integrations/meta_whatsapp/toggle", headers=_h(admin_tok),
                      json={"enabled": False})


# -------------------- Live test (expected FAILURE) --------------------
class TestLiveMetaTest:
    def test_meta_test_fails_with_fake(self, admin_tok):
        r = requests.post(f"{API}/integrations/meta_whatsapp/test", headers=_h(admin_tok))
        # Live call to graph.facebook.com — with fake token should be 422
        assert r.status_code == 422, r.text
        body = r.json()
        assert body.get("ok") is False
        assert "Meta" in (body.get("message") or "") or "rejected" in (body.get("message") or "").lower() \
               or "token" in (body.get("message") or "").lower()

        # Card status should become 'error'
        data = requests.get(f"{API}/integrations", headers=_h(admin_tok)).json()["data"]
        meta = next(d for d in data if d["key"] == "meta_whatsapp")
        assert meta["status"] == "error"


# -------------------- Cleanup --------------------
class TestCleanup:
    def test_cleanup_rows(self, admin_tok):
        # Best-effort cleanup via API: revert configs by tinker-like path is unavailable via API.
        # We just record that main-agent instruction says: `Integration::query()->delete();`
        # Perform artisan tinker delete via shell for parity with the request.
        import subprocess
        subprocess.run(
            ["php", "artisan", "tinker",
             "--execute=\\App\\Models\\Integration::query()->delete();"],
            cwd="/app/laravel-crm", timeout=30, check=False,
        )
        # After cleanup, everything should be back to Not configured
        data = requests.get(f"{API}/integrations", headers=_h(admin_tok)).json()["data"]
        for d in data:
            assert d["configured"] is False
            assert d["enabled"] is False
            assert d["status"] is None
