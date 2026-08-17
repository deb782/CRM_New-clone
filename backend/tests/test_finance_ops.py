"""Finance & Operations backend tests (Laravel CRM).

Covers:
- Auth for new demo accounts (management, site1, site2)
- Two-stage expense approval + 403 gating + reject-reason requirement
- Expense raise + project-scoping (site manager)
- Cross-CRM project scoping (expenses/leads/inventory)
- Stock: inward requires approved expense; outward free
- Finance overview derivation + revenue targets
- User project assignment endpoint
"""
import os
import pytest
import requests

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/crm-api/v1"


def _login(email, password):
    r = requests.post(f"{BASE}/auth/login",
                      json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login {email} -> {r.status_code} {r.text[:200]}"
    j = r.json()
    return j["token"], j["user"]


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Accept": "application/json"}


# ---------- fixtures ----------
@pytest.fixture(scope="session")
def admin():
    tok, u = _login("admin@crm.local", "Admin@12345")
    return {"tok": tok, "user": u}


@pytest.fixture(scope="session")
def mgmt():
    tok, u = _login("management@crm.local", "Demo@12345")
    return {"tok": tok, "user": u}


@pytest.fixture(scope="session")
def site1():
    tok, u = _login("site1@crm.local", "Demo@12345")
    return {"tok": tok, "user": u}


@pytest.fixture(scope="session")
def site2():
    tok, u = _login("site2@crm.local", "Demo@12345")
    return {"tok": tok, "user": u}


@pytest.fixture(scope="session")
def accounts():
    tok, u = _login("accountshead@crm.local", "Demo@12345")
    return {"tok": tok, "user": u}


@pytest.fixture(scope="session")
def rahul():
    tok, u = _login("rahul@crm.local", "Demo@12345")
    return {"tok": tok, "user": u}


# ---------- Auth / login for new roles ----------
class TestAuth:
    def test_management_login(self, mgmt):
        assert mgmt["user"]["role"] == "management"

    def test_site1_login(self, site1):
        assert site1["user"]["role"] == "site_manager"
        # site1 should be assigned to at least one project
        assert isinstance(site1["user"].get("projects"), list)
        assert len(site1["user"]["projects"]) >= 1

    def test_site2_login(self, site2):
        assert site2["user"]["role"] == "site_manager"


# ---------- Expense two-stage approval + gating ----------
def _extract_expense(resp):
    j = resp.json()
    return j.get("expense") or j.get("data") or j


def _raise_expense(tok, project_id, amount=1234, category="material", desc="TEST expense"):
    r = requests.post(f"{BASE}/expenses",
                      headers=_h(tok),
                      json={"project_id": project_id,
                            "title": desc,
                            "amount": int(amount),
                            "category": category,
                            "description": desc,
                            "incurred_on": "2026-08-15"},
                      timeout=30)
    return r


class TestExpenseWorkflow:
    def test_site1_raise_on_assigned_project(self, site1):
        r = _raise_expense(site1["tok"], project_id=1, amount=999)
        assert r.status_code in (200, 201), r.text[:300]
        j = r.json()
        exp = j.get("expense") or j.get("data") or j
        assert exp["status"] == "pending_accounts"
        assert int(exp["amount"]) == 999

    def test_site1_raise_on_unassigned_project_forbidden(self, site1):
        r = _raise_expense(site1["tok"], project_id=2)
        assert r.status_code == 403, f"expected 403 got {r.status_code} {r.text[:200]}"

    def test_two_stage_approval_happy_path(self, site1, accounts, mgmt):
        r = _raise_expense(site1["tok"], 1, amount=555.0, desc="TEST 2stage")
        assert r.status_code in (200, 201)
        exp_id = _extract_expense(r)["id"]

        # Management cannot do stage-1
        r_bad = requests.post(f"{BASE}/expenses/{exp_id}/approve-accounts",
                              headers=_h(mgmt["tok"]), timeout=30)
        assert r_bad.status_code == 403, f"mgmt stage1 should be 403 got {r_bad.status_code}"

        # Accounts stage 1
        r1 = requests.post(f"{BASE}/expenses/{exp_id}/approve-accounts",
                           headers=_h(accounts["tok"]), timeout=30)
        assert r1.status_code == 200, r1.text[:200]
        assert _extract_expense(r1)["status"] == "pending_management"

        # Accounts cannot do stage 2
        r_bad2 = requests.post(f"{BASE}/expenses/{exp_id}/approve-management",
                               headers=_h(accounts["tok"]), timeout=30)
        assert r_bad2.status_code == 403

        # Management final approval
        r2 = requests.post(f"{BASE}/expenses/{exp_id}/approve-management",
                           headers=_h(mgmt["tok"]), timeout=30)
        assert r2.status_code == 200, r2.text[:200]
        assert _extract_expense(r2)["status"] == "approved"

    def test_site_manager_cannot_approve(self, site1, site2):
        r = _raise_expense(site1["tok"], 1, amount=111, desc="TEST site cannot approve")
        exp_id = _extract_expense(r)["id"]
        r_bad = requests.post(f"{BASE}/expenses/{exp_id}/approve-accounts",
                              headers=_h(site2["tok"]), timeout=30)
        assert r_bad.status_code == 403

    def test_reject_requires_reason(self, site1, accounts):
        r = _raise_expense(site1["tok"], 1, amount=222, desc="TEST reject")
        exp_id = _extract_expense(r)["id"]

        # empty body -> 422
        r_empty = requests.post(f"{BASE}/expenses/{exp_id}/reject",
                                headers=_h(accounts["tok"]),
                                json={}, timeout=30)
        assert r_empty.status_code == 422, f"expected 422 got {r_empty.status_code} {r_empty.text[:200]}"

        # with reason -> 200
        r_ok = requests.post(f"{BASE}/expenses/{exp_id}/reject",
                             headers=_h(accounts["tok"]),
                             json={"reason": "TEST rejection reason"}, timeout=30)
        assert r_ok.status_code == 200, r_ok.text[:200]
        body = _extract_expense(r_ok)
        assert body["status"] == "rejected"


# ---------- Project scoping across CRM ----------
class TestProjectScoping:
    def test_site1_expenses_scoped(self, site1):
        r = requests.get(f"{BASE}/expenses", headers=_h(site1["tok"]), timeout=30)
        assert r.status_code == 200, r.text[:300]
        rows = r.json().get("data", r.json())
        if isinstance(rows, dict) and "data" in rows:
            rows = rows["data"]
        for e in rows:
            assert e["project_id"] == 1, f"site1 saw project_id={e['project_id']}"

    def test_site1_leads_scoped(self, site1):
        r = requests.get(f"{BASE}/leads", headers=_h(site1["tok"]), timeout=30)
        # site_manager role has no leads.view permission -> expected 403
        if r.status_code == 403:
            pytest.skip("site_manager has no leads.view permission (RBAC by design)")
        assert r.status_code == 200
        rows = r.json().get("data", r.json())
        if isinstance(rows, dict) and "data" in rows:
            rows = rows["data"]
        for l in rows:
            if "project_id" in l and l["project_id"] is not None:
                assert l["project_id"] == 1

    def test_site1_inventory_scoped(self, site1):
        r = requests.get(f"{BASE}/inventory/tree", headers=_h(site1["tok"]), timeout=30)
        assert r.status_code == 200, r.text[:300]
        tree = r.json().get("data", r.json())
        if isinstance(tree, list):
            for p in tree:
                assert p.get("id") == 1 or p.get("project_id") == 1

    def test_admin_sees_all(self, admin):
        r = requests.get(f"{BASE}/expenses", headers=_h(admin["tok"]), timeout=30)
        assert r.status_code == 200


# ---------- Stock Book ----------
class TestStock:
    def test_list_items(self, admin):
        r = requests.get(f"{BASE}/stock/items", headers=_h(admin["tok"]), timeout=30)
        assert r.status_code == 200, r.text[:200]
        rows = r.json().get("data", r.json())
        if isinstance(rows, dict) and "data" in rows:
            rows = rows["data"]
        if rows:
            it = rows[0]
            for k in ("opening_qty", "inward", "outward", "closing_qty"):
                assert k in it, f"missing key {k} in stock item"

    def test_inward_without_expense_422(self, admin):
        r = requests.get(f"{BASE}/stock/items", headers=_h(admin["tok"]), timeout=30)
        rows = r.json().get("data", r.json())
        if isinstance(rows, dict) and "data" in rows:
            rows = rows["data"]
        if not rows:
            pytest.skip("no stock items seeded")
        item_id = rows[0]["id"]
        r2 = requests.post(f"{BASE}/stock/items/{item_id}/movements",
                           headers=_h(admin["tok"]),
                           json={"direction": "inward", "qty": 10}, timeout=30)
        assert r2.status_code == 422, f"expected 422 got {r2.status_code} {r2.text[:200]}"

    def test_inward_with_approved_expense_ok(self, admin, site1, accounts, mgmt):
        # ensure an approved expense on project 1 exists
        r = requests.get(f"{BASE}/stock/approved-expenses?project_id=1",
                         headers=_h(admin["tok"]), timeout=30)
        assert r.status_code == 200, r.text[:200]
        arr = r.json().get("data", r.json())
        if isinstance(arr, dict) and "data" in arr:
            arr = arr["data"]
        if not arr:
            # create one
            rr = _raise_expense(site1["tok"], 1, amount=777, desc="TEST for stock inward")
            eid = _extract_expense(rr)["id"]
            requests.post(f"{BASE}/expenses/{eid}/approve-accounts", headers=_h(accounts["tok"]), timeout=30)
            requests.post(f"{BASE}/expenses/{eid}/approve-management", headers=_h(mgmt["tok"]), timeout=30)
            r = requests.get(f"{BASE}/stock/approved-expenses?project_id=1",
                             headers=_h(admin["tok"]), timeout=30)
            arr = r.json().get("data", r.json())
            if isinstance(arr, dict) and "data" in arr:
                arr = arr["data"]
        assert arr, "no approved expenses available"
        expense_id = arr[0]["id"]

        # find a stock item on project 1
        r_items = requests.get(f"{BASE}/stock/items?project_id=1", headers=_h(admin["tok"]), timeout=30)
        items = r_items.json().get("data", r_items.json())
        if isinstance(items, dict) and "data" in items:
            items = items["data"]
        proj1_items = [i for i in items if i.get("project_id") == 1] or items
        if not proj1_items:
            pytest.skip("no stock items")
        item_id = proj1_items[0]["id"]

        r_mv = requests.post(f"{BASE}/stock/items/{item_id}/movements",
                             headers=_h(admin["tok"]),
                             json={"direction": "inward", "qty": 5,
                                   "expense_id": expense_id}, timeout=30)
        assert r_mv.status_code in (200, 201), r_mv.text[:300]

    def test_outward_without_expense_ok(self, admin):
        r = requests.get(f"{BASE}/stock/items", headers=_h(admin["tok"]), timeout=30)
        rows = r.json().get("data", r.json())
        if isinstance(rows, dict) and "data" in rows:
            rows = rows["data"]
        if not rows:
            pytest.skip()
        item_id = rows[0]["id"]
        r2 = requests.post(f"{BASE}/stock/items/{item_id}/movements",
                           headers=_h(admin["tok"]),
                           json={"direction": "outward", "qty": 1}, timeout=30)
        assert r2.status_code in (200, 201), r2.text[:300]


# ---------- Finance overview ----------
class TestFinance:
    def test_overview(self, mgmt):
        r = requests.get(f"{BASE}/finance/overview?period=2026-08",
                         headers=_h(mgmt["tok"]), timeout=30)
        assert r.status_code == 200, r.text[:300]
        body = r.json()
        rows = body.get("rows") or body.get("data") or body
        assert rows, "empty finance overview"
        # Validate expected keys on first row
        first = rows[0] if isinstance(rows, list) else (rows.get("projects") or [{}])[0]
        for k in ("accrued", "received", "receivable", "expenses", "net"):
            assert k in first, f"missing key {k}"

    def test_rahul_forbidden_from_finance(self, rahul):
        r = requests.get(f"{BASE}/finance/overview?period=2026-08",
                         headers=_h(rahul["tok"]), timeout=30)
        assert r.status_code == 403, f"expected 403 got {r.status_code}"

    def test_set_target_and_reflect(self, mgmt, admin):
        # Set a target as admin (management may or may not have perm)
        payload = {"project_id": 1, "period_type": "month",
                   "period": "2026-08", "amount": 5000000}
        r = requests.post(f"{BASE}/finance/targets", headers=_h(admin["tok"]),
                          json=payload, timeout=30)
        assert r.status_code in (200, 201), r.text[:300]

        r2 = requests.get(f"{BASE}/finance/overview?period=2026-08",
                          headers=_h(mgmt["tok"]), timeout=30)
        assert r2.status_code == 200
        body = r2.json()
        rows = body.get("rows") or body.get("data") or []
        proj1 = next((x for x in rows if x.get("project_id") == 1
                      or x.get("id") == 1), None)
        assert proj1, "project 1 not in overview"
        assert float(proj1.get("target") or 0) >= 5000000


# ---------- Project assignment ----------
class TestUserProjects:
    def test_assign_projects(self, admin, site1):
        uid = site1["user"]["id"]
        # get current
        r = requests.get(f"{BASE}/users", headers=_h(admin["tok"]), timeout=30)
        assert r.status_code == 200
        users = r.json().get("data", r.json())
        if isinstance(users, dict) and "data" in users:
            users = users["data"]
        u = next((x for x in users if x["id"] == uid), None)
        assert u is not None
        assert "projects" in u
        original = [p["id"] if isinstance(p, dict) else p for p in u["projects"]]

        # assign [1]
        r2 = requests.put(f"{BASE}/users/{uid}/projects",
                          headers=_h(admin["tok"]),
                          json={"project_ids": [1]}, timeout=30)
        assert r2.status_code == 200, r2.text[:300]

        # verify
        r3 = requests.get(f"{BASE}/users", headers=_h(admin["tok"]), timeout=30)
        users3 = r3.json().get("data", r3.json())
        if isinstance(users3, dict) and "data" in users3:
            users3 = users3["data"]
        u3 = next((x for x in users3 if x["id"] == uid), None)
        pids = [p["id"] if isinstance(p, dict) else p for p in u3["projects"]]
        assert 1 in pids

        # restore
        if original:
            requests.put(f"{BASE}/users/{uid}/projects",
                         headers=_h(admin["tok"]),
                         json={"project_ids": original}, timeout=30)
