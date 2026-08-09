"""Section L — Cost Sheet, Discount Approvals, Payment Plans, Proposals."""
import uuid
import requests

BASE = "http://127.0.0.1:8000"
API = f"{BASE}/api/v1"


def _h(token):
    return {"Authorization": f"Bearer {token}", "Accept": "application/json"}


# ---------- Payment Plans ----------
class TestPaymentPlans:
    def test_list_seeded_plans(self, admin_token):
        r = requests.get(f"{API}/payment-plans", headers=_h(admin_token))
        assert r.status_code == 200
        plans = r.json().get("data", [])
        codes = {p.get("code") for p in plans}
        assert {"CLP", "DP", "FLEXI"}.issubset(codes), f"got codes={codes}"
        for p in plans:
            ms = p.get("milestones", [])
            total = sum(float(m.get("pct", m.get("percent", 0))) for m in ms)
            assert abs(total - 100) < 0.01, f"plan {p.get('code')} milestones sum={total}"

    def test_admin_can_create_plan(self, admin_token):
        code = f"TESTPP_{uuid.uuid4().hex[:5].upper()}"
        payload = {
            "code": code,
            "name": "Test Plan",
            "description": "auto",
            "milestones": [
                {"label": "Booking", "pct": 20, "due_days": 0},
                {"label": "Agreement", "pct": 80, "due_days": 30},
            ],
        }
        r = requests.post(f"{API}/payment-plans", json=payload, headers=_h(admin_token))
        assert r.status_code in (200, 201), r.text

    def test_exec_forbidden_to_create_plan(self, exec_token):
        payload = {
            "code": "TESTNO_" + uuid.uuid4().hex[:4],
            "name": "No",
            "milestones": [{"label": "x", "pct": 100, "due_days": 0}],
        }
        r = requests.post(f"{API}/payment-plans", json=payload, headers=_h(exec_token))
        assert r.status_code == 403, f"expected 403 got {r.status_code}: {r.text}"


# ---------- Cost Sheet Math ----------
class TestCostSheetMath:
    def test_within_5_auto_approved(self, admin_token, seed_lead):
        payload = {
            "base_price": 8000000, "gst_rate": 5, "registration_charges": 80000,
            "maintenance_charges": 120000, "discount_pct": 3,
        }
        r = requests.post(f"{API}/leads/{seed_lead['id']}/cost-sheets", json=payload, headers=_h(admin_token))
        assert r.status_code in (200, 201), r.text
        cs = r.json()["cost_sheet"]
        assert float(cs["gst_amount"]) == 400000
        assert float(cs["subtotal"]) == 8600000
        assert float(cs["discount_amount"]) == 240000
        assert float(cs["total"]) == 8360000
        assert cs["discount_band"] == "within_5"
        assert cs["discount_status"] == "approved"

    def test_over_5_pending_creates_approval(self, admin_token, seed_lead):
        payload = {"base_price": 8000000, "gst_rate": 5, "discount_pct": 8}
        r = requests.post(f"{API}/leads/{seed_lead['id']}/cost-sheets", json=payload, headers=_h(admin_token))
        assert r.status_code in (200, 201), r.text
        cs = r.json()["cost_sheet"]
        assert cs["discount_band"] == "over_5"
        assert cs["discount_status"] == "pending"
        # approval exists
        r2 = requests.get(f"{API}/discount-approvals?status=pending", headers=_h(admin_token))
        assert r2.status_code == 200
        rows = r2.json().get("data", [])
        assert any(a.get("cost_sheet_id") == cs["id"] for a in rows), "approval not listed"

    def test_over_10_band(self, admin_token, seed_lead):
        payload = {"base_price": 8000000, "discount_pct": 12}
        r = requests.post(f"{API}/leads/{seed_lead['id']}/cost-sheets", json=payload, headers=_h(admin_token))
        assert r.status_code in (200, 201), r.text
        cs = r.json()["cost_sheet"]
        assert cs["discount_band"] == "over_10"
        assert cs["discount_status"] == "pending"


