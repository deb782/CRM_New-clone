"""Phase 4: Workflow Execution Engine + Checklist + Starter Library tests."""
import os
import subprocess
import time
import pytest
import requests

BASE = "http://localhost:8000"
API = BASE + "/api/v1"
LARAVEL_CWD = "/app/laravel-crm"

CREDS = {
    "admin": ("admin@crm.local", "Admin@12345"),
    "process": ("process@crm.local", "Demo@12345"),
    "sales_head": ("priya@crm.local", "Demo@12345"),
    "accounts": ("accounts@crm.local", "Demo@12345"),
    "partner": ("partner@crm.local", "Demo@12345"),
}


def login(role):
    email, pw = CREDS[role]
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=10)
    assert r.status_code == 200, f"login {role} failed: {r.text}"
    return r.json()["token"]


def h(role):
    return {"Authorization": "Bearer " + login(role), "Accept": "application/json"}


def artisan(cmd):
    return subprocess.run(
        ["php", "artisan"] + cmd.split(), cwd=LARAVEL_CWD,
        capture_output=True, text=True, timeout=60,
    )


# ----- helpers to build a graph without HTML (engine only needs data + connections) -----
def make_graph(nodes):
    """nodes: list of dicts { id, node_type, data(extra), outputs:{output_1:[id], output_2:[id]} }"""
    data = {}
    for n in nodes:
        outputs = {}
        for port, targets in (n.get("outputs") or {}).items():
            outputs[port] = {"connections": [{"node": str(t), "output": "input_1"} for t in targets]}
        # ensure output_1 exists if not provided
        if not outputs and n["node_type"] != "condition":
            outputs["output_1"] = {"connections": []}
        if n["node_type"] == "condition":
            outputs.setdefault("output_1", {"connections": []})
            outputs.setdefault("output_2", {"connections": []})
        inputs = {"input_1": {"connections": []}} if n["node_type"] != "trigger" else {}
        node_data = {"node_type": n["node_type"], **(n.get("data") or {})}
        data[str(n["id"])] = {
            "id": n["id"], "name": n["node_type"], "data": node_data,
            "class": "wf-t-" + n["node_type"], "html": "",
            "typenode": False, "inputs": inputs, "outputs": outputs,
            "pos_x": 100 * n["id"], "pos_y": 100,
        }
    return {"drawflow": {"Home": {"data": data}}}


def create_workflow(token, name, graph, activate=True):
    r = requests.post(f"{API}/workflows",
                      headers={"Authorization": "Bearer " + token, "Accept": "application/json"},
                      json={"name": name, "graph": graph}, timeout=10)
    assert r.status_code == 201, r.text
    wf = r.json()["workflow"]
    if activate:
        r2 = requests.post(f"{API}/workflows/{wf['id']}/activate",
                           headers={"Authorization": "Bearer " + token, "Accept": "application/json"}, timeout=10)
        assert r2.status_code == 200, r2.text
    return wf


@pytest.fixture(scope="module")
def ptoken():
    return login("process")


@pytest.fixture(scope="module", autouse=True)
def reset_workflows(ptoken):
    """Clean workflows before each module run."""
    subprocess.run(["php", "artisan", "tinker", "--execute",
                    "App\\Models\\WorkflowRun::query()->delete(); "
                    "App\\Models\\Workflow::where('name','like','TEST_%')->delete();"],
                   cwd=LARAVEL_CWD, capture_output=True, text=True, timeout=30)
    yield
    subprocess.run(["php", "artisan", "tinker", "--execute",
                    "App\\Models\\WorkflowRun::query()->delete(); "
                    "App\\Models\\Workflow::where('name','like','TEST_%')->delete();"],
                   cwd=LARAVEL_CWD, capture_output=True, text=True, timeout=30)


@pytest.fixture
def hot_lead_id():
    """Ensure at least one hot lead exists; return its id."""
    out = subprocess.run(["php", "artisan", "tinker", "--execute",
                          "$l=App\\Models\\Lead::latest('id')->first(); "
                          "$l->temperature='Hot'; $l->save(); echo $l->id;"],
                         cwd=LARAVEL_CWD, capture_output=True, text=True, timeout=30)
    return int(out.stdout.strip().splitlines()[-1])


# ============ Execution engine ============

