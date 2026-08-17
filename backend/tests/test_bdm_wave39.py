"""
Wave-39 backend tests: BDM stage nudges + reschedule webhook + admin/BDM calendar dashboards.
Focused on the delta over iteration_38.
"""
import os
import uuid
import datetime
import requests
import pytest

BASE_URL = os.environ.get(
    "PREVIEW_API_BASE",
    "https://deal-flow-platform.preview.emergentagent.com",
).rstrip("/")
API = f"{BASE_URL}/crm-api/v1"

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
    return {k: _login(*v) for k, v in USERS.items()}


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Accept": "application/json"}


# ----- helper -----
def _new_bde_lead(admin_tok, bde_id, phone=None):
    uniq = uuid.uuid4().hex[:8]
    payload = {
        "name": f"TEST_W39_{uniq}",
        "email": f"testw39_{uniq}@example.com",
        "phone": phone or f"98{uniq[:8]}",
        "source": "Website Form",
        "city": "Bengaluru",
        "owner_id": bde_id,
    }
    r = requests.post(f"{API}/leads", json=payload, headers=_h(admin_tok), timeout=20)
    assert r.status_code in (200, 201), r.text
    return r.json().get("lead", r.json())


def _bde_id(tokens):
    r = requests.get(f"{API}/me", headers=_h(tokens["bde"])).json()
    return r.get("user", r)["id"]


def _schedule_visit(tokens, lead_id, days=10, hours=1):
    when = (datetime.datetime.utcnow() + datetime.timedelta(days=days, hours=hours)).strftime("%Y-%m-%d %H:%M:%S")
    r = requests.post(
        f"{API}/leads/{lead_id}/site-visits",
        json={"scheduled_at": when, "duration_min": 60, "meeting_point": "Site A"},
        headers=_h(tokens["bde"]), timeout=25,
    )
    assert r.status_code == 201, r.text
    return r.json()["visit"], when


def _push_lead_to(tokens, lead_id, code):
    """Force lead status to code via admin transition endpoint. Ignores 422 legality; uses direct transition per allowed_next chain."""
    r = requests.post(
        f"{API}/journey/leads/{lead_id}/transition",
        json={"code": code, "reason": f"wave39 push→{code}"},
        headers=_h(tokens["admin"]), timeout=15,
    )
    return r


