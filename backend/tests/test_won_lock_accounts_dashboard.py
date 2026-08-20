"""
Iteration 43 — Won Lead Lock, Accounts finance dashboard, Indian currency format.
Backend: LOCAL http://127.0.0.1:8000/api/v1
"""
import subprocess
import uuid
import requests
import pytest

BASE = "http://127.0.0.1:8000"
API = f"{BASE}/api/v1"
LARAVEL_DIR = "/app/laravel-crm"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    r.raise_for_status()
    return r.json()["token"]


def _tinker(code):
    """Run a PHP snippet inside the Laravel app and return raw stdout."""
    r = subprocess.run(
        ["php", "artisan", "tinker", "--execute", code],
        cwd=LARAVEL_DIR, capture_output=True, text=True, timeout=45,
    )
    return (r.stdout or "") + (r.stderr or "")


# --------------------------- Fixtures ---------------------------
@pytest.fixture(scope="module")
def admin_token():
    return _login("admin@crm.local", "Admin@12345")


@pytest.fixture(scope="module")
def accounts_token():
    return _login("accountshead@crm.local", "Demo@12345")


@pytest.fixture(scope="module")
def bdm_token():
    return _login("bdm@crm.local", "Demo@12345")


@pytest.fixture(scope="module")
def opp_lead(admin_token):
    """Create a lead and fast-forward its journey to OPP_NEGOTIATION (one step away from OPP_WON)."""
    uniq = uuid.uuid4().hex[:8]
    payload = {
        "name": f"TEST_won_{uniq}",
        "email": f"test_won_{uniq}@example.com",
        "phone": f"90000{uniq[:5]}",
        "source": "Website Form",
        "city": "Mumbai",
    }
    r = requests.post(f"{API}/leads", json=payload,
                      headers={"Authorization": f"Bearer {admin_token}", "Accept": "application/json"},
                      timeout=15)
    r.raise_for_status()
    lead = r.json().get("lead", r.json())
    lid = lead["id"]

    # Directly set status_code to OPP_NEGOTIATION so we can trigger auto-lock at OPP_WON via API.
    out = _tinker(
        f"$l=\\App\\Models\\Lead::find({lid});"
        f"$s=\\App\\Models\\LeadStatus::where('code','OPP_NEGOTIATION')->first();"
        f"$stage=\\App\\Models\\PipelineStage::where('slug',$s->pipeline_slug)->first();"
        f"$l->forceFill(['status_code'=>'OPP_NEGOTIATION','pipeline_stage_id'=>$stage?->id,'status'=>$stage?->slug,'locked'=>false])->save();"
        f"echo $l->status_code;"
    )
    assert "OPP_NEGOTIATION" in out, f"tinker setup failed: {out}"

    yield {"id": lid, "email": payload["email"], "phone": payload["phone"]}

    # Cleanup — force unlock then delete
    _tinker(
        f"$l=\\App\\Models\\Lead::find({lid});"
        f"if($l){{ $l->forceFill(['locked'=>false])->save(); $l->delete(); }}"
    )


