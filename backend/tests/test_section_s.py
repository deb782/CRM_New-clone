"""Section S — Event/SLA Automation-Trigger Acceptance Tests.

Verifies:
- Lifecycle events (lead.created + status.changed:*) fire the seeded AutomationRules,
  creating the correct tasks and message logs.
- SLA breach escalation via `php artisan crm:reminders` reassigns overdue verify
  and follow_up tasks to the Sales Manager (priya@crm.local).
"""
import os
import subprocess
import uuid
import requests
import pytest

BASE = "http://127.0.0.1:8000"
API = f"{BASE}/api/v1"
LARAVEL_DIR = "/app/laravel-crm"

MANAGER_EMAIL = "priya@crm.local"


# ---------- Helpers ----------

def _h(token):
    return {"Authorization": f"Bearer {token}", "Accept": "application/json"}


def _create_lead(admin_token, **overrides):
    uniq = uuid.uuid4().hex[:8]
    payload = {
        "name": f"TEST_S_{uniq}",
        "email": f"test_s_{uniq}@example.com",
        "phone": f"90000{uniq[:5]}",
        "source": "Website Form",
        "city": "Mumbai",
    }
    payload.update(overrides)
    r = requests.post(f"{API}/leads", json=payload, headers=_h(admin_token), timeout=15)
    assert r.status_code == 201, f"Lead create failed: {r.status_code} {r.text}"
    return r.json()["lead"]


def _transition(admin_token, lead_id, stage):
    r = requests.post(f"{API}/leads/{lead_id}/transition", json={"stage": stage},
                      headers=_h(admin_token), timeout=15)
    assert r.status_code == 200, f"Transition->{stage} failed: {r.status_code} {r.text}"
    return r.json()["lead"]


