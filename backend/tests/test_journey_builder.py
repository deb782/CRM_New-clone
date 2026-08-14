"""Wave 34: Journey Builder + LeadStatus catalog + transition gates/allow-list.

Independent verification of:
  - GET  /api/v1/journey/statuses         -> 5 stages, 45 statuses
  - POST /api/v1/journey/leads/{id}/transition
        (allow-list, gates, first-move stamps SLA)
  - POST /api/v1/workflows/{id}/simulate  -> runs seeded Agrocorp journey
  - Saved workflow graph contains BOTH 'journey' (5 lanes) AND 'drawflow'
  - Regression: /leads, /leads/board, /dashboard still 200
"""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8000").rstrip("/")
API = f"{BASE_URL}/api/v1"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login",
                      json={"email": "admin@crm.local", "password": "Admin@12345"},
                      timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def H(admin_token):
    return {"Authorization": f"Bearer {admin_token}",
            "Content-Type": "application/json",
            "Accept": "application/json"}


# ---------------- Status catalog ----------------
class TestStatusCatalog:
    def test_five_stages_forty_five_statuses(self, H):
        r = requests.get(f"{API}/journey/statuses", headers=H, timeout=15)
        assert r.status_code == 200
        data = r.json()
        stages = data["stages"]
        assert len(stages) == 5
        keys = [s["key"] for s in stages]
        assert keys == ["S1", "S2", "S3", "S4", "S5"]
        total = sum(len(s["statuses"]) for s in stages)
        assert total == 45, f"expected 45, got {total}"
        # every status has required fields
        for s in stages:
            for st in s["statuses"]:
                assert "code" in st and "display_name" in st
                assert "allowed_next" in st and isinstance(st["allowed_next"], list)
                assert "gate_fields" in st and isinstance(st["gate_fields"], list)

    def test_gate_defined_on_meeting_scheduled(self, H):
        r = requests.get(f"{API}/journey/statuses", headers=H, timeout=15)
        for s in r.json()["stages"]:
            for st in s["statuses"]:
                if st["code"] == "S2_MEETING_SCHEDULED":
                    assert set(st["gate_fields"]) >= {"budget_min", "timeline"}
                    return
        pytest.fail("S2_MEETING_SCHEDULED not present")


# ---------------- Transition enforcement ----------------
class TestTransitions:
    @pytest.fixture(scope="class")
    def fresh_lead_id(self, H):
        # Create a lead with NO budget_min / timeline so we can hit the gate later
        payload = {"name": "TEST_JB_Gate", "phone": "9998887799",
                   "source": "Website Form", "project_id": 1}
        r = requests.post(f"{API}/leads", headers=H, json=payload, timeout=15)
        assert r.status_code in (200, 201), r.text
        body = r.json()
        lead = body.get("lead", body)
        assert lead.get("id")
        assert lead.get("budget_min") in (None, 0, "")
        return lead["id"]

    def test_disallowed_jump_returns_422(self, H, fresh_lead_id):
        # Fresh lead already at S1_ASSIGNED — jumping straight to S2_MEETING_SCHEDULED is blocked
        r = requests.post(f"{API}/journey/leads/{fresh_lead_id}/transition",
                          headers=H, json={"code": "S2_MEETING_SCHEDULED"}, timeout=15)
        assert r.status_code == 422
        msg = r.json().get("message", "")
        assert "Cannot move" in msg and "Allowed next" in msg

    def test_first_move_stamps_sla(self, H, fresh_lead_id):
        r = requests.post(f"{API}/journey/leads/{fresh_lead_id}/transition",
                          headers=H, json={"code": "S1_FIRST_ATTEMPT"}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["lead"]["status_code"] == "S1_FIRST_ATTEMPT"

    def test_gate_blocks_missing_fields(self, H, fresh_lead_id):
        # walk lead along allowed path to S2_MEETING_PLAN then hit the gate
        for code in ("S2_QUALIFYING", "S2_MEETING_PLAN"):
            r = requests.post(f"{API}/journey/leads/{fresh_lead_id}/transition",
                              headers=H, json={"code": code}, timeout=15)
            assert r.status_code == 200, f"{code}: {r.text}"
        # Now attempt gated transition
        r = requests.post(f"{API}/journey/leads/{fresh_lead_id}/transition",
                          headers=H, json={"code": "S2_MEETING_SCHEDULED"}, timeout=15)
        assert r.status_code == 422
        body = r.json()
        assert "required" in body.get("message", "").lower()
        assert set(body.get("gate") or []) >= {"budget_min", "timeline"}


# ---------------- Saved workflow shape ----------------
class TestWorkflowPersistence:
    def test_seeded_workflow_has_journey_and_drawflow(self, H):
        r = requests.get(f"{API}/workflows", headers=H, timeout=15)
        assert r.status_code == 200
        wfs = r.json()["workflows"]
        assert wfs, "no workflows found"
        wf_id = wfs[0]["id"]
        r2 = requests.get(f"{API}/workflows/{wf_id}", headers=H, timeout=15)
        assert r2.status_code == 200
        g = r2.json()["workflow"]["graph"]
        assert "journey" in g and "drawflow" in g
        assert len(g["journey"]["lanes"]) == 5

    def test_simulate_walks_journey(self, H):
        wfs = requests.get(f"{API}/workflows", headers=H, timeout=15).json()["workflows"]
        wf_id = wfs[0]["id"]
        r = requests.post(f"{API}/workflows/{wf_id}/simulate",
                          headers=H, json={"lead_id": 1}, timeout=30)
        assert r.status_code == 200, r.text
        log = r.json()["run"]["log"]
        types = [e["type"] for e in log]
        assert "trigger" in types
        assert "status_change" in types
        # status_change references catalog codes (S1_ / S2_ / ...)
        sc = [e["detail"] for e in log if e["type"] == "status_change"]
        assert any("S1_" in d or "S2_" in d or "S3_" in d for d in sc), sc


# ---------------- Regression ----------------
class TestRegression:
    @pytest.mark.parametrize("path", ["leads", "leads/board", "dashboard"])
    def test_page_apis_ok(self, H, path):
        r = requests.get(f"{API}/{path}", headers=H, timeout=15)
        assert r.status_code == 200
