"""
Section R2 + Automation Builder — acceptance tests.

Covers:
- Automation CRUD (index/store/update/destroy) + permission gating (config.manage)
- A newly created status.changed rule fires when a lead transitions to that stage
- R multiple stakeholders (add/delete, is_primary demotes others)
- R multiple interested units (dedup)
- R competing-project switch (updates lead.project_id + audit entry)
- R concurrency de-dup: parallel identical creates -> exactly one lead
- Duplicate FORCE still creates a new lead
"""
import os
import time
import uuid
import subprocess
import requests
import pytest
from concurrent.futures import ThreadPoolExecutor

BASE = os.environ.get("APP_URL", "http://127.0.0.1:8000")
API = f"{BASE}/api/v1"


def _auth(token):
    return {"Authorization": f"Bearer {token}", "Accept": "application/json"}


def _new_phone():
    # 10-digit unique phone
    return "9" + str(uuid.uuid4().int)[:9]


# -----------------------
# Automation CRUD
# -----------------------

class TestAutomationCRUD:
    def test_index_ok(self, admin_token):
        r = requests.get(f"{API}/automation-rules", headers=_auth(admin_token))
        assert r.status_code == 200
        assert "data" in r.json()

    def test_exec_forbidden_on_create(self, exec_token):
        payload = {
            "name": "TEST_R2_denied",
            "event": "status.changed",
            "conditions": {"to": "contacted"},
            "actions": [{"type": "create_task", "title": "x", "priority": "high", "due_in_hours": 24}],
            "active": True,
        }
        r = requests.post(f"{API}/automation-rules", json=payload, headers=_auth(exec_token))
        assert r.status_code == 403

    def test_crud_lifecycle(self, admin_token):
        uniq = uuid.uuid4().hex[:6]
        payload = {
            "name": f"TEST_R2_{uniq}",
            "event": "status.changed",
            "conditions": {"to": "contacted"},
            "actions": [{"type": "create_task", "title": f"Call {uniq}", "priority": "high", "due_in_hours": 24}],
            "active": True,
        }
        r = requests.post(f"{API}/automation-rules", json=payload, headers=_auth(admin_token))
        assert r.status_code == 201, r.text
        rule = r.json()["rule"]
        rid = rule["id"]
        assert rule["name"] == payload["name"]
        assert rule["event"] == "status.changed"

        # Update
        r = requests.put(
            f"{API}/automation-rules/{rid}",
            json={"name": f"TEST_R2_{uniq}_upd", "active": False},
            headers=_auth(admin_token),
        )
        assert r.status_code == 200, r.text
        assert r.json()["rule"]["name"].endswith("_upd")
        assert r.json()["rule"]["active"] in (False, 0)

        # Ensure appears in list
        r = requests.get(f"{API}/automation-rules", headers=_auth(admin_token))
        ids = [x["id"] for x in r.json()["data"]]
        assert rid in ids

        # Delete
        r = requests.delete(f"{API}/automation-rules/{rid}", headers=_auth(admin_token))
        assert r.status_code == 200
        r = requests.get(f"{API}/automation-rules", headers=_auth(admin_token))
        ids = [x["id"] for x in r.json()["data"]]
        assert rid not in ids

    def test_created_rule_fires_on_status_change(self, admin_token):
        uniq = uuid.uuid4().hex[:6]
        # 1. Create a status.changed rule to 'contacted' with create_task
        rule_payload = {
            "name": f"TEST_R2_fire_{uniq}",
            "event": "status.changed",
            "conditions": {"to": "contacted"},
            "actions": [{"type": "create_task", "title": f"AutoTask {uniq}", "priority": "high", "due_in_hours": 24}],
            "active": True,
        }
        r = requests.post(f"{API}/automation-rules", json=rule_payload, headers=_auth(admin_token))
        assert r.status_code == 201, r.text
        rid = r.json()["rule"]["id"]

        try:
            # 2. Create a lead
            lead_payload = {
                "name": f"TEST_R2_FireLead_{uniq}",
                "email": f"fire_{uniq}@example.com",
                "phone": _new_phone(),
                "source": "Website Form",
            }
            r = requests.post(f"{API}/leads", json=lead_payload, headers=_auth(admin_token))
            assert r.status_code == 201, r.text
            lead_id = r.json()["lead"]["id"]

            # baseline task count for lead
            r = requests.get(f"{API}/tasks", params={"lead_id": lead_id, "per_page": 100}, headers=_auth(admin_token))
            base_count = len(r.json().get("data", r.json()))

            # 3. Transition to contacted
            r = requests.post(
                f"{API}/leads/{lead_id}/transition",
                json={"stage": "contacted", "reason": "test"},
                headers=_auth(admin_token),
            )
            assert r.status_code == 200, r.text

            time.sleep(1)

            # 4. Verify automation log
            r = requests.get(
                f"{API}/automation-logs",
                params={"lead_id": lead_id, "per_page": 50},
                headers=_auth(admin_token),
            )
            assert r.status_code == 200
            logs = r.json().get("data", [])
            matched = [l for l in logs if l.get("rule_id") == rid]
            assert matched, f"No automation log for rule {rid}, logs={logs}"

            # 5. Verify task created with our title
            r = requests.get(f"{API}/tasks", params={"lead_id": lead_id, "per_page": 100}, headers=_auth(admin_token))
            tasks = r.json().get("data", r.json())
            auto_tasks = [t for t in tasks if f"AutoTask {uniq}" in (t.get("title") or "")]
            assert auto_tasks, f"AutoTask not created. Tasks={[t.get('title') for t in tasks]}"
        finally:
            requests.delete(f"{API}/automation-rules/{rid}", headers=_auth(admin_token))


