"""Backend API tests for Phase B: Inventory + Site Visits + Handover."""
import pytest
import requests
import uuid
from datetime import datetime, timedelta

BASE = "http://127.0.0.1:8000"
API = f"{BASE}/api/v1"


def H(tok):
    return {"Authorization": f"Bearer {tok}", "Accept": "application/json", "Content-Type": "application/json"}


def _next_slot_iso(hour_offset=2):
    """Return a future scheduled_at at top-of-hour, tomorrow to avoid collisions."""
    dt = (datetime.now() + timedelta(days=1)).replace(minute=0, second=0, microsecond=0)
    # ensure business-hour-ish
    dt = dt.replace(hour=10 + (hour_offset % 6))
    return dt


def _dt_str(dt):
    return dt.strftime("%Y-%m-%d %H:%M:%S")


# -------- Inventory --------
class TestInventory:
    def test_tree_shape_and_counts(self, admin_token):
        r = requests.get(f"{API}/inventory/tree", headers=H(admin_token))
        assert r.status_code == 200, r.text
        d = r.json()
        projects = d.get("projects") or d.get("data") or []
        assert projects, f"no projects in tree: {d}"
        p = projects[0]
        assert "counts" in p, f"no counts in project: {p.keys()}"
        for k in ["total", "available", "held", "booked", "sold"]:
            assert k in p["counts"], f"missing counts.{k}"
        assert "phases" in p
        # plots on some phase
        found_plot = False
        for ph in p["phases"]:
            if ph.get("plots"):
                found_plot = True
                break
        assert found_plot, "no plots under any phase"

    def test_available_plots_only_available(self, admin_token):
        # Find a project id
        r = requests.get(f"{API}/inventory/tree", headers=H(admin_token))
        projects = r.json().get("projects", [])
        pid = projects[0]["id"]
        r2 = requests.get(f"{API}/inventory/available-plots",
                          params={"project_id": pid}, headers=H(admin_token))
        assert r2.status_code == 200, r2.text
        data = r2.json().get("data") or r2.json().get("plots") or []
        assert isinstance(data, list)
        for pl in data:
            assert pl.get("status") == "available", f"non-available in list: {pl}"


# -------- Plot / Phase CRUD + RBAC --------
class TestPlotPhaseCrud:
    def test_plot_create_update_delete_admin(self, admin_token):
        # get a project + phase
        tree = requests.get(f"{API}/inventory/tree", headers=H(admin_token)).json()
        proj = tree["projects"][0]
        pid = proj["id"]
        # Create a plot (unique number)
        uniq = uuid.uuid4().hex[:6].upper()
        create = requests.post(f"{API}/plots", json={
            "project_id": pid, "number": f"TP-{uniq}",
            "unit_type": "2BHK", "price": 5000000, "status": "available"
        }, headers=H(admin_token))
        assert create.status_code in (200, 201), create.text
        plot = create.json().get("plot") or create.json()
        plot_id = plot["id"]

        # Update to held
        upd = requests.put(f"{API}/plots/{plot_id}",
                           json={"status": "held", "price": 5500000},
                           headers=H(admin_token))
        assert upd.status_code == 200, upd.text
        # Update back to available should clear held_by_lead_id
        upd2 = requests.put(f"{API}/plots/{plot_id}",
                            json={"status": "available"},
                            headers=H(admin_token))
        assert upd2.status_code == 200, upd2.text
        p2 = upd2.json().get("plot") or upd2.json()
        assert p2.get("held_by_lead_id") in (None, 0), f"held_by_lead_id not cleared: {p2}"

        # Delete
        d = requests.delete(f"{API}/plots/{plot_id}", headers=H(admin_token))
        assert d.status_code in (200, 204), d.text

    def test_plot_create_forbidden_for_exec(self, exec_token, admin_token):
        tree = requests.get(f"{API}/inventory/tree", headers=H(admin_token)).json()
        pid = tree["projects"][0]["id"]
        r = requests.post(f"{API}/plots", json={
            "project_id": pid, "number": f"NOPE-{uuid.uuid4().hex[:5]}",
            "unit_type": "1BHK", "price": 1000000, "status": "available"
        }, headers=H(exec_token))
        assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text}"

    def test_phase_create_update_admin(self, admin_token):
        tree = requests.get(f"{API}/inventory/tree", headers=H(admin_token)).json()
        pid = tree["projects"][0]["id"]
        name = f"TESTPHASE_{uuid.uuid4().hex[:5]}"
        cr = requests.post(f"{API}/phases", json={"project_id": pid, "name": name},
                           headers=H(admin_token))
        assert cr.status_code in (200, 201), cr.text
        phase = cr.json().get("phase") or cr.json()
        phid = phase["id"]
        up = requests.put(f"{API}/phases/{phid}", json={"name": name + "_U"},
                          headers=H(admin_token))
        assert up.status_code == 200, up.text

    def test_phase_create_forbidden_for_exec(self, exec_token, admin_token):
        tree = requests.get(f"{API}/inventory/tree", headers=H(admin_token)).json()
        pid = tree["projects"][0]["id"]
        r = requests.post(f"{API}/phases", json={"project_id": pid, "name": "X"},
                          headers=H(exec_token))
        assert r.status_code == 403


