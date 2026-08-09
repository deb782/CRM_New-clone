"""Backend tests for iteration 16: Canned Replies CRUD, Template Variables filling, Assignment Routing."""
import subprocess
import time
import pytest
import requests

BASE = "http://127.0.0.1:8000"
API = f"{BASE}/api/v1"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=10)
    assert r.status_code == 200, f"login {email}: {r.status_code} {r.text[:200]}"
    return r.json()["token"]


def H(tok):
    return {"Authorization": f"Bearer {tok}", "Accept": "application/json"}


def _tinker(stmt):
    proc = subprocess.run(
        ["php", "artisan", "tinker", "--execute", stmt],
        cwd="/app/laravel-crm", capture_output=True, text=True, timeout=30,
    )
    return proc.stdout + proc.stderr


@pytest.fixture(scope="session")
def priya_tok():
    return _login("priya@crm.local", "Demo@12345")


@pytest.fixture(scope="session")
def rahul_tok():
    return _login("rahul@crm.local", "Demo@12345")


@pytest.fixture(scope="session")
def partner_tok():
    return _login("partner@crm.local", "Demo@12345")


# ---------- Canned Replies CRUD ----------
class TestCannedReplies:
    def test_create_list_update_delete(self, priya_tok):
        payload = {"title": "TEST_Greeting", "shortcut": "/hi_test", "body": "Hello from TEST"}
        r = requests.post(f"{API}/whatsapp/canned-replies", headers=H(priya_tok), json=payload, timeout=10)
        assert r.status_code == 201, r.text[:300]
        obj = r.json()
        cr = obj.get("reply") or obj.get("canned_reply") or obj.get("data") or obj
        cid = cr.get("id")
        assert cid, f"no id in: {obj}"
        assert cr.get("title") == "TEST_Greeting"
        assert cr.get("body") == "Hello from TEST"

        # LIST
        rl = requests.get(f"{API}/whatsapp/canned-replies", headers=H(priya_tok), timeout=10)
        assert rl.status_code == 200
        items = rl.json().get("replies") or rl.json().get("canned_replies") or rl.json().get("data") or rl.json()
        if isinstance(items, dict):
            items = items.get("data", [])
        assert any(x.get("id") == cid for x in items), "created id not in list"

        # UPDATE
        ru = requests.put(f"{API}/whatsapp/canned-replies/{cid}", headers=H(priya_tok),
                          json={"title": "TEST_Greeting2", "shortcut": "/hi2_test", "body": "Hello v2"}, timeout=10)
        assert ru.status_code == 200, ru.text[:300]
        upd = (ru.json().get("reply") or ru.json().get("canned_reply") or ru.json().get("data") or ru.json())
        assert upd.get("title") == "TEST_Greeting2"
        assert upd.get("body") == "Hello v2"

        # DELETE
        rd = requests.delete(f"{API}/whatsapp/canned-replies/{cid}", headers=H(priya_tok), timeout=10)
        assert rd.status_code in (200, 204), rd.text[:200]

        # verify gone
        rl2 = requests.get(f"{API}/whatsapp/canned-replies", headers=H(priya_tok), timeout=10)
        items2 = rl2.json().get("replies") or rl2.json().get("canned_replies") or rl2.json().get("data") or rl2.json()
        if isinstance(items2, dict):
            items2 = items2.get("data", [])
        assert not any(x.get("id") == cid for x in items2), "deleted id still present"

    def test_missing_title_422(self, priya_tok):
        r = requests.post(f"{API}/whatsapp/canned-replies", headers=H(priya_tok),
                          json={"body": "no title"}, timeout=10)
        assert r.status_code == 422, f"expected 422 got {r.status_code}"

    def test_missing_body_422(self, priya_tok):
        r = requests.post(f"{API}/whatsapp/canned-replies", headers=H(priya_tok),
                          json={"title": "no body"}, timeout=10)
        assert r.status_code == 422

    def test_rahul_can_list_and_create(self, rahul_tok):
        rl = requests.get(f"{API}/whatsapp/canned-replies", headers=H(rahul_tok), timeout=10)
        assert rl.status_code == 200, f"rahul list got {rl.status_code}"
        rc = requests.post(f"{API}/whatsapp/canned-replies", headers=H(rahul_tok),
                           json={"title": "TEST_Rahul", "shortcut": "/rahul_t", "body": "hi from rahul"}, timeout=10)
        assert rc.status_code == 201, f"rahul create got {rc.status_code} {rc.text[:200]}"
        cid = (rc.json().get("reply") or rc.json().get("canned_reply") or rc.json().get("data") or rc.json()).get("id")
        if cid:
            requests.delete(f"{API}/whatsapp/canned-replies/{cid}", headers=H(rahul_tok))

    def test_partner_403(self, partner_tok):
        rl = requests.get(f"{API}/whatsapp/canned-replies", headers=H(partner_tok), timeout=10)
        assert rl.status_code == 403, f"partner list expected 403 got {rl.status_code}"
        rc = requests.post(f"{API}/whatsapp/canned-replies", headers=H(partner_tok),
                           json={"title": "TEST_P", "body": "x"}, timeout=10)
        assert rc.status_code == 403