def test_simulate_condition_branch_hot(ptoken, hot_lead_id):
    """Trigger -> WA -> Condition (temp=Hot) -> [Y]Email  / [N]Task."""
    graph = make_graph([
        {"id": 1, "node_type": "trigger", "data": {"trigger_type": "new_lead"}, "outputs": {"output_1": [2]}},
        {"id": 2, "node_type": "send_whatsapp", "data": {"template": "wa_welcome"}, "outputs": {"output_1": [3]}},
        {"id": 3, "node_type": "condition", "data": {"field": "temperature", "operator": "=", "value": "Hot"},
         "outputs": {"output_1": [4], "output_2": [5]}},
        {"id": 4, "node_type": "send_email", "data": {"template": "hot_email"}},
        {"id": 5, "node_type": "task", "data": {"title": "Follow up", "task_type": "call", "due_hours": 4}},
    ])
    wf = create_workflow(ptoken, "TEST_cond_hot", graph, activate=True)
    r = requests.post(f"{API}/workflows/{wf['id']}/simulate",
                      headers={"Authorization": "Bearer " + ptoken}, json={"lead_id": hot_lead_id}, timeout=10)
    assert r.status_code == 200, r.text
    run = r.json()["run"]
    assert run["status"] == "completed"
    types = [s["type"] for s in run["log"]]
    assert types == ["trigger", "send_whatsapp", "condition", "send_email"], types
    assert "YES" in run["log"][2]["detail"]


def test_simulate_condition_branch_not_hot(ptoken):
    """Set lead temp to Warm and expect output_2 -> task."""
    out = subprocess.run(["php", "artisan", "tinker", "--execute",
                          "$l=App\\Models\\Lead::latest('id')->first(); "
                          "$l->temperature='Warm'; $l->save(); echo $l->id;"],
                         cwd=LARAVEL_CWD, capture_output=True, text=True, timeout=30)
    lead_id = int(out.stdout.strip().splitlines()[-1])
    graph = make_graph([
        {"id": 1, "node_type": "trigger", "data": {"trigger_type": "new_lead"}, "outputs": {"output_1": [2]}},
        {"id": 2, "node_type": "condition", "data": {"field": "temperature", "operator": "=", "value": "Hot"},
         "outputs": {"output_1": [3], "output_2": [4]}},
        {"id": 3, "node_type": "send_email", "data": {"template": "hot"}},
        {"id": 4, "node_type": "task", "data": {"title": "Warm follow"}},
    ])
    wf = create_workflow(ptoken, "TEST_cond_warm", graph, activate=True)
    r = requests.post(f"{API}/workflows/{wf['id']}/simulate",
                      headers={"Authorization": "Bearer " + ptoken}, json={"lead_id": lead_id}, timeout=10)
    assert r.status_code == 200
    types = [s["type"] for s in r.json()["run"]["log"]]
    assert types == ["trigger", "condition", "task"], types


def test_simulate_uses_latest_lead_when_no_id(ptoken):
    graph = make_graph([
        {"id": 1, "node_type": "trigger", "data": {"trigger_type": "new_lead"}, "outputs": {"output_1": [2]}},
        {"id": 2, "node_type": "send_email", "data": {"template": "x"}},
    ])
    wf = create_workflow(ptoken, "TEST_latest_lead", graph, activate=True)
    r = requests.post(f"{API}/workflows/{wf['id']}/simulate",
                      headers={"Authorization": "Bearer " + ptoken}, json={}, timeout=10)
    assert r.status_code == 200
    body = r.json()
    assert "lead" in body and "id" in body["lead"]
    assert body["run"]["status"] == "completed"


# ============ Wait / resume ============

def test_wait_pauses_and_resumes(ptoken, hot_lead_id):
    graph = make_graph([
        {"id": 1, "node_type": "trigger", "data": {"trigger_type": "new_lead"}, "outputs": {"output_1": [2]}},
        {"id": 2, "node_type": "wait", "data": {"amount": 2, "unit": "days"}, "outputs": {"output_1": [3]}},
        {"id": 3, "node_type": "send_email", "data": {"template": "after_wait"}},
    ])
    wf = create_workflow(ptoken, "TEST_wait", graph, activate=True)
    r = requests.post(f"{API}/workflows/{wf['id']}/simulate",
                      headers={"Authorization": "Bearer " + ptoken}, json={"lead_id": hot_lead_id}, timeout=10)
    assert r.status_code == 200
    run = r.json()["run"]
    assert run["status"] == "waiting", run
    assert run["resume_at"] is not None
    assert run["current_node"] == "2"
    # last log entry is wait, and did not execute send_email
    types = [s["type"] for s in run["log"]]
    assert types == ["trigger", "wait"], types

    # Force resume_at into the past & run artisan
    run_id = run["id"]
    subprocess.run(["php", "artisan", "tinker", "--execute",
                    f"$r=App\\Models\\WorkflowRun::find({run_id}); "
                    f"$r->resume_at=now()->subMinute(); $r->save();"],
                   cwd=LARAVEL_CWD, capture_output=True, text=True, timeout=30)
    out = artisan("crm:flow-run")
    assert out.returncode == 0
    assert "resumed" in out.stdout.lower(), out.stdout

    # Verify run completed with send_email step
    r2 = requests.get(f"{API}/workflows/{wf['id']}/runs",
                      headers={"Authorization": "Bearer " + ptoken}, timeout=10)
    assert r2.status_code == 200
    runs = r2.json()["runs"]
    match = [x for x in runs if x["id"] == run_id][0]
    assert match["status"] == "completed", match
    types2 = [s["type"] for s in match["log"]]
    assert "send_email" in types2, types2


