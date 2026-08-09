"""Section T tests: Audit trail, System/Integration health, Search performance probe + RBAC."""
import uuid
import requests
import pytest

BASE = "http://127.0.0.1:8000"
API = f"{BASE}/api/v1"


def _hdr(token):
    return {"Authorization": f"Bearer {token}", "Accept": "application/json"}


@pytest.fixture(scope="module")
def mkt_token():
    r = requests.post(f"{API}/auth/login", json={"email": "marketing@crm.local", "password": "Demo@12345"})
    r.raise_for_status()
    return r.json()["token"]


# --- T1: Audit trail ---
class TestAuditLogs:
    def test_audit_index_shape(self, admin_token):
        r = requests.get(f"{API}/audit-logs?per_page=5", headers=_hdr(admin_token))
        assert r.status_code == 200, r.text
        data = r.json()
        assert "data" in data and "current_page" in data
        if data["data"]:
            row = data["data"][0]
            for k in ("created_at", "auditable_type", "auditable_id", "action"):
                assert k in row, f"missing {k} in audit row"

    def test_audit_generated_by_lead_action(self, admin_token):
        # create lead
        uniq = uuid.uuid4().hex[:8]
        payload = {"name": f"TEST_T_{uniq}", "email": f"tt_{uniq}@ex.com",
                   "phone": f"91100{uniq[:5]}", "source": "Website Form", "city": "Mumbai"}
        r = requests.post(f"{API}/leads", json=payload, headers=_hdr(admin_token))
        assert r.status_code in (200, 201), r.text
        lead = r.json().get("lead", r.json())
        lead_id = lead["id"]

        # qualify
        q = requests.post(f"{API}/leads/{lead_id}/qualify",
                          json={"budget_confirmed": True, "timeline_clear": True},
                          headers=_hdr(admin_token))
        assert q.status_code in (200, 201), q.text

        # query audit for this lead
        r = requests.get(f"{API}/audit-logs?auditable_type=Lead&auditable_id={lead_id}",
                         headers=_hdr(admin_token))
        assert r.status_code == 200
        rows = r.json()["data"]
        assert len(rows) > 0, "expected audit rows for lead action"
        # verify at least one is created action
        actions = {row["action"] for row in rows}
        assert any(a in actions for a in ("created", "status_changed", "updated", "qualified"))

    def test_audit_filter_action(self, admin_token):
        r = requests.get(f"{API}/audit-logs?action=status_changed", headers=_hdr(admin_token))
        assert r.status_code == 200
        rows = r.json()["data"]
        for row in rows:
            assert row["action"] == "status_changed"


# --- T2: System health ---
class TestSystemHealth:
    def test_health_shape(self, admin_token):
        r = requests.get(f"{API}/system/health", headers=_hdr(admin_token))
        assert r.status_code == 200, r.text
        d = r.json()
        assert "communications" in d and "automation" in d and "integrations" in d and "recent_errors" in d
        assert "total" in d["communications"] and "failed" in d["communications"]
        assert "by_status" in d["communications"] and "by_channel" in d["communications"]
        assert "total" in d["automation"] and "success" in d["automation"] and "failed" in d["automation"]

    def test_health_integrations_all_mock(self, admin_token):
        r = requests.get(f"{API}/system/health", headers=_hdr(admin_token))
        d = r.json()
        names = {i["name"] for i in d["integrations"]}
        expected = {"WhatsApp", "Telephony", "Email", "SMS", "Razorpay", "E-Sign"}
        assert expected.issubset(names), f"missing integrations: {expected - names}"
        for i in d["integrations"]:
            assert i["live"] is False, f"integration {i['name']} should be MOCK (live=false)"


# --- T3: Search performance ---
class TestPerformance:
    def test_performance_shape(self, admin_token):
        r = requests.get(f"{API}/system/performance?q=lead", headers=_hdr(admin_token))
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("total_leads", "search_term", "result_count", "elapsed_ms", "target_ms", "within_target"):
            assert k in d, f"missing {k}"
        assert d["target_ms"] == 2000
        assert d["search_term"] == "lead"
        assert d["within_target"] is True
        assert d["elapsed_ms"] < 2000


# --- T RBAC ---
class TestRbac:
    def test_marketing_can_access_all_three(self, mkt_token):
        for path in ("/audit-logs", "/system/health", "/system/performance?q=a"):
            r = requests.get(f"{API}{path}", headers=_hdr(mkt_token))
            assert r.status_code == 200, f"marketing failed on {path}: {r.status_code} {r.text[:200]}"

    def test_sales_exec_forbidden(self, exec_token):
        for path in ("/audit-logs", "/system/health", "/system/performance?q=a"):
            r = requests.get(f"{API}{path}", headers=_hdr(exec_token))
            assert r.status_code == 403, f"exec should be 403 on {path}, got {r.status_code}"