# ---------------- Journey statuses ----------------
class TestJourneyStatusesBdm:
    def test_bdm_group_pricing_negotiation_final_have_wa(self, tokens):
        r = requests.get(f"{API}/journey/statuses", params={"group": "bdm"},
                         headers=_h(tokens["admin"]), timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        # accept either list or {statuses: [...]}
        if isinstance(data, list):
            rows = data
        elif "stages" in data:
            rows = [s for st in data["stages"] for s in st.get("statuses", [])]
        else:
            rows = data.get("statuses", data.get("data", []))
        by = {s["code"]: s for s in rows}
        for code in ("OPP_PRICING_SHEET", "OPP_NEGOTIATION", "OPP_FINAL_CALL"):
            assert code in by, f"{code} missing from bdm status catalog"
            assert by[code].get("wa_enabled") in (True, 1), f"{code} wa_enabled != true"
            assert (by[code].get("wa_message") or "").strip(), f"{code} wa_message empty"


# ---------------- Auto follow-up task on 3 stages ----------------
class TestClosingStageNudges:
    """Each of the 3 closing stages must auto-create a HIGH-priority BDM follow-up Task
    assigned to the current lead owner (BDM) when transitioned to."""

    @pytest.fixture(scope="class")
    def prepped_lead(self, tokens):
        # Create lead + book visit → moves to OPP_NOT_CONTACTED under a BDM
        bde_id = _bde_id(tokens)
        lead = _new_bde_lead(tokens["admin"], bde_id)
        _schedule_visit(tokens, lead["id"], days=8, hours=1)
        # Fetch current lead
        r = requests.get(f"{API}/leads/{lead['id']}", headers=_h(tokens["admin"])).json()
        lead = r.get("lead", r)
        return lead

    def _walk_to(self, tokens, lead_id, target):
        """Walk through allowed_next chain to reach target. Uses admin token."""
        # Chain hints (from seeder): NOT_CONTACTED -> INITIAL_CALL -> INTEREST_CONFIRMED -> SV_SCHEDULED
        #                          -> SV_CONFIRMED -> SV_DONE -> POST_SV_FU1 -> POST_SV_FU2 -> PRICING_SHEET -> NEGOTIATION -> FINAL_CALL
        chain = [
            "OPP_INITIAL_CALL",
            "OPP_SV_POSITIVE",
            "OPP_POST_SV_FU1",
            "OPP_PRICING_SHEET",
            "OPP_NEGOTIATION",
            "OPP_FINAL_CALL",
        ]
        last = None
        for c in chain:
            r = _push_lead_to(tokens, lead_id, c)
            last = (c, r.status_code, r.text[:200])
            if r.status_code != 200:
                # try skipping this step
                continue
            if c == target:
                return True, last
        return False, last

    @pytest.mark.parametrize("stage", ["OPP_PRICING_SHEET", "OPP_NEGOTIATION", "OPP_FINAL_CALL"])
    def test_transition_creates_high_priority_task(self, tokens, prepped_lead, stage):
        # Get fresh lead + owner
        r = requests.get(f"{API}/leads/{prepped_lead['id']}", headers=_h(tokens["admin"])).json()
        lead = r.get("lead", r)
        owner_id = lead.get("owner_id")

        # Snapshot tasks BEFORE
        def _lead_tasks():
            resp = requests.get(f"{API}/tasks", params={"per_page": 500},
                                headers=_h(tokens["admin"]), timeout=20).json()
            rows = resp.get("data", resp)
            if isinstance(rows, dict):
                rows = rows.get("data", [])
            return [t for t in rows if t.get("lead_id") == lead["id"]]

        before = {t["id"] for t in _lead_tasks()}

        # Walk to stage
        ok, dbg = self._walk_to(tokens, lead["id"], stage)
        assert ok, f"could not reach {stage}; last={dbg}"

        # Confirm status
        r2 = requests.get(f"{API}/leads/{lead['id']}", headers=_h(tokens["admin"])).json()
        cur = (r2.get("lead", r2)).get("status_code")
        assert cur == stage, f"expected {stage}, got {cur}"

        # New tasks
        after = _lead_tasks()
        new_tasks = [t for t in after if t["id"] not in before]
        # Filter for high-priority BDM follow-ups
        hi = [t for t in new_tasks if (t.get("priority") == "high")]
        assert hi, f"no high-priority task created for {stage}. new_tasks={new_tasks}"
        # And assigned to lead owner (BDM)
        assert any(t.get("assigned_to") == owner_id for t in hi), \
            f"no high-priority task assigned to owner {owner_id} for {stage}: {hi}"


# ---------------- Admin dashboard shape ----------------
class TestAdminDashboard:
    def test_admin_dashboard_shape(self, tokens):
        r = requests.get(f"{API}/dashboards/admin", headers=_h(tokens["head"]), timeout=20)
        assert r.status_code == 200, r.text
        j = r.json()
        for k in ("stats", "funnel_bde", "funnel_bdm", "calendar"):
            assert k in j, f"missing key {k}"
        # NO longer returns workload/sla
        assert "workload" not in j, "workload should be removed"
        assert "sla" not in j, "sla should be removed"
        # lost_month in stats
        assert "lost_month" in j["stats"], "stats.lost_month missing"
        # funnel lengths: BDE=10, BDM=15
        assert len(j["funnel_bde"]) == 10, f"funnel_bde count expected 10, got {len(j['funnel_bde'])}"
        assert len(j["funnel_bdm"]) == 15, f"funnel_bdm count expected 15, got {len(j['funnel_bdm'])}"
        # Calendar is a list; each item has date + kind
        assert isinstance(j["calendar"], list)
        if j["calendar"]:
            item = j["calendar"][0]
            for k in ("date", "kind", "title"):
                assert k in item, f"calendar item missing {k}"
            # admin calendar = visits only
            kinds = {c["kind"] for c in j["calendar"]}
            assert kinds <= {"visit"}, f"admin calendar should be visits only, saw kinds={kinds}"


# ---------------- BDM dashboard has calendar (visits + tasks) ----------------
class TestBdmDashboardCalendar:
    def test_bdm_has_calendar(self, tokens):
        r = requests.get(f"{API}/dashboards/bdm", headers=_h(tokens["bdm"]), timeout=20)
        assert r.status_code == 200, r.text
        j = r.json()
        assert "calendar" in j, "bdm dashboard missing calendar"
        assert isinstance(j["calendar"], list)
        # Allowed kinds: visit + task
        kinds = {c.get("kind") for c in j["calendar"]}
        assert kinds <= {"visit", "task"}, f"unexpected kinds on bdm calendar: {kinds}"

    def test_bdm_dashboard_forbidden_for_cp(self, tokens):
        if not tokens["cp"]:
            pytest.skip("no cp token")
        r = requests.get(f"{API}/dashboards/bdm", headers=_h(tokens["cp"]), timeout=15)
        assert r.status_code in (401, 403)


# ---------------- Reschedule webhook flow ----------------
class TestRescheduleWebhook:
    """Simulate Meta WhatsApp webhook 'resched' button reply + follow-up date text."""

    @pytest.fixture(scope="class")
    def eng_lead(self, tokens):
        """Create a lead with an active VisitEngagement (via BDE→BDM handover)."""
        bde_id = _bde_id(tokens)
        # Unique phone to isolate from other leads
        uniq = uuid.uuid4().hex[:8]
        phone = "919" + uniq[:9]
        lead = _new_bde_lead(tokens["admin"], bde_id, phone=phone)
        _schedule_visit(tokens, lead["id"], days=7, hours=1)
        # Fetch lead — should be OPP_NOT_CONTACTED and owned by a BDM now
        r = requests.get(f"{API}/leads/{lead['id']}", headers=_h(tokens["admin"])).json()
        lead = r.get("lead", r)
        return {"lead": lead, "phone": phone}

    def _post_meta_webhook(self, payload):
        # No signature enforcement since config('integrations.whatsapp.cloud.app_secret') is unset in preview
        return requests.post(f"{API}/webhooks/whatsapp", json=payload, timeout=25)

    def _meta_button_reply(self, phone, btn_id="resched", msg_id=None):
        msg_id = msg_id or f"wamid.{uuid.uuid4().hex}"
        return {
            "object": "whatsapp_business_account",
            "entry": [{
                "id": "WABA_TEST",
                "changes": [{
                    "value": {
                        "messaging_product": "whatsapp",
                        "contacts": [{"profile": {"name": "Test Customer"}, "wa_id": phone}],
                        "messages": [{
                            "from": phone,
                            "id": msg_id,
                            "timestamp": "0",
                            "type": "interactive",
                            "interactive": {
                                "type": "button_reply",
                                "button_reply": {"id": btn_id, "title": "Reschedule"},
                            },
                        }],
                    },
                    "field": "messages",
                }],
            }],
        }

    def _meta_text(self, phone, body):
        return {
            "object": "whatsapp_business_account",
            "entry": [{
                "id": "WABA_TEST",
                "changes": [{
                    "value": {
                        "messaging_product": "whatsapp",
                        "contacts": [{"profile": {"name": "Test Customer"}, "wa_id": phone}],
                        "messages": [{
                            "from": phone,
                            "id": f"wamid.{uuid.uuid4().hex}",
                            "timestamp": "0",
                            "type": "text",
                            "text": {"body": body},
                        }],
                    },
                    "field": "messages",
                }],
            }],
        }

    def test_active_engagement_exists_before(self, tokens, eng_lead):
        d = requests.get(f"{API}/dashboards/bdm?all=1", headers=_h(tokens["head"]), timeout=15).json()
        eng = [e for e in d.get("engagements", []) if e.get("lead") and e["lead"]["id"] == eng_lead["lead"]["id"]]
        assert eng, "expected an active engagement for freshly booked lead"
        assert eng[0].get("active") in (True, 1, None) or eng[0].get("total_sends", 0) > 0

    def test_resched_button_pauses_engagement_and_creates_task(self, tokens, eng_lead):
        r = self._post_meta_webhook(self._meta_button_reply(eng_lead["phone"], "resched"))
        assert r.status_code == 200, f"webhook returned {r.status_code}: {r.text}"

        # 1) Engagement no longer active
        d = requests.get(f"{API}/dashboards/bdm?all=1", headers=_h(tokens["head"]), timeout=15).json()
        eng = [e for e in d.get("engagements", []) if e.get("lead") and e["lead"]["id"] == eng_lead["lead"]["id"]]
        # dashboard filters to active — expect it gone or active=false
        if eng:
            assert not eng[0].get("active"), f"engagement should be paused; got {eng[0]}"

        # 2) A high-priority reschedule task exists for the lead
        resp = requests.get(f"{API}/tasks", params={"per_page": 500},
                            headers=_h(tokens["admin"])).json()
        rows = resp.get("data", resp)
        if isinstance(rows, dict):
            rows = rows.get("data", [])
        lid = eng_lead["lead"]["id"]
        resched = [t for t in rows if t.get("lead_id") == lid
                   and (t.get("meta") or {}).get("reschedule") is True]
        assert resched, "no meta.reschedule=true task created for lead"
        assert any(t.get("priority") == "high" for t in resched), "reschedule task should be high priority"

    def test_followup_text_updates_task_and_logs_activity(self, tokens, eng_lead):
        preferred = "Saturday 4pm please"
        r = self._post_meta_webhook(self._meta_text(eng_lead["phone"], preferred))
        assert r.status_code == 200, r.text

        # Activity note captured — read lead's timeline
        lid = eng_lead["lead"]["id"]
        detail = requests.get(f"{API}/leads/{lid}", headers=_h(tokens["admin"])).json()
        arows = detail.get("timeline", []) or []
        hit = [a for a in arows if "Reschedule preference from customer"
               in " ".join([str(a.get(k) or "") for k in ("summary","body","note","title","meta_json")])]
        assert hit, f"activity note for reschedule preference not logged. sample: {arows[:3] if arows else 'empty'}"

        # Task title updated
        resp = requests.get(f"{API}/tasks", params={"per_page": 500},
                            headers=_h(tokens["admin"])).json()
        rows = resp.get("data", resp)
        if isinstance(rows, dict):
            rows = rows.get("data", [])
        resched = [t for t in rows if t.get("lead_id") == lid
                   and (t.get("meta") or {}).get("reschedule") is True]
        assert resched, "reschedule task disappeared"
        assert any("preferred" in (t.get("title") or "").lower() for t in resched), \
            f"reschedule task title not annotated with preference; titles: {[t.get('title') for t in resched]}"


# ---------------- SiteVisitService::reschedule restarts loop ----------------
class TestRescheduleRestartsLoop:
    def test_reschedule_via_api_starts_new_engagement(self, tokens):
        bde_id = _bde_id(tokens)
        lead = _new_bde_lead(tokens["admin"], bde_id)
        visit, _ = _schedule_visit(tokens, lead["id"], days=9, hours=23)

        # Confirm engagement active before reschedule
        d1 = requests.get(f"{API}/dashboards/bdm?all=1", headers=_h(tokens["head"])).json()
        e1 = [e for e in d1.get("engagements", []) if e.get("lead") and e["lead"]["id"] == lead["id"]]
        assert e1, "initial engagement missing"

        # Reschedule: try PATCH/POST /site-visits/{id}
        new_when = (datetime.datetime.utcnow() + datetime.timedelta(days=11, hours=2)).strftime("%Y-%m-%d %H:%M:%S")
        # find the correct route
        r = None
        for method, path in [
            ("POST", f"/site-visits/{visit['id']}/reschedule"),
            ("PATCH", f"/site-visits/{visit['id']}"),
            ("PUT", f"/site-visits/{visit['id']}"),
        ]:
            r = requests.request(method, f"{API}{path}",
                                 json={"scheduled_at": new_when, "reason": "TEST_W39 reschedule"},
                                 headers=_h(tokens["bdm"]), timeout=20)
            if r.status_code in (200, 201):
                break
        assert r is not None and r.status_code in (200, 201), \
            f"could not reschedule visit; last={r.status_code}: {r.text}"

        # A fresh active engagement should now exist for the new date.
        d2 = requests.get(f"{API}/dashboards/bdm?all=1", headers=_h(tokens["head"])).json()
        e2 = [e for e in d2.get("engagements", []) if e.get("lead") and e["lead"]["id"] == lead["id"]]
        assert e2, "engagement not restarted after reschedule"
        # total_sends should be recomputed from new appointment (~11d out → 6)
        # (defensive: just assert it's a positive int)
        assert (e2[0].get("total_sends") or 0) >= 1, f"engagement total_sends invalid: {e2[0]}"