# ---------- Template Variables ----------
class TestTemplateVariables:
    @pytest.fixture(scope="class")
    def synced(self, priya_tok):
        r = requests.post(f"{API}/whatsapp/templates/sync", headers=H(priya_tok), timeout=15)
        assert r.status_code == 200
        return r.json()

    def _fresh_conv(self, tok, hours_ago=0):
        # pick a lead
        rl = requests.get(f"{API}/leads?per_page=50", headers=H(tok), timeout=10)
        items = rl.json().get("data") or rl.json().get("leads") or rl.json()
        if isinstance(items, dict):
            items = items.get("data", [])
        lid = None
        for it in items:
            if not it.get("whatsapp_opt_out") and not it.get("do_not_contact"):
                lid = it["id"]; break
        lid = lid or items[0]["id"]
        rs = requests.post(f"{API}/whatsapp/simulate-inbound", headers=H(tok),
                           json={"lead_id": lid, "body": "tpl test"}, timeout=10)
        assert rs.status_code == 201, rs.text[:200]
        cid = (rs.json().get("conversation") or {}).get("id")
        if hours_ago:
            _tinker(f"\\App\\Models\\WhatsappConversation::find({cid})->update(['last_inbound_at'=>now()->subHours({hours_ago})]);")
        return cid

    def test_welcome_message_single_var(self, priya_tok, synced):
        cid = self._fresh_conv(priya_tok)
        r = requests.post(f"{API}/whatsapp/conversations/{cid}/reply", headers=H(priya_tok),
                          json={"type": "template", "template": "welcome_message", "variables": ["Ravi"]}, timeout=10)
        assert r.status_code == 200, r.text[:300]
        m = r.json().get("message") or r.json()
        body = m.get("body", "")
        assert "Ravi" in body, f"expected 'Ravi' in body, got: {body!r}"
        assert "{1}" not in body, f"placeholder not replaced: {body!r}"
        meta = m.get("meta") or {}
        if isinstance(meta, str):
            import json as _j; meta = _j.loads(meta)
        assert meta.get("variables") == ["Ravi"], f"meta.variables mismatch: {meta}"

    def test_template_outside_window_still_sends(self, priya_tok, synced):
        cid = self._fresh_conv(priya_tok, hours_ago=30)
        r = requests.post(f"{API}/whatsapp/conversations/{cid}/reply", headers=H(priya_tok),
                          json={"type": "template", "template": "welcome_message", "variables": ["Sita"]}, timeout=10)
        assert r.status_code == 200, r.text[:300]
        m = r.json().get("message") or r.json()
        assert "Sita" in m.get("body", "")

    def test_payment_due_two_vars_in_order(self, priya_tok, synced):
        cid = self._fresh_conv(priya_tok)
        r = requests.post(f"{API}/whatsapp/conversations/{cid}/reply", headers=H(priya_tok),
                          json={"type": "template", "template": "payment_due",
                                "variables": ["\u20B950,000", "15 Jan"]}, timeout=10)
        assert r.status_code == 200, r.text[:300]
        m = r.json().get("message") or r.json()
        body = m.get("body", "")
        assert "50,000" in body and "15 Jan" in body, f"placeholders not filled correctly: {body!r}"
        assert "{1}" not in body and "{2}" not in body, f"unfilled placeholders in: {body!r}"
        # order check: {1}=₹50,000 should appear before {2}=15 Jan
        assert body.index("50,000") < body.index("15 Jan"), f"order wrong: {body!r}"

    def test_template_no_vars_still_sends(self, priya_tok, synced):
        cid = self._fresh_conv(priya_tok)
        # 'followup' template likely has no variables — try without variables
        r = requests.post(f"{API}/whatsapp/conversations/{cid}/reply", headers=H(priya_tok),
                          json={"type": "template", "template": "followup"}, timeout=10)
        assert r.status_code == 200, r.text[:300]


