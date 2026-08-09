"""
Batch 3: SLA Heat-Board + Role Home Screens + Partner Referral Links.
Backend acceptance for iteration 11.
"""
import os
import uuid
import time
import requests
import pytest

BASE = "http://127.0.0.1:8000"
API = f"{BASE}/api/v1"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=10)
    r.raise_for_status()
    return r.json()


@pytest.fixture(scope="module")
def tokens():
    return {
        "admin": _login("admin@crm.local", "Admin@12345")["token"],
        "mgr": _login("priya@crm.local", "Demo@12345")["token"],
        "exec": _login("rahul@crm.local", "Demo@12345")["token"],
        "cs": _login("crm@crm.local", "Demo@12345")["token"],
        "partner": _login("partner@crm.local", "Demo@12345")["token"],
    }


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}", "Accept": "application/json", "Content-Type": "application/json"}


# ---------- SLA Heat-Board ----------

class TestSlaBoard:
    def test_sla_board_manager_200(self, tokens):
        r = requests.get(f"{API}/tasks/sla-board", headers=_hdr(tokens["mgr"]))
        assert r.status_code == 200, r.text
        d = r.json()
        assert set(d.keys()) >= {"tasks", "counts", "users"}
        assert set(d["counts"].keys()) == {"breached", "red", "amber", "green"}
        assert isinstance(d["users"], list)
        for t in d["tasks"]:
            assert t["bucket"] in ["breached", "red", "amber", "green"]
            assert "minutes_to_breach" in t
            assert "lead" in t and "assignee" in t
        # Ascending sort by minutes_to_breach
        mins = [t["minutes_to_breach"] for t in d["tasks"]]
        assert mins == sorted(mins), f"tasks not sorted asc: {mins}"

    def test_sla_board_bucket_correctness(self, tokens):
        """Verify bucket rules: breached <0, red <60, amber <240, else green."""
        r = requests.get(f"{API}/tasks/sla-board", headers=_hdr(tokens["mgr"]))
        d = r.json()
        counts = {"breached": 0, "red": 0, "amber": 0, "green": 0}
        for t in d["tasks"]:
            m = t["minutes_to_breach"]
            if m < 0:
                expected = "breached"
            elif m < 60:
                expected = "red"
            elif m < 240:
                expected = "amber"
            else:
                expected = "green"
            assert t["bucket"] == expected, f"task {t['id']} m={m} bucket={t['bucket']} expected {expected}"
            counts[expected] += 1
        assert counts == d["counts"]

    def test_sla_board_exec_200(self, tokens):
        r = requests.get(f"{API}/tasks/sla-board", headers=_hdr(tokens["exec"]))
        assert r.status_code == 200

    def test_sla_board_admin_200(self, tokens):
        r = requests.get(f"{API}/tasks/sla-board", headers=_hdr(tokens["admin"]))
        assert r.status_code == 200

    def test_sla_board_partner_403(self, tokens):
        r = requests.get(f"{API}/tasks/sla-board", headers=_hdr(tokens["partner"]))
        assert r.status_code == 403

    def test_sla_reassign_and_persist(self, tokens):
        r = requests.get(f"{API}/tasks/sla-board", headers=_hdr(tokens["mgr"]))
        d = r.json()
        assert d["tasks"], "need at least one open task on SLA board (seed data)"
        task = d["tasks"][0]
        current_assignee = task["assignee"]["id"] if task["assignee"] else None
        # Pick a different active user
        candidates = [u for u in d["users"] if u["id"] != current_assignee]
        assert candidates, "need at least one other active user"
        new_id = candidates[0]["id"]
        upd = requests.put(f"{API}/tasks/{task['id']}", json={"assigned_to": new_id}, headers=_hdr(tokens["mgr"]))
        assert upd.status_code == 200, upd.text
        assert upd.json()["task"]["assigned_to"] == new_id
        # Re-fetch board and confirm persisted
        r2 = requests.get(f"{API}/tasks/sla-board", headers=_hdr(tokens["mgr"]))
        found = [t for t in r2.json()["tasks"] if t["id"] == task["id"]]
        assert found, "task disappeared from board"
        assert found[0]["assignee"] and found[0]["assignee"]["id"] == new_id


# ---------- Role Home landing (server-side check: user.role field returned by /me) ----------

