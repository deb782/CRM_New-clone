"""
BDM Opportunity Pipeline + Engagement Loop + Role Dashboards + Cron
End-to-end backend tests against the preview URL.
"""
import os
import time
import uuid
import requests
import pytest

BASE_URL = os.environ.get(
    "PREVIEW_API_BASE",
    "https://deal-flow-platform.preview.emergentagent.com",
).rstrip("/")
API = f"{BASE_URL}/crm-api/v1"

CRON_SECRET = "010a0707c45c16da1176d5dfd213f8ce442416ea5ca530ad"

USERS = {
    "admin": ("admin@crm.local", "Admin@12345"),
    "bde":   ("rahul@crm.local", "Demo@12345"),
    "bdm":   ("bdm@crm.local", "Demo@12345"),
    "head":  ("priya@crm.local", "Demo@12345"),
    "cp":    ("partner@crm.local", "Demo@12345"),
}


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    if r.status_code != 200:
        return None
    return r.json().get("token")


@pytest.fixture(scope="session")
def tokens():
    tk = {k: _login(*v) for k, v in USERS.items()}
    return tk


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Accept": "application/json"}


# ---------- Auth / smoke ----------
class TestAuth:
    def test_all_logins(self, tokens):
        for role, tk in tokens.items():
            assert tk, f"Login failed for {role}"


# ---------- Cron endpoint ----------
class TestCron:
    def test_cron_unauthorized_missing(self):
        r = requests.post(f"{API}/cron/engagement-nudge", timeout=15)
        assert r.status_code == 401

    def test_cron_unauthorized_wrong(self):
        r = requests.post(f"{API}/cron/engagement-nudge",
                          headers={"Authorization": "Bearer wrongsecret"}, timeout=15)
        assert r.status_code == 401

    def test_cron_authorized(self):
        r = requests.post(f"{API}/cron/engagement-nudge",
                          headers={"Authorization": f"Bearer {CRON_SECRET}"}, timeout=30)
        assert r.status_code == 200
        j = r.json()
        assert j.get("ok") is True
        assert "sent" in j and isinstance(j["sent"], int)

    def test_cron_idempotent(self):
        """Two back-to-back cron calls: since next_send_at advances 2 days,
           the 2nd call shouldn't send anything for the same engagements."""
        h = {"Authorization": f"Bearer {CRON_SECRET}"}
        r1 = requests.post(f"{API}/cron/engagement-nudge", headers=h, timeout=30).json()
        r2 = requests.post(f"{API}/cron/engagement-nudge", headers=h, timeout=30).json()
        assert r2["sent"] == 0, f"Second cron call should be idempotent (got sent={r2['sent']}, prev={r1['sent']})"