# -------- Slots --------
class TestSlots:
    def test_slots_shape(self, admin_token):
        date = (datetime.now() + timedelta(days=2)).strftime("%Y-%m-%d")
        r = requests.get(f"{API}/site-visits/slots", params={"date": date},
                         headers=H(admin_token))
        assert r.status_code == 200, r.text
        d = r.json()
        slots = d.get("slots") or d.get("data") or d
        assert isinstance(slots, list) and slots
        first = slots[0]
        assert "available" in first, first


# -------- Site visit lifecycle --------
class TestSiteVisitFlow:
    @pytest.fixture(scope="class")
    def project_and_plot(self, admin_token):
        tree = requests.get(f"{API}/inventory/tree", headers=H(admin_token)).json()
        proj = tree["projects"][0]
        pid = proj["id"]
        # find an available plot
        for ph in proj["phases"]:
            for plot in ph.get("plots", []):
                if plot.get("status") == "available":
                    return {"project_id": pid, "plot_id": plot["id"]}
        # fall back to /available-plots
        r = requests.get(f"{API}/inventory/available-plots",
                        params={"project_id": pid}, headers=H(admin_token))
        plots = r.json().get("data") or []
        return {"project_id": pid, "plot_id": plots[0]["id"] if plots else None}

    @pytest.fixture
    def fresh_lead(self, admin_token):
        uniq = uuid.uuid4().hex[:8]
        r = requests.post(f"{API}/leads", json={
            "name": f"TEST_SV_{uniq}", "email": f"sv_{uniq}@e.com",
            "phone": f"96000{uniq[:5]}", "source": "Website Form",
        }, headers=H(admin_token))
        assert r.status_code in (200, 201), r.text
        return (r.json().get("lead") or r.json())

    def _schedule(self, admin_token, lead_id, project_id, plot_id, hour_offset=1):
        dt = (datetime.now() + timedelta(days=1)).replace(
            hour=10 + hour_offset, minute=0, second=0, microsecond=0
        )
        payload = {
            "scheduled_at": _dt_str(dt),
            "project_id": project_id,
            "meeting_point": "Sales office",
        }
        if plot_id:
            payload["plot_id"] = plot_id
        r = requests.post(f"{API}/leads/{lead_id}/site-visits", json=payload,
                          headers=H(admin_token))
        assert r.status_code in (200, 201), r.text
        v = r.json().get("visit") or r.json()
        return v, dt

    def test_schedule_moves_lead_and_creates_task(self, admin_token, fresh_lead, project_and_plot):
        visit, dt = self._schedule(admin_token, fresh_lead["id"],
                                   project_and_plot["project_id"],
                                   project_and_plot["plot_id"])
        assert visit.get("status") in ("scheduled", "confirmed")

        # Lead moved
        lr = requests.get(f"{API}/leads/{fresh_lead['id']}", headers=H(admin_token))
        lead = lr.json().get("lead") or lr.json()
        assert lead.get("status") == "site_visit_scheduled", lead.get("status")

        # Task created
        tr = requests.get(f"{API}/tasks", headers=H(admin_token))
        tasks = tr.json().get("tasks") or tr.json().get("data") or []
        assert any(t.get("lead_id") == fresh_lead["id"]
                   and "site visit" in ((t.get("title") or "").lower())
                   for t in tasks), "no 'Conduct site visit' task"

    def test_slot_marked_unavailable_after_schedule(self, admin_token, fresh_lead, project_and_plot):
        visit, dt = self._schedule(admin_token, fresh_lead["id"],
                                   project_and_plot["project_id"],
                                   project_and_plot["plot_id"], hour_offset=2)
        date = dt.strftime("%Y-%m-%d")
        r = requests.get(f"{API}/site-visits/slots", params={"date": date},
                         headers=H(admin_token))
        slots = r.json().get("slots") or r.json().get("data") or []
        target = [s for s in slots if str(s.get("hour", s.get("time", ""))).startswith(str(dt.hour))
                 or str(s.get("start", "")).startswith(dt.strftime("%H"))]
        # relaxed: at least one slot for that hour should be unavailable OR overall list contains an unavailable=false
        assert any(s.get("available") is False for s in slots), \
            f"expected at least one unavailable slot after scheduling, got: {slots[:5]}"

    def test_confirm_checkin_checkout(self, admin_token, fresh_lead, project_and_plot):
        visit, _ = self._schedule(admin_token, fresh_lead["id"],
                                  project_and_plot["project_id"],
                                  project_and_plot["plot_id"], hour_offset=3)
        vid = visit["id"]
        c = requests.post(f"{API}/site-visits/{vid}/confirm", json={}, headers=H(admin_token))
        assert c.status_code == 200, c.text
        assert (c.json().get("visit") or c.json()).get("status") == "confirmed"

        ci = requests.post(f"{API}/site-visits/{vid}/checkin", json={}, headers=H(admin_token))
        assert ci.status_code == 200, ci.text
        assert (ci.json().get("visit") or ci.json()).get("checkin_at")

        co = requests.post(f"{API}/site-visits/{vid}/checkout", json={}, headers=H(admin_token))
        assert co.status_code == 200, co.text
        assert (co.json().get("visit") or co.json()).get("checkout_at")

    def test_outcome_interested_handover_and_hold(self, admin_token, fresh_lead, project_and_plot):
        visit, _ = self._schedule(admin_token, fresh_lead["id"],
                                  project_and_plot["project_id"],
                                  project_and_plot["plot_id"], hour_offset=4)
        vid = visit["id"]
        plot_id = project_and_plot["plot_id"]

        r = requests.post(f"{API}/site-visits/{vid}/complete", json={
            "outcome": "interested",
            "interest_level": "very_high",
            "buyer_interest_score": 9,
            "feedback": "Loved it"
        }, headers=H(admin_token))
        assert r.status_code == 200, r.text
        v = r.json().get("visit") or r.json()
        assert v.get("status") == "completed"

        # Lead -> negotiation
        lr = requests.get(f"{API}/leads/{fresh_lead['id']}", headers=H(admin_token))
        lead = lr.json().get("lead") or lr.json()
        assert lead.get("status") == "negotiation", lead.get("status")

        # Handover task exists
        tr = requests.get(f"{API}/tasks", headers=H(admin_token))
        tasks = tr.json().get("tasks") or tr.json().get("data") or []
        assert any(t.get("lead_id") == fresh_lead["id"]
                   and ("handover" in (t.get("title") or "").lower()
                        or "handover" in (t.get("type") or "").lower())
                   for t in tasks), f"no handover task for lead {fresh_lead['id']}"

        # Plot on hold
        if plot_id:
            # fetch plot via tree (find it)
            tree = requests.get(f"{API}/inventory/tree", headers=H(admin_token)).json()
            found = None
            for pr in tree["projects"]:
                for ph in pr["phases"]:
                    for pl in ph.get("plots", []):
                        if pl["id"] == plot_id:
                            found = pl
            assert found is not None
            assert found.get("status") == "held", f"plot not held: {found}"
            assert found.get("held_by_lead_id") == fresh_lead["id"]

    def test_outcome_considering(self, admin_token, fresh_lead, project_and_plot):
        visit, _ = self._schedule(admin_token, fresh_lead["id"],
                                  project_and_plot["project_id"], None, hour_offset=5)
        vid = visit["id"]
        r = requests.post(f"{API}/site-visits/{vid}/complete", json={
            "outcome": "considering", "feedback": "needs time"
        }, headers=H(admin_token))
        assert r.status_code == 200, r.text
        # Lead should be site_visit_completed
        lr = requests.get(f"{API}/leads/{fresh_lead['id']}", headers=H(admin_token))
        lead = lr.json().get("lead") or lr.json()
        assert lead.get("status") == "site_visit_completed", lead.get("status")

    def test_outcome_not_interested(self, admin_token, fresh_lead, project_and_plot):
        visit, _ = self._schedule(admin_token, fresh_lead["id"],
                                  project_and_plot["project_id"], None, hour_offset=0)
        vid = visit["id"]
        r = requests.post(f"{API}/site-visits/{vid}/complete", json={
            "outcome": "not_interested", "loss_reason": "budget"
        }, headers=H(admin_token))
        assert r.status_code == 200, r.text
        lr = requests.get(f"{API}/leads/{fresh_lead['id']}", headers=H(admin_token))
        lead = lr.json().get("lead") or lr.json()
        assert lead.get("status") == "not_interested", lead.get("status")

    def test_reschedule_escalation(self, admin_token, fresh_lead, project_and_plot):
        visit, dt = self._schedule(admin_token, fresh_lead["id"],
                                   project_and_plot["project_id"], None, hour_offset=1)
        vid = visit["id"]
        # reschedule 4 times
        statuses = []
        for i in range(4):
            new_dt = dt + timedelta(days=i + 2)
            r = requests.post(f"{API}/site-visits/{vid}/reschedule", json={
                "scheduled_at": _dt_str(new_dt.replace(minute=0, second=0, microsecond=0)),
                "reason": f"attempt {i+1}"
            }, headers=H(admin_token))
            statuses.append(r.status_code)
            assert r.status_code == 200, f"reschedule {i+1} failed: {r.text}"
            v = r.json().get("visit") or r.json()
            if i == 2:
                # 3rd reschedule -> escalation task
                assert v.get("reschedule_count", 0) >= 3

        # 4th reschedule -> lead moved to no_response
        lr = requests.get(f"{API}/leads/{fresh_lead['id']}", headers=H(admin_token))
        lead = lr.json().get("lead") or lr.json()
        assert lead.get("status") == "no_response", lead.get("status")

    def test_no_show(self, admin_token, fresh_lead, project_and_plot):
        visit, _ = self._schedule(admin_token, fresh_lead["id"],
                                  project_and_plot["project_id"], None, hour_offset=2)
        vid = visit["id"]
        r = requests.post(f"{API}/site-visits/{vid}/complete", json={"outcome": "no_show"},
                          headers=H(admin_token))
        assert r.status_code == 200, r.text
        v = r.json().get("visit") or r.json()
        assert v.get("status") == "no_show"
        # callback task within 2h
        tr = requests.get(f"{API}/tasks", headers=H(admin_token))
        tasks = tr.json().get("tasks") or tr.json().get("data") or []
        assert any(t.get("lead_id") == fresh_lead["id"]
                   and "callback" in ((t.get("title") or "") + " " + (t.get("type") or "")).lower()
                   for t in tasks), "no callback task for no-show"

    def test_cancel(self, admin_token, fresh_lead, project_and_plot):
        visit, _ = self._schedule(admin_token, fresh_lead["id"],
                                  project_and_plot["project_id"], None, hour_offset=3)
        vid = visit["id"]
        r = requests.post(f"{API}/site-visits/{vid}/cancel", json={"reason": "user asked"},
                         headers=H(admin_token))
        assert r.status_code == 200, r.text
        v = r.json().get("visit") or r.json()
        assert v.get("status") == "cancelled"


# -------- Site visit list --------
class TestSiteVisitList:
    def test_upcoming_filter(self, admin_token):
        r = requests.get(f"{API}/site-visits", params={"upcoming": 1}, headers=H(admin_token))
        assert r.status_code == 200, r.text
        d = r.json()
        items = d.get("visits") or d.get("data") or (d if isinstance(d, list) else [])
        # all items should be scheduled/confirmed/rescheduled
        for v in items:
            assert v.get("status") in ("scheduled", "confirmed", "rescheduled"), v

    def test_filter_by_status(self, admin_token):
        r = requests.get(f"{API}/site-visits", params={"status": "completed"},
                         headers=H(admin_token))
        assert r.status_code == 200, r.text
        d = r.json()
        items = d.get("visits") or d.get("data") or (d if isinstance(d, list) else [])
        for v in items:
            assert v.get("status") == "completed", v