# -----------------------
# R Stakeholders / Units / Switch-project
# -----------------------

@pytest.fixture
def fresh_lead(admin_token):
    uniq = uuid.uuid4().hex[:6]
    payload = {
        "name": f"TEST_R2_{uniq}",
        "email": f"r2_{uniq}@example.com",
        "phone": _new_phone(),
        "source": "Website Form",
    }
    r = requests.post(f"{API}/leads", json=payload, headers=_auth(admin_token))
    r.raise_for_status()
    return r.json()["lead"]


class TestStakeholders:
    def test_add_and_primary_demotes(self, admin_token, fresh_lead):
        lid = fresh_lead["id"]
        # add first
        r = requests.post(f"{API}/leads/{lid}/stakeholders",
                          json={"name": "Wife", "role": "spouse", "phone": "9111111111", "is_primary": True},
                          headers=_auth(admin_token))
        assert r.status_code == 200, r.text
        assert len(r.json()["lead"]["stakeholders"]) == 1
        assert r.json()["lead"]["stakeholders"][0]["is_primary"] in (True, 1)

        # add second primary — demotes first
        r = requests.post(f"{API}/leads/{lid}/stakeholders",
                          json={"name": "Father", "role": "family", "phone": "9222222222", "is_primary": True},
                          headers=_auth(admin_token))
        assert r.status_code == 200, r.text
        stk = r.json()["lead"]["stakeholders"]
        assert len(stk) == 2
        primary_flags = [bool(s.get("is_primary")) for s in stk]
        assert primary_flags.count(True) == 1
        assert bool(stk[1]["is_primary"]) is True
        assert bool(stk[0]["is_primary"]) is False

    def test_remove_by_index(self, admin_token, fresh_lead):
        lid = fresh_lead["id"]
        for n in ["A", "B", "C"]:
            requests.post(f"{API}/leads/{lid}/stakeholders",
                          json={"name": n, "role": "family", "phone": "9000000000"},
                          headers=_auth(admin_token))
        r = requests.delete(f"{API}/leads/{lid}/stakeholders/1", headers=_auth(admin_token))
        assert r.status_code == 200, r.text
        stk = r.json()["lead"]["stakeholders"]
        assert len(stk) == 2
        names = [s["name"] for s in stk]
        assert names == ["A", "C"]

    def test_exec_can_add_stakeholder(self, exec_token, admin_token, fresh_lead):
        # sales exec has leads.edit
        lid = fresh_lead["id"]
        r = requests.post(f"{API}/leads/{lid}/stakeholders",
                          json={"name": "Rahul added", "role": "spouse", "phone": "9333333333"},
                          headers=_auth(exec_token))
        assert r.status_code == 200, r.text


class TestInterestedUnits:
    def test_set_and_dedup(self, admin_token, fresh_lead):
        lid = fresh_lead["id"]
        r = requests.post(f"{API}/leads/{lid}/interested-units",
                          json={"units": ["A-101", "A-102", "A-101", "B-201"]},
                          headers=_auth(admin_token))
        assert r.status_code == 200, r.text
        units = r.json()["lead"]["interested_units"]
        assert sorted(units) == sorted(["A-101", "A-102", "B-201"])