# ============ Real new_lead trigger ============

def test_new_lead_trigger_creates_run_and_task(ptoken):
    # Build a flow with trigger new_lead -> task, activate it
    graph = make_graph([
        {"id": 1, "node_type": "trigger", "data": {"trigger_type": "new_lead"}, "outputs": {"output_1": [2]}},
        {"id": 2, "node_type": "task", "data": {"title": "Flow Task TEST_flow_task", "task_type": "call", "due_hours": 2}},
    ])
    wf = create_workflow(ptoken, "TEST_new_lead_trigger", graph, activate=True)

    # Capture new lead via public chatbot endpoint (unauth'd)
    r = requests.post(f"{API}/chatbot", json={
        "name": "TEST_p4_lead", "phone": "+91999888" + str(int(time.time()))[-4:],
        "email": f"testp4_{int(time.time())}@example.com", "source": "TEST",
    }, timeout=10)
    assert r.status_code in (200, 201), r.text
    time.sleep(0.5)

    # Check a non-simulated WorkflowRun exists for this workflow
    r2 = requests.get(f"{API}/workflows/{wf['id']}/runs",
                      headers={"Authorization": "Bearer " + ptoken}, timeout=10)
    assert r2.status_code == 200
    runs = r2.json()["runs"]
    real = [x for x in runs if not x.get("simulated")]
    assert real, f"No non-simulated run found; runs: {runs}"
    assert real[0]["status"] == "completed"

    # Task should be created for that lead
    out = subprocess.run(["php", "artisan", "tinker", "--execute",
                          "echo App\\Models\\Task::where('title','Flow Task TEST_flow_task')->count();"],
                         cwd=LARAVEL_CWD, capture_output=True, text=True, timeout=30)
    assert int(out.stdout.strip().splitlines()[-1]) >= 1


def test_lead_creation_not_broken_by_workflow_error(ptoken):
    """Even if a flow errors, lead capture must succeed."""
    # Broken workflow: trigger -> unknown/missing next node
    graph = make_graph([
        {"id": 1, "node_type": "trigger", "data": {"trigger_type": "new_lead"},
         "outputs": {"output_1": [999]}},  # dangling
    ])
    create_workflow(ptoken, "TEST_broken_flow", graph, activate=True)
    r = requests.post(f"{API}/chatbot", json={
        "name": "TEST_p4_robust", "phone": "+91777666" + str(int(time.time()))[-4:],
        "email": f"testp4r_{int(time.time())}@example.com", "source": "TEST",
    }, timeout=10)
    assert r.status_code in (200, 201), r.text


# ============ Checklist API ============

def test_checklist_lists_templates_with_exists_flag(ptoken):
    # Create a template on WA side to test exists=true
    subprocess.run(["php", "artisan", "tinker", "--execute",
                    "App\\Models\\WhatsappTemplate::updateOrCreate(['name'=>'chklist_wa_exists'],"
                    "['language'=>'en','category'=>'MARKETING','body'=>'x','status'=>'approved']);"],
                   cwd=LARAVEL_CWD, capture_output=True, text=True, timeout=30)
    graph = make_graph([
        {"id": 1, "node_type": "trigger", "data": {"trigger_type": "new_lead"}, "outputs": {"output_1": [2]}},
        {"id": 2, "node_type": "send_whatsapp", "data": {"template": "chklist_wa_exists"}, "outputs": {"output_1": [3]}},
        {"id": 3, "node_type": "send_whatsapp", "data": {"template": "chklist_wa_missing"}, "outputs": {"output_1": [4]}},
        {"id": 4, "node_type": "send_email", "data": {"template": "chklist_email_missing"}},
    ])
    wf = create_workflow(ptoken, "TEST_checklist", graph, activate=False)
    r = requests.get(f"{API}/workflows/{wf['id']}/checklist",
                     headers={"Authorization": "Bearer " + ptoken}, timeout=10)
    assert r.status_code == 200
    body = r.json()
    wa_names = {x["name"]: x["exists"] for x in body["whatsapp"]}
    em_names = {x["name"]: x["exists"] for x in body["email"]}
    assert wa_names.get("chklist_wa_exists") is True
    assert wa_names.get("chklist_wa_missing") is False
    assert em_names.get("chklist_email_missing") is False