class TestRoleHome:
    """Client routes on role field. Verify /me returns the expected roles used by app.js."""
    @pytest.mark.parametrize("email,password,expected_role", [
        ("crm@crm.local", "Demo@12345", "crm_support"),
        ("priya@crm.local", "Demo@12345", "sales_head"),
        ("partner@crm.local", "Demo@12345", "channel_partner"),
        ("rahul@crm.local", "Demo@12345", "sales_bde"),
    ])
    def test_me_role(self, email, password, expected_role):
        d = _login(email, password)
        assert d["user"]["role"] == expected_role, d["user"]

    def test_partner_collections_denied(self, tokens):
        """CS lands on /collections which calls GET /collections — should be 200."""
        r = requests.get(f"{API}/collections", headers=_hdr(tokens["cs"]))
        assert r.status_code == 200

    def test_partner_portal_accessible(self, tokens):
        r = requests.get(f"{API}/partner/portal", headers=_hdr(tokens["partner"]))
        assert r.status_code == 200

    def test_exec_call_list_accessible(self, tokens):
        r = requests.get(f"{API}/leads/call-list", headers=_hdr(tokens["exec"]))
        assert r.status_code == 200

    def test_mgr_dashboard_accessible(self, tokens):
        r = requests.get(f"{API}/dashboard", headers=_hdr(tokens["mgr"]))
        assert r.status_code == 200


# ---------- Partner Referral ----------

class TestPartnerReferral:
    @pytest.fixture(scope="class")
    def partner_info(self, tokens):
        r = requests.get(f"{API}/partner/portal", headers=_hdr(tokens["partner"]))
        assert r.status_code == 200
        d = r.json()
        assert "referral_code" in d["partner"]
        assert "referral_url" in d["partner"]
        assert d["partner"]["referral_url"].endswith("/refer/" + d["partner"]["referral_code"])
        return {"code": d["partner"]["referral_code"], "id": d["partner"]["id"], "url": d["partner"]["referral_url"]}

    def test_public_refer_success_and_attribution(self, tokens, partner_info):
        uniq = uuid.uuid4().hex[:8]
        payload = {
            "name": f"TEST_ref_{uniq}",
            "phone": f"98765{uniq[:5]}",
            "email": f"ref_{uniq}@example.com",
            "message": "Looking for 2BHK in Whitefield",
        }
        # NO auth
        r = requests.post(f"{API}/public/refer/{partner_info['code']}", json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "message" in d and "status" in d
        assert "thank" in d["message"].lower() or "Thank" in d["message"]

        # Verify attribution via admin
        leads_r = requests.get(f"{API}/leads", params={"q": payload["phone"]}, headers=_hdr(tokens["admin"]))
        assert leads_r.status_code == 200
        data = leads_r.json()
        rows = data.get("data") or data.get("leads") or []
        # Filter to our phone
        match = [l for l in rows if l.get("phone") == payload["phone"] or payload["phone"] in (l.get("phone") or "")]
        assert match, f"created lead not found: {data}"
        lead = match[0]
        assert lead.get("source") == "Partner Referral"
        assert lead.get("channel_partner_id") == partner_info["id"]

    def test_public_refer_bad_code_404(self):
        r = requests.post(f"{API}/public/refer/BADCODEXYZ", json={"name": "x", "phone": "9999999999"})
        assert r.status_code == 404
        assert "Invalid referral code" in r.text

    def test_web_refer_bad_code_404(self):
        r = requests.get(f"{BASE}/refer/BADCODEXYZ", headers={"Accept": "text/html"})
        assert r.status_code == 404

    def test_web_refer_valid_code_html(self, partner_info):
        r = requests.get(f"{BASE}/refer/{partner_info['code']}", headers={"Accept": "text/html"})
        assert r.status_code == 200
        html = r.text
        for testid in ["refer-form", "refer-name", "refer-phone", "refer-submit"]:
            assert f'data-testid="{testid}"' in html, f"missing {testid} in HTML"

    def test_public_refer_missing_required_422(self, partner_info):
        r = requests.post(f"{API}/public/refer/{partner_info['code']}", json={"email": "x@y.com"})
        assert r.status_code == 422

    def test_partner_portal_isolation(self, tokens, partner_info):
        """Partner sees ONLY leads where channel_partner_id == their id."""
        r = requests.get(f"{API}/partner/portal", headers=_hdr(tokens["partner"]))
        d = r.json()
        for lead in d["leads"]:
            assert lead["channel_partner_id"] == partner_info["id"], lead
        for bk in d["bookings"]:
            assert bk["channel_partner_id"] == partner_info["id"], bk

    def test_partner_still_403_on_leads_index(self, tokens):
        """Cross-check: partner must remain locked out of generic /leads listing (iter_8 regression)."""
        r = requests.get(f"{API}/leads", headers=_hdr(tokens["partner"]))
        assert r.status_code == 403
        r2 = requests.get(f"{API}/leads/board", headers=_hdr(tokens["partner"]))
        assert r2.status_code == 403