class TestSwitchProject:
    def test_switch_project_updates_and_audits(self, admin_token, fresh_lead):
        lid = fresh_lead["id"]
        # Get project list
        r = requests.get(f"{API}/projects", headers=_auth(admin_token))
        assert r.status_code == 200
        projects = r.json().get("data", r.json())
        assert len(projects) >= 2, "Need 2+ projects seeded"
        target_pid = None
        current = fresh_lead.get("project_id")
        for p in projects:
            if p["id"] != current:
                target_pid = p["id"]
                break
        assert target_pid

        r = requests.post(f"{API}/leads/{lid}/switch-project",
                          json={"project_id": target_pid, "reason": "competitor switch"},
                          headers=_auth(admin_token))
        assert r.status_code == 200, r.text
        assert r.json()["lead"]["project_id"] == target_pid

        # Verify audit/activity via lead show
        r = requests.get(f"{API}/leads/{lid}", headers=_auth(admin_token))
        tl = r.json().get("timeline", [])
        assert any("switch" in (t.get("title") or "").lower() or "switch" in (t.get("description") or "").lower()
                   for t in tl), f"No switch activity in timeline: {tl}"


# -----------------------
# Concurrency de-dup + force
# -----------------------

class TestConcurrencyDedup:
    def test_parallel_identical_creates_collapse_to_one(self, admin_token):
        phone = _new_phone()
        uniq = uuid.uuid4().hex[:6]
        payload = {
            "name": f"TEST_R2_race_{uniq}",
            "email": f"race_{uniq}@example.com",
            "phone": phone,
            "source": "Website Form",
        }
        headers = _auth(admin_token)

        def _fire():
            try:
                return requests.post(f"{API}/leads", json=payload, headers=headers, timeout=15)
            except Exception as e:
                return e

        with ThreadPoolExecutor(max_workers=8) as ex:
            futures = [ex.submit(_fire) for _ in range(8)]
            results = [f.result() for f in futures]

        codes = [getattr(r, "status_code", None) for r in results]
        # Expect exactly 1 x 201, rest 409 (or same lead resolution)
        created = [r for r in results if getattr(r, "status_code", None) == 201]
        assert len(created) == 1, f"Expected 1 create, got {len(created)}. Codes={codes}"

        # Confirm DB has exactly one lead with this phone
        r = requests.get(f"{API}/leads", params={"search": phone, "per_page": 25}, headers=headers)
        assert r.status_code == 200
        data = r.json().get("data", [])
        matched = [l for l in data if l.get("phone") == phone]
        assert len(matched) == 1, f"Expected 1 lead in DB, got {len(matched)}"

    def test_sequential_duplicate_blocked(self, admin_token):
        phone = _new_phone()
        uniq = uuid.uuid4().hex[:6]
        payload = {
            "name": f"TEST_R2_seq_{uniq}",
            "email": f"seq_{uniq}@example.com",
            "phone": phone,
            "source": "Website Form",
        }
        h = _auth(admin_token)
        r1 = requests.post(f"{API}/leads", json=payload, headers=h)
        assert r1.status_code == 201, r1.text
        r2 = requests.post(f"{API}/leads", json=payload, headers=h)
        assert r2.status_code == 409, r2.text  # duplicate blocked

    def test_force_duplicate_creates_new(self, admin_token):
        phone = _new_phone()
        uniq = uuid.uuid4().hex[:6]
        payload = {
            "name": f"TEST_R2_force_{uniq}",
            "email": f"force_{uniq}@example.com",
            "phone": phone,
            "source": "Website Form",
        }
        h = _auth(admin_token)
        r1 = requests.post(f"{API}/leads", json=payload, headers=h)
        assert r1.status_code == 201, r1.text
        lead1_id = r1.json()["lead"]["id"]

        # Force create with same phone
        forced = dict(payload, force=True, name=payload["name"] + "_2")
        r2 = requests.post(f"{API}/leads", json=forced, headers=h)
        assert r2.status_code == 201, f"Force create should succeed: {r2.status_code} {r2.text}"
        lead2_id = r2.json()["lead"]["id"]
        assert lead1_id != lead2_id