# ============ Runs API ============

def test_runs_endpoint_includes_lead_relation(ptoken, hot_lead_id):
    graph = make_graph([
        {"id": 1, "node_type": "trigger", "data": {"trigger_type": "new_lead"}, "outputs": {"output_1": [2]}},
        {"id": 2, "node_type": "send_email", "data": {"template": "x"}},
    ])
    wf = create_workflow(ptoken, "TEST_runs_api", graph, activate=True)
    requests.post(f"{API}/workflows/{wf['id']}/simulate",
                  headers={"Authorization": "Bearer " + ptoken}, json={"lead_id": hot_lead_id}, timeout=10)
    r = requests.get(f"{API}/workflows/{wf['id']}/runs",
                     headers={"Authorization": "Bearer " + ptoken}, timeout=10)
    assert r.status_code == 200
    runs = r.json()["runs"]
    assert len(runs) >= 1
    assert "lead" in runs[0] and runs[0]["lead"] is not None
    assert "name" in runs[0]["lead"]


# ============ RBAC ============

@pytest.mark.parametrize("role,expected", [
    ("admin", 200), ("process", 200), ("sales_head", 403),
])
def test_rbac_simulate(role, expected, ptoken, hot_lead_id):
    graph = make_graph([
        {"id": 1, "node_type": "trigger", "data": {"trigger_type": "new_lead"}, "outputs": {"output_1": [2]}},
        {"id": 2, "node_type": "send_email", "data": {"template": "x"}},
    ])
    wf = create_workflow(ptoken, f"TEST_rbac_sim_{role}", graph, activate=True)
    r = requests.post(f"{API}/workflows/{wf['id']}/simulate",
                      headers=h(role), json={"lead_id": hot_lead_id}, timeout=10)
    assert r.status_code == expected, f"{role}: {r.status_code} {r.text[:200]}"


@pytest.mark.parametrize("role,expected", [
    ("admin", 200), ("process", 200), ("sales_head", 403),
])
def test_rbac_runs(role, expected, ptoken):
    graph = make_graph([{"id": 1, "node_type": "trigger", "data": {"trigger_type": "new_lead"}}])
    wf = create_workflow(ptoken, f"TEST_rbac_runs_{role}", graph, activate=False)
    r = requests.get(f"{API}/workflows/{wf['id']}/runs", headers=h(role), timeout=10)
    assert r.status_code == expected


@pytest.mark.parametrize("role,expected", [
    ("admin", 200), ("process", 200), ("sales_head", 403),
])
def test_rbac_checklist(role, expected, ptoken):
    graph = make_graph([{"id": 1, "node_type": "trigger", "data": {"trigger_type": "new_lead"}}])
    wf = create_workflow(ptoken, f"TEST_rbac_cl_{role}", graph, activate=False)
    r = requests.get(f"{API}/workflows/{wf['id']}/checklist", headers=h(role), timeout=10)
    assert r.status_code == expected


# ============ Regression: Phase 1/2 RBAC ============

def test_regression_partner_leads_forbidden():
    r = requests.get(f"{API}/leads", headers=h("partner"), timeout=10)
    assert r.status_code == 403


def test_regression_accounts_edit_lead_forbidden():
    # Fetch any lead id via admin
    r = requests.get(f"{API}/leads", headers=h("admin"), timeout=10)
    assert r.status_code == 200
    leads = r.json().get("leads", r.json().get("data", []))
    if isinstance(leads, dict):
        leads = leads.get("data", [])
    if not leads:
        pytest.skip("no leads")
    lid = leads[0]["id"]
    r2 = requests.put(f"{API}/leads/{lid}", headers=h("accounts"), json={"name": "x"}, timeout=10)
    assert r2.status_code == 403