def _logs_for_lead(admin_token, lead_id, per_page=200):
    # AutomationLog listing (no server-side lead filter); paginate & filter here.
    r = requests.get(f"{API}/automation-logs?per_page={per_page}",
                     headers=_h(admin_token), timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    items = data.get("data", data)
    return [x for x in items if x.get("lead_id") == lead_id]


def _tasks_for_lead(admin_token, lead_id, ttype=None):
    url = f"{API}/tasks?lead_id={lead_id}&per_page=100"
    if ttype:
        url += f"&type={ttype}"
    r = requests.get(url, headers=_h(admin_token), timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    return data.get("data", data)


def _manager_id(admin_token):
    r = requests.get(f"{API}/users", headers=_h(admin_token), timeout=15)
    assert r.status_code == 200, r.text
    users = r.json()
    users = users.get("data", users)
    for u in users:
        if u.get("email") == MANAGER_EMAIL:
            return u["id"]
    pytest.fail(f"Manager {MANAGER_EMAIL} not found")


def _run_reminders():
    p = subprocess.run(["php", "artisan", "crm:reminders"], cwd=LARAVEL_DIR,
                       capture_output=True, text=True, timeout=90)
    assert p.returncode == 0, f"crm:reminders failed: {p.stdout}\n{p.stderr}"
    return p.stdout


def _tinker(php):
    p = subprocess.run(["php", "artisan", "tinker", f"--execute={php}"],
                       cwd=LARAVEL_DIR, capture_output=True, text=True, timeout=60)
    assert p.returncode == 0, f"tinker failed: {p.stdout}\n{p.stderr}"
    return p.stdout


# ============================================================
# Event: lead.created
# ============================================================
class TestLeadCreatedEvent:
    def test_lead_created_fires_welcome_whatsapp_and_verify_task(self, admin_token):
        lead = _create_lead(admin_token)

        logs = _logs_for_lead(admin_token, lead["id"])
        # send_whatsapp log from 'Welcome on capture' rule
        wa = [l for l in logs if l["event"] == "lead.created" and l["action"] == "send_whatsapp"]
        assert wa, f"No send_whatsapp log for lead.created. Logs: {logs}"
        assert wa[0]["status"] == "success", f"Rule failed: {wa[0]}"

        # No failed logs at all for this lead
        failed = [l for l in logs if l["status"] == "failed"]
        assert not failed, f"Unexpected failed automation logs: {failed}"

        # Verify task auto-created by LeadService (C1.1)
        vtasks = _tasks_for_lead(admin_token, lead["id"], ttype="verify")
        assert vtasks, "Verify task not created on lead capture"
        assert vtasks[0]["priority"] == "high"
        assert "Verify Lead" in vtasks[0]["title"]


# ============================================================
# Event: status.changed
# ============================================================
class TestStatusChangedEvents:
    def _fresh_lead(self, admin_token):
        return _create_lead(admin_token)

    def test_interested_creates_qualify_task_and_email(self, admin_token):
        lead = self._fresh_lead(admin_token)
        _transition(admin_token, lead["id"], "interested")

        logs = _logs_for_lead(admin_token, lead["id"])
        email_logs = [l for l in logs if l["event"] == "status.changed" and l["action"] == "send_email"]
        assert email_logs, f"send_email log missing for interested. Logs: {logs}"
        assert email_logs[0]["status"] == "success"

        tasks = _tasks_for_lead(admin_token, lead["id"], ttype="follow_up")
        match = [t for t in tasks if "Qualify for Site Visit" in t["title"]]
        assert match, f"'Qualify for Site Visit' task missing. Tasks: {[t['title'] for t in tasks]}"
        t = match[0]
        assert t["priority"] == "high"
        assert t["due_at"] is not None

    def test_opportunity_creates_handover_task_and_email(self, admin_token):
        lead = self._fresh_lead(admin_token)
        _transition(admin_token, lead["id"], "opportunity")

        tasks = _tasks_for_lead(admin_token, lead["id"], ttype="follow_up")
        match = [t for t in tasks if "Sales Rep - Initial Contact within 24h" in t["title"]]
        assert match, f"Handover task missing. Tasks: {[t['title'] for t in tasks]}"
        assert match[0]["priority"] == "high"

        logs = _logs_for_lead(admin_token, lead["id"])
        assert any(l["action"] == "send_email" and l["status"] == "success"
                   and l["event"] == "status.changed" for l in logs), \
            f"send_email log missing for opportunity. Logs: {logs}"

    def test_negotiation_creates_proposal_task_and_whatsapp(self, admin_token):
        lead = self._fresh_lead(admin_token)
        # Move through opportunity first to satisfy any progression logic (not required, but safer)
        _transition(admin_token, lead["id"], "negotiation")

        tasks = _tasks_for_lead(admin_token, lead["id"], ttype="follow_up")
        match = [t for t in tasks if "Prepare & send proposal" in t["title"]]
        assert match, f"Proposal task missing. Tasks: {[t['title'] for t in tasks]}"
        assert match[0]["priority"] == "high"

        logs = _logs_for_lead(admin_token, lead["id"])
        wa = [l for l in logs if l["event"] == "status.changed" and l["action"] == "send_whatsapp"]
        assert wa, f"send_whatsapp log missing for negotiation. Logs: {logs}"
        assert wa[0]["status"] == "success"

    def test_won_creates_onboarding_task_and_email(self, admin_token):
        lead = self._fresh_lead(admin_token)
        _transition(admin_token, lead["id"], "won")

        tasks = _tasks_for_lead(admin_token, lead["id"], ttype="follow_up")
        match = [t for t in tasks if "Post-sales onboarding" in t["title"]]
        assert match, f"Onboarding task missing. Tasks: {[t['title'] for t in tasks]}"
        assert match[0]["priority"] == "high"

        logs = _logs_for_lead(admin_token, lead["id"])
        assert any(l["event"] == "status.changed" and l["action"] == "send_email"
                   and l["status"] == "success" for l in logs), \
            f"send_email log missing for won. Logs: {logs}"

    def test_not_interested_pauses_sequence(self, admin_token):
        lead = self._fresh_lead(admin_token)
        _transition(admin_token, lead["id"], "not_interested")

        logs = _logs_for_lead(admin_token, lead["id"])
        pause = [l for l in logs if l["event"] == "status.changed" and l["action"] == "pause_sequence"]
        assert pause, f"pause_sequence log missing for not_interested. Logs: {logs}"
        assert pause[0]["status"] == "success"

    def test_lost_pauses_sequence(self, admin_token):
        lead = self._fresh_lead(admin_token)
        _transition(admin_token, lead["id"], "lost")

        logs = _logs_for_lead(admin_token, lead["id"])
        pause = [l for l in logs if l["event"] == "status.changed" and l["action"] == "pause_sequence"]
        assert pause, f"pause_sequence log missing for lost. Logs: {logs}"
        assert pause[0]["status"] == "success"

    def test_no_failed_logs_across_events(self, admin_token):
        # Global sanity — no rule ever throws
        r = requests.get(f"{API}/automation-logs?status=failed&per_page=100",
                         headers=_h(admin_token), timeout=15)
        assert r.status_code == 200
        data = r.json().get("data", [])
        assert data == [], f"Found failed automation logs: {data}"


# ============================================================
# SLA breach escalation
# ============================================================
class TestSlaEscalation:
    def test_verify_task_2h_breach_escalates_to_manager(self, admin_token):
        lead = _create_lead(admin_token)
        vtasks = _tasks_for_lead(admin_token, lead["id"], ttype="verify")
        assert vtasks, "Verify task missing"
        task_id = vtasks[0]["id"]
        original_owner = vtasks[0]["assigned_to"]

        # Backdate created_at > 2h ago
        _tinker(f"\\App\\Models\\Task::where('id', {task_id})->update(['created_at' => now()->subHours(3)]);")

        _run_reminders()

        r = requests.get(f"{API}/tasks?lead_id={lead['id']}&type=verify",
                         headers=_h(admin_token), timeout=15)
        assert r.status_code == 200
        data = r.json().get("data", r.json())
        t = next((x for x in data if x["id"] == task_id), None)
        assert t is not None, "Verify task disappeared"
        assert t["escalated"] is True, f"Task not escalated: {t}"
        assert t["priority"] == "high"
        mgr_id = _manager_id(admin_token)
        assert t["assigned_to"] == mgr_id, \
            f"Expected reassignment to manager id={mgr_id}, got {t['assigned_to']} (original owner was {original_owner})"
        assert t["assigned_to"] != original_owner or original_owner == mgr_id

    def test_overdue_follow_up_escalates_to_manager(self, admin_token):
        lead = _create_lead(admin_token)
        _transition(admin_token, lead["id"], "opportunity")

        tasks = _tasks_for_lead(admin_token, lead["id"], ttype="follow_up")
        assert tasks, "Follow-up task missing after opportunity transition"
        task_id = tasks[0]["id"]
        original_owner = tasks[0]["assigned_to"]

        # Backdate due_at to past
        _tinker(f"\\App\\Models\\Task::where('id', {task_id})->update(['due_at' => now()->subHours(1)]);")

        _run_reminders()

        r = requests.get(f"{API}/tasks?lead_id={lead['id']}&type=follow_up",
                         headers=_h(admin_token), timeout=15)
        data = r.json().get("data", r.json())
        t = next((x for x in data if x["id"] == task_id), None)
        assert t is not None
        assert t["escalated"] is True, f"Follow-up not escalated: {t}"
        assert t["priority"] == "high"
        mgr_id = _manager_id(admin_token)
        assert t["assigned_to"] == mgr_id, \
            f"Expected reassignment to manager id={mgr_id}, got {t['assigned_to']}"