# --------------------------- Won Lead Lock ---------------------------
class TestWonLeadLock:
    def test_journey_transition_to_won_locks_lead(self, opp_lead, admin_token):
        """POST journey transition to OPP_WON → sets locked=true."""
        r = requests.post(
            f"{API}/journey/leads/{opp_lead['id']}/transition",
            json={"code": "OPP_WON", "reason": "test won"},
            headers={"Authorization": f"Bearer {admin_token}", "Accept": "application/json"},
            timeout=15,
        )
        assert r.status_code == 200, f"got {r.status_code}: {r.text[:300]}"
        body = r.json()
        assert body.get("ok") is True
        assert body["lead"]["locked"] in (True, 1)
        assert body["lead"]["status_code"] == "OPP_WON"

    def test_journey_transition_blocked_after_won(self, opp_lead, admin_token):
        """Any further journey transition returns ok=false with 'locked' flag / Won message."""
        r = requests.post(
            f"{API}/journey/leads/{opp_lead['id']}/transition",
            json={"code": "OPP_LOST", "reason": "should be blocked"},
            headers={"Authorization": f"Bearer {admin_token}", "Accept": "application/json"},
            timeout=15,
        )
        # Controller returns 422 with locked=true message; ok=false path.
        assert r.status_code == 422, f"got {r.status_code}: {r.text[:300]}"
        msg = (r.json().get("message") or "").lower()
        assert "won" in msg and "lock" in msg, f"unexpected msg: {msg}"

    def test_kanban_transition_returns_423(self, bdm_token, admin_token):
        """POST Kanban board transition to a different stage on a locked lead returns 423 (non-override user).
        Uses its own fresh locked lead so this doesn't depend on other test ordering."""
        uniq = uuid.uuid4().hex[:8]
        r = requests.post(f"{API}/leads",
                          json={"name": f"TEST_lock_{uniq}", "email": f"lock_{uniq}@ex.com",
                                "phone": f"91100{uniq[:5]}", "source": "Website Form", "city": "Delhi"},
                          headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
        r.raise_for_status()
        lid = r.json().get("lead", r.json())["id"]
        # Force lock the lead directly.
        _tinker(
            f"$l=\\App\\Models\\Lead::find({lid});"
            f"$s=\\App\\Models\\PipelineStage::where('slug','won')->first();"
            f"$l->forceFill(['status_code'=>'OPP_WON','pipeline_stage_id'=>$s?->id,'status'=>'won','locked'=>true,'locked_at'=>now()])->save();"
        )
        try:
            r2 = requests.post(
                f"{API}/leads/{lid}/transition",
                json={"stage": "negotiation", "reason": "should be blocked"},
                headers={"Authorization": f"Bearer {bdm_token}", "Accept": "application/json"},
                timeout=15,
            )
            assert r2.status_code == 423, f"expected 423, got {r2.status_code}: {r2.text[:300]}"
        finally:
            _tinker(f"$l=\\App\\Models\\Lead::find({lid}); if($l){{ $l->forceFill(['locked'=>false])->save(); $l->delete(); }}")


# --------------------------- Accounts dashboard ---------------------------
class TestAccountsDashboard:
    def test_dashboard_returns_functional_accounts(self, accounts_token):
        r = requests.get(f"{API}/dashboard",
                         headers={"Authorization": f"Bearer {accounts_token}", "Accept": "application/json"},
                         timeout=15)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d.get("view") == "functional"
        assert d.get("dept") == "accounts"
        assert d.get("heading") == "Accounts & Finance"

        kpi_labels = [k.get("label") for k in d.get("kpis", [])]
        for expected in ["Received This Month", "Collections Due", "Overdue", "GST Billed (MTD)"]:
            assert expected in kpi_labels, f"missing KPI {expected}; got {kpi_labels}"

        panel_testids = [p.get("testid") for p in d.get("panels", [])]
        assert "acc-receipts" in panel_testids
        assert "acc-payments" in panel_testids

    def test_kpi_values_are_indian_rupee_formatted(self, accounts_token):
        r = requests.get(f"{API}/dashboard",
                         headers={"Authorization": f"Bearer {accounts_token}", "Accept": "application/json"},
                         timeout=15)
        d = r.json()
        for k in d.get("kpis", []):
            v = str(k.get("value", ""))
            assert v.startswith("₹"), f"KPI {k.get('label')} value not rupee-prefixed: {v}"
            # ASCII-format like ₹100,000 is disallowed for values ≥ 100000
            digits = v.replace("₹", "").replace(",", "").replace("-", "")
            if digits.isdigit() and int(digits) >= 100000:
                # Must have Indian grouping — last group of 3, prior groups of 2
                # e.g. 1,00,000 not 100,000
                stripped = v.replace("₹", "").replace("-", "")
                parts = stripped.split(",")
                if len(parts) >= 2:
                    assert len(parts[-1]) == 3, f"last group wrong in {v}"
                    for p in parts[1:-1]:
                        assert len(p) == 2, f"middle group not 2 digits in {v}"


# --------------------------- Money helper (Indian format) ---------------------------
class TestMoneyHelper:
    def test_inr_100000(self):
        out = _tinker("echo \\App\\Support\\Money::inr(100000);").strip()
        assert "₹1,00,000" in out, f"expected ₹1,00,000; got: {out!r}"

    def test_inr_12345678(self):
        out = _tinker("echo \\App\\Support\\Money::inr(12345678);").strip()
        assert "₹1,23,45,678" in out, f"expected ₹1,23,45,678; got: {out!r}"

    def test_inr_small(self):
        out = _tinker("echo \\App\\Support\\Money::inr(999);").strip()
        assert "₹999" in out, f"got: {out!r}"


# --------------------------- Regression ---------------------------
class TestRegression:
    def test_admin_dashboard_loads(self, admin_token):
        r = requests.get(f"{API}/dashboard",
                         headers={"Authorization": f"Bearer {admin_token}"},
                         timeout=15)
        assert r.status_code == 200
        assert r.json().get("view") in ("admin", "sales", "functional")

    def test_sales_bdm_cockpit_loads(self, bdm_token):
        r = requests.get(f"{API}/dashboard",
                         headers={"Authorization": f"Bearer {bdm_token}"},
                         timeout=15)
        assert r.status_code == 200
        assert r.json().get("view") == "sales"

    def test_normal_lead_can_transition(self, admin_token):
        """A non-won lead should still transition freely via Kanban."""
        uniq = uuid.uuid4().hex[:8]
        r = requests.post(
            f"{API}/leads",
            json={"name": f"TEST_reg_{uniq}", "email": f"reg_{uniq}@ex.com",
                  "phone": f"98765{uniq[:5]}", "source": "Website Form", "city": "Pune"},
            headers={"Authorization": f"Bearer {admin_token}"}, timeout=15,
        )
        r.raise_for_status()
        lid = r.json().get("lead", r.json())["id"]
        try:
            r2 = requests.post(
                f"{API}/leads/{lid}/transition",
                json={"stage": "contacted", "reason": "regression"},
                headers={"Authorization": f"Bearer {admin_token}"}, timeout=15,
            )
            assert r2.status_code == 200, f"got {r2.status_code}: {r2.text[:300]}"
        finally:
            _tinker(f"$l=\\App\\Models\\Lead::find({lid}); if($l){{ $l->delete(); }}")