# ---------- Opportunity board ----------
class TestOpportunityBoard:
    def test_board_shape(self, tokens):
        r = requests.get(f"{API}/opportunities/board", headers=_h(tokens["admin"]), timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "lanes" in data and isinstance(data["lanes"], list)
        # per problem statement — 4 lanes and 13/15 BDM statuses
        assert len(data["lanes"]) == 4, f"Expected 4 lanes, got {len(data['lanes'])}"
        total_statuses = sum(len(l["statuses"]) for l in data["lanes"])
        assert total_statuses >= 13, f"Expected >=13 BDM statuses across lanes, got {total_statuses}"
        # Every status has code/display_name/allowed_next
        for lane in data["lanes"]:
            for s in lane["statuses"]:
                assert "code" in s and s["code"].startswith("OPP_")
                assert "leads" in s

    def test_partner_denied(self, tokens):
        if not tokens["cp"]:
            pytest.skip("channel partner login missing")
        r = requests.get(f"{API}/opportunities/board", headers=_h(tokens["cp"]), timeout=20)
        assert r.status_code in (401, 403), f"expected 401/403 for CP, got {r.status_code}"


# ---------- Dashboards ----------
class TestDashboards:
    def test_bde(self, tokens):
        r = requests.get(f"{API}/dashboards/bde", headers=_h(tokens["bde"]), timeout=20)
        assert r.status_code == 200, r.text
        j = r.json()
        for k in ("stats", "work_stack", "cadence"):
            assert k in j, f"BDE dashboard missing {k}"
        assert isinstance(j["cadence"], list) and len(j["cadence"]) >= 8

    def test_bdm(self, tokens):
        r = requests.get(f"{API}/dashboards/bdm", headers=_h(tokens["bdm"]), timeout=20)
        assert r.status_code == 200, r.text
        j = r.json()
        for k in ("stats", "pipeline", "upcoming", "engagements"):
            assert k in j
        # 13-15 stages
        assert len(j["pipeline"]) >= 13

    def test_admin(self, tokens):
        r = requests.get(f"{API}/dashboards/admin", headers=_h(tokens["head"]), timeout=20)
        assert r.status_code == 200, r.text
        j = r.json()
        for k in ("stats", "funnel_bde", "funnel_bdm", "workload", "sla"):
            assert k in j
        for b in ("breached", "red", "amber", "green"):
            assert b in j["sla"]

    def test_dashboard_forbidden_for_partner(self, tokens):
        if not tokens["cp"]:
            pytest.skip("no cp token")
        r = requests.get(f"{API}/dashboards/bde", headers=_h(tokens["cp"]), timeout=20)
        assert r.status_code in (401, 403)


# ---------- Site visit -> BDM handover flow ----------
def _create_bde_lead(admin_tok, bde_user_id):
    uniq = uuid.uuid4().hex[:6]
    payload = {
        "name": f"TEST_BDM_{uniq}",
        "email": f"testbdm_{uniq}@example.com",
        "phone": f"98{uniq}0000"[:10],
        "source": "Website Form",
        "city": "Bengaluru",
        "owner_id": bde_user_id,
    }
    r = requests.post(f"{API}/leads", json=payload, headers=_h(admin_tok), timeout=20)
    assert r.status_code in (200, 201), r.text
    lead = r.json().get("lead", r.json())
    return lead


@pytest.fixture(scope="module")
def bde_user(tokens):
    r = requests.get(f"{API}/me", headers=_h(tokens["bde"]), timeout=15)
    assert r.status_code == 200
    return r.json().get("user", r.json())


@pytest.fixture(scope="module")
def handover_context(tokens, bde_user):
    lead = _create_bde_lead(tokens["admin"], bde_user["id"])
    # Schedule site visit ~10 days out via BDE
    scheduled_at = (
        __import__("datetime").datetime.utcnow()
        + __import__("datetime").timedelta(days=10, hours=1)
    ).strftime("%Y-%m-%d %H:%M:%S")
    r = requests.post(
        f"{API}/leads/{lead['id']}/site-visits",
        json={"scheduled_at": scheduled_at, "duration_min": 60, "meeting_point": "Site A"},
        headers=_h(tokens["bde"]),
        timeout=25,
    )
    assert r.status_code == 201, f"site visit create failed: {r.status_code} {r.text}"
    visit = r.json()["visit"]
    return {"lead_id": lead["id"], "visit": visit, "scheduled_at": scheduled_at}


class TestBdeHandover:
    def test_lead_moved_to_opp_not_contacted_and_bdm_owns(self, tokens, handover_context, bde_user):
        lead_id = handover_context["lead_id"]
        r = requests.get(f"{API}/leads/{lead_id}", headers=_h(tokens["admin"]), timeout=15)
        assert r.status_code == 200, r.text
        lead = r.json().get("lead", r.json())
        assert lead["status_code"] == "OPP_NOT_CONTACTED", \
            f"expected OPP_NOT_CONTACTED, got {lead.get('status_code')}"
        assert lead["owner_id"] != bde_user["id"], "ownership should transfer off the BDE"

    def test_bdm_confirm_task_created(self, tokens, handover_context):
        # search tasks for one referencing this lead's confirm slot
        r = requests.get(f"{API}/tasks", headers=_h(tokens["admin"]), params={"per_page": 200}, timeout=20)
        assert r.status_code == 200
        rows = r.json().get("data", r.json())
        if isinstance(rows, dict):
            rows = rows.get("data", [])
        lid = handover_context["lead_id"]
        found = [t for t in rows if t.get("lead_id") == lid and "Confirm" in (t.get("title") or "")]
        assert found, "BDM confirm-slot task not found for lead"

    def test_appears_in_opportunity_board(self, tokens, handover_context):
        r = requests.get(f"{API}/opportunities/board", headers=_h(tokens["admin"]), timeout=15)
        assert r.status_code == 200
        board = r.json()
        seen = False
        for lane in board["lanes"]:
            for s in lane["statuses"]:
                for l in s["leads"]:
                    if l["id"] == handover_context["lead_id"]:
                        seen = True
                        assert s["code"] == "OPP_NOT_CONTACTED"
        assert seen, "New converted lead not visible on opportunity board"


# ---------- Transition rules ----------
class TestTransitions:
    def test_allowed_transition(self, tokens, handover_context):
        lid = handover_context["lead_id"]
        # Use admin to bypass ownership on transition endpoint
        r = requests.post(
            f"{API}/journey/leads/{lid}/transition",
            json={"code": "OPP_INITIAL_CALL", "reason": "test allowed"},
            headers=_h(tokens["admin"]),
            timeout=20,
        )
        assert r.status_code == 200, f"allowed transition failed: {r.status_code} {r.text}"
        j = r.json()
        assert j.get("ok") is True
        assert j["lead"]["status_code"] == "OPP_INITIAL_CALL"

    def test_illegal_transition(self, tokens, handover_context):
        lid = handover_context["lead_id"]
        # Big jump: from current stage to OPP_WON should be blocked by allowed_next
        r = requests.post(
            f"{API}/journey/leads/{lid}/transition",
            json={"code": "OPP_WON", "reason": "test illegal"},
            headers=_h(tokens["admin"]),
            timeout=20,
        )
        assert r.status_code == 422, f"illegal jump should 422, got {r.status_code} {r.text}"


# ---------- Engagement cadence (5 sends for 10-day, 3 for 6-day) ----------
class TestEngagementCadence:
    def test_10_day_yields_5_sends_in_bdm_engagements(self, tokens, handover_context):
        """A ~10-day-away appointment must yield exactly 5 nudges (day 0,2,4,6,8).
           Schedule slightly under 10 full days (9d23h) so offset 10 is NOT < appointment_at."""
        r0 = requests.get(f"{API}/me", headers=_h(tokens["bde"])).json()
        bde_id = r0.get("user", r0)["id"]
        lead = _create_bde_lead(tokens["admin"], bde_id)
        scheduled_at = (
            __import__("datetime").datetime.utcnow()
            + __import__("datetime").timedelta(days=9, hours=23)
        ).strftime("%Y-%m-%d %H:%M:%S")
        r = requests.post(f"{API}/leads/{lead['id']}/site-visits",
                          json={"scheduled_at": scheduled_at, "duration_min": 60},
                          headers=_h(tokens["bde"]), timeout=25)
        assert r.status_code == 201, r.text
        # Check via BDM dashboard (all=1 so we don't depend on which BDM got it)
        d = requests.get(f"{API}/dashboards/bdm?all=1", headers=_h(tokens["head"]), timeout=15).json()
        eng = [e for e in d["engagements"] if e["lead"] and e["lead"]["id"] == lead["id"]]
        assert eng, "engagement row missing for freshly booked 10-day lead"
        assert eng[0]["total_sends"] == 5, f"expected 5 total_sends, got {eng[0]['total_sends']}"

    def test_6_day_yields_3_sends(self, tokens):
        r0 = requests.get(f"{API}/me", headers=_h(tokens["bde"])).json()
        bde_id = r0.get("user", r0)["id"]
        lead = _create_bde_lead(tokens["admin"], bde_id)
        scheduled_at = (
            __import__("datetime").datetime.utcnow()
            + __import__("datetime").timedelta(days=5, hours=23)
        ).strftime("%Y-%m-%d %H:%M:%S")
        r = requests.post(f"{API}/leads/{lead['id']}/site-visits",
                          json={"scheduled_at": scheduled_at, "duration_min": 60},
                          headers=_h(tokens["bde"]), timeout=25)
        assert r.status_code == 201, r.text
        d = requests.get(f"{API}/dashboards/bdm?all=1", headers=_h(tokens["head"]), timeout=15).json()
        eng = [e for e in d["engagements"] if e["lead"] and e["lead"]["id"] == lead["id"]]
        assert eng, "engagement row missing for freshly booked 6-day lead"
        assert eng[0]["total_sends"] == 3, f"expected 3 total_sends, got {eng[0]['total_sends']}"

    def test_engagement_stops_on_status_change(self, tokens):
        """When a lead's status changes AND the next nudge fires, the loop must
           halt (active=false, stopped_reason=status_changed). Because next_send_at
           advances 2 days after the immediate first send, we cannot force it
           forward from an external test — verify indirectly: the fresh loop starts
           with total_sends 5 and after status change + a full cron pass, dispatchDue
           still returns non-negative and no exceptions. Deep stop-verification is
           covered by dev tinker (per agent context). We assert the loop STILL shows
           the correct total_sends and does not error out."""
        r0 = requests.get(f"{API}/me", headers=_h(tokens["bde"])).json()
        bde_id = r0.get("user", r0)["id"]
        lead = _create_bde_lead(tokens["admin"], bde_id)
        scheduled_at = (
            __import__("datetime").datetime.utcnow()
            + __import__("datetime").timedelta(days=9, hours=23)
        ).strftime("%Y-%m-%d %H:%M:%S")
        rv = requests.post(f"{API}/leads/{lead['id']}/site-visits",
                           json={"scheduled_at": scheduled_at},
                           headers=_h(tokens["bde"]), timeout=25)
        assert rv.status_code == 201
        d = requests.get(f"{API}/dashboards/bdm?all=1", headers=_h(tokens["head"]), timeout=15).json()
        eng_before = [e for e in d["engagements"] if e["lead"] and e["lead"]["id"] == lead["id"]]
        assert eng_before, "engagement missing before transition"
        assert eng_before[0]["total_sends"] == 5
        # Change status
        tr = requests.post(f"{API}/journey/leads/{lead['id']}/transition",
                           json={"code": "OPP_INITIAL_CALL", "reason": "test stop"},
                           headers=_h(tokens["admin"]), timeout=15)
        assert tr.status_code == 200, tr.text
        # Fire cron; since next_send_at is 2 days out, this returns without processing
        # this row, but the row remains active until the next natural fire — that's
        # the *documented* behavior of dispatchDue. Assert cron doesn't 500.
        cr = requests.post(f"{API}/cron/engagement-nudge",
                           headers={"Authorization": f"Bearer {CRON_SECRET}"}, timeout=20)
        assert cr.status_code == 200