# ---------- Settings + Assignment Routing ----------
class TestSettingsAndRouting:
    def test_settings_get_rahul_allowed(self, rahul_tok):
        r = requests.get(f"{API}/whatsapp/settings", headers=H(rahul_tok), timeout=10)
        assert r.status_code == 200, f"rahul GET settings got {r.status_code}"
        j = r.json()
        assert "auto_assign" in (j.get("settings") or j), f"missing auto_assign: {j}"

    def test_settings_put_rahul_403(self, rahul_tok):
        r = requests.put(f"{API}/whatsapp/settings", headers=H(rahul_tok),
                         json={"auto_assign": True}, timeout=10)
        assert r.status_code == 403

    def test_settings_put_priya_200(self, priya_tok):
        r = requests.put(f"{API}/whatsapp/settings", headers=H(priya_tok),
                         json={"auto_assign": True}, timeout=10)
        assert r.status_code == 200, r.text[:300]

    def test_auto_assign_on_assigns_agent(self, priya_tok):
        # Ensure ON
        requests.put(f"{API}/whatsapp/settings", headers=H(priya_tok), json={"auto_assign": True}, timeout=10)
        phone = f"9199{int(time.time()) % 1000000:06d}"
        wamid = f"wamid.TEST_{int(time.time()*1000)}"
        payload = {
            "entry": [{
                "changes": [{
                    "value": {
                        "messages": [{
                            "from": phone,
                            "id": wamid,
                            "type": "text",
                            "text": {"body": "hi auto-assign on"},
                            "timestamp": str(int(time.time()))
                        }]
                    },
                    "field": "messages"
                }]
            }]
        }
        r = requests.post(f"{API}/webhooks/whatsapp", json=payload, timeout=10)
        assert r.status_code in (200, 201, 202), f"webhook got {r.status_code} {r.text[:200]}"
        # Verify assignment via tinker (robust)
        out = _tinker(
            f"$p='{phone}';$c=\\App\\Models\\WhatsappConversation::whereHas('lead',function($ql)use($p){{$ql->where('phone','like','%'.$p.'%');}})->latest('id')->first();"
            f"if($c){{$u=\\App\\Models\\User::find($c->assigned_to);echo 'CID='.$c->id.'|ASSIGNED='.($c->assigned_to??'null').'|ROLE='.($u?$u->role:'none');}}else{{echo 'NOCONV';}}"
        )
        assert "CID=" in out, f"conv not found for phone {phone}: {out}"
        assert "ASSIGNED=null" not in out, f"expected assigned agent, got: {out}"
        assert "sales_exec" in out or "sales_manager" in out, f"expected sales role, got: {out}"

    def test_auto_assign_off_leaves_null(self, priya_tok):
        requests.put(f"{API}/whatsapp/settings", headers=H(priya_tok), json={"auto_assign": False}, timeout=10)
        phone = f"9198{int(time.time()) % 1000000:06d}"
        wamid = f"wamid.TEST_{int(time.time()*1000)}"
        payload = {
            "entry": [{
                "changes": [{
                    "value": {
                        "messages": [{
                            "from": phone, "id": wamid, "type": "text",
                            "text": {"body": "hi auto-assign off"},
                            "timestamp": str(int(time.time()))
                        }]
                    }, "field": "messages"
                }]
            }]
        }
        r = requests.post(f"{API}/webhooks/whatsapp", json=payload, timeout=10)
        assert r.status_code in (200, 201, 202)
        out = _tinker(
            f"$p='{phone}';$c=\\App\\Models\\WhatsappConversation::whereHas('lead',function($ql)use($p){{$ql->where('phone','like','%'.$p.'%');}})->latest('id')->first();"
            f"if($c){{echo 'CID='.$c->id.'|ASSIGNED='.($c->assigned_to??'null');}}else{{echo 'NOCONV';}}"
        )
        # RESET auto_assign back to true regardless of outcome
        requests.put(f"{API}/whatsapp/settings", headers=H(priya_tok), json={"auto_assign": True}, timeout=10)
        assert "ASSIGNED=null" in out, f"expected null, got: {out}"

    def test_balancing_across_agents(self, priya_tok):
        requests.put(f"{API}/whatsapp/settings", headers=H(priya_tok), json={"auto_assign": True}, timeout=10)
        assigned = []
        base = int(time.time())
        for i in range(4):
            phone = f"9197{(base + i) % 1000000:06d}"
            wamid = f"wamid.TESTB_{base}_{i}"
            payload = {"entry": [{"changes": [{"value": {"messages": [{
                "from": phone, "id": wamid, "type": "text",
                "text": {"body": f"balance {i}"}, "timestamp": str(base + i)
            }]}, "field": "messages"}]}]}
            r = requests.post(f"{API}/webhooks/whatsapp", json=payload, timeout=10)
            assert r.status_code in (200, 201, 202)
            out = _tinker(
                f"$p='{phone}';$c=\\App\\Models\\WhatsappConversation::whereHas('lead',function($ql)use($p){{$ql->where('phone','like','%'.$p.'%');}})->latest('id')->first();"
                f"if($c){{echo 'A='.($c->assigned_to??'null');}}else{{echo 'A=NC';}}"
            )
            for line in out.splitlines():
                if "A=" in line:
                    val = line.split("A=", 1)[1].strip()
                    assigned.append(val)
                    break
        distinct = set(a for a in assigned if a not in ("null", "NC"))
        assert len(distinct) >= 2, f"expected balancing across >=2 agents got assignments={assigned}"


# ---------- Final reset ----------
def test_zzz_reset_auto_assign_true():
    tok = _login("priya@crm.local", "Demo@12345")
    r = requests.put(f"{API}/whatsapp/settings", headers=H(tok), json={"auto_assign": True}, timeout=10)
    assert r.status_code == 200