# ---------- Proposal Gating + Approval Decisions ----------
class TestApprovalsAndProposals:
    def _mk_pending(self, token, lead_id, pct=8):
        r = requests.post(f"{API}/leads/{lead_id}/cost-sheets",
                          json={"base_price": 8000000, "discount_pct": pct}, headers=_h(token))
        assert r.status_code in (200, 201), r.text
        return r.json()["cost_sheet"]

    def test_proposal_gated_when_pending(self, admin_token, seed_lead):
        cs = self._mk_pending(admin_token, seed_lead["id"])
        r = requests.post(f"{API}/cost-sheets/{cs['id']}/proposal", headers=_h(admin_token))
        assert r.status_code == 422, f"expected 422 got {r.status_code}: {r.text}"

    def _find_approval_id(self, token, cs_id):
        r = requests.get(f"{API}/discount-approvals?status=pending", headers=_h(token))
        for a in r.json().get("data", []):
            if a.get("cost_sheet_id") == cs_id:
                return a["id"]
        return None

    def test_exec_forbidden_to_decide(self, admin_token, exec_token, seed_lead):
        cs = self._mk_pending(admin_token, seed_lead["id"])
        aid = self._find_approval_id(admin_token, cs["id"])
        assert aid
        r = requests.post(f"{API}/discount-approvals/{aid}/decide",
                          json={"decision": "approved"}, headers=_h(exec_token))
        assert r.status_code == 403, f"expected 403 got {r.status_code}"

    def test_manager_approves(self, admin_token, mgr_token, seed_lead):
        cs = self._mk_pending(admin_token, seed_lead["id"])
        aid = self._find_approval_id(admin_token, cs["id"])
        r = requests.post(f"{API}/discount-approvals/{aid}/decide",
                          json={"decision": "approved"}, headers=_h(mgr_token))
        assert r.status_code == 200, r.text
        appr = r.json().get("approval", r.json())
        assert appr.get("status") == "approved"
        # verify cost_sheet
        r2 = requests.get(f"{API}/cost-sheets/{cs['id']}", headers=_h(admin_token))
        assert r2.json()["cost_sheet"]["discount_status"] == "approved"

    def test_manager_rejects(self, admin_token, mgr_token, seed_lead):
        cs = self._mk_pending(admin_token, seed_lead["id"])
        aid = self._find_approval_id(admin_token, cs["id"])
        r = requests.post(f"{API}/discount-approvals/{aid}/decide",
                          json={"decision": "rejected", "reason": "too high"}, headers=_h(mgr_token))
        assert r.status_code == 200, r.text
        appr = r.json().get("approval", r.json())
        assert appr.get("status") == "rejected"

    def test_counter_recomputes(self, admin_token, mgr_token, seed_lead):
        cs = self._mk_pending(admin_token, seed_lead["id"], pct=8)
        aid = self._find_approval_id(admin_token, cs["id"])
        r = requests.post(f"{API}/discount-approvals/{aid}/decide",
                          json={"decision": "counter", "counter_pct": 4}, headers=_h(mgr_token))
        assert r.status_code == 200, r.text
        r2 = requests.get(f"{API}/cost-sheets/{cs['id']}", headers=_h(admin_token))
        cs2 = r2.json()["cost_sheet"]
        assert cs2["discount_status"] == "approved"
        assert float(cs2["discount_pct"]) == 4
        # discount_amount = 4% of 8,000,000 = 320,000
        assert float(cs2["discount_amount"]) == 320000

    def test_full_proposal_flow(self, admin_token, mgr_token, seed_lead):
        # create over-5, approve, generate proposal, send, consent
        cs = self._mk_pending(admin_token, seed_lead["id"], pct=7)
        aid = self._find_approval_id(admin_token, cs["id"])
        requests.post(f"{API}/discount-approvals/{aid}/decide",
                      json={"decision": "approved"}, headers=_h(mgr_token)).raise_for_status()
        r = requests.post(f"{API}/cost-sheets/{cs['id']}/proposal", headers=_h(admin_token))
        assert r.status_code in (200, 201), r.text
        prop = r.json()["proposal"]
        assert prop.get("reference_no", "").startswith("PROP-")
        pid = prop["id"]
        r2 = requests.post(f"{API}/proposals/{pid}/send", headers=_h(admin_token))
        assert r2.status_code == 200, r2.text
        assert r2.json()["proposal"]["status"] == "sent"
        r3 = requests.post(f"{API}/proposals/{pid}/consent",
                           json={"name": "Vikram Nair"}, headers=_h(admin_token))
        assert r3.status_code == 200, r3.text
        p3 = r3.json()["proposal"]
        assert p3["consent_captured"] in (True, 1, "1")
        assert p3["consent_name"] == "Vikram Nair"
        assert p3["status"] == "accepted"


# ---------- Select plan + share + list ----------
class TestSelectPlanShareList:
    def test_select_plan_and_share(self, admin_token, seed_lead):
        r = requests.post(f"{API}/leads/{seed_lead['id']}/cost-sheets",
                          json={"base_price": 5000000, "discount_pct": 2},
                          headers=_h(admin_token))
        cs = r.json()["cost_sheet"]
        # get any plan id
        plans = requests.get(f"{API}/payment-plans", headers=_h(admin_token)).json()["data"]
        plan_id = plans[0]["id"]
        rs = requests.post(f"{API}/cost-sheets/{cs['id']}/select-plan",
                           json={"payment_plan_id": plan_id}, headers=_h(admin_token))
        assert rs.status_code == 200, rs.text
        assert rs.json()["cost_sheet"]["payment_plan_id"] == plan_id
        sh = requests.post(f"{API}/cost-sheets/{cs['id']}/share", headers=_h(admin_token))
        assert sh.status_code == 200, sh.text
        assert sh.json()["cost_sheet"]["status"] == "shared"

    def test_lead_cost_sheet_listing(self, admin_token, seed_lead):
        r = requests.get(f"{API}/leads/{seed_lead['id']}/cost-sheets", headers=_h(admin_token))
        assert r.status_code == 200
        body = r.json()
        assert "cost_sheets" in body
        assert "proposals" in body
        assert isinstance(body["cost_sheets"], list)
