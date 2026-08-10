"""Backend tests for Website Form Builder & Chatbot (webcapture) feature."""
import os
import time
import requests
import pytest

BASE = "http://localhost:8000/api/v1"


def _login(email, password):
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json().get("token") or r.json().get("data", {}).get("token")


@pytest.fixture(scope="module")
def admin_token():
    return _login("admin@crm.local", "Admin@12345")


@pytest.fixture(scope="module")
def bde_token():
    return _login("rahul@crm.local", "Demo@12345")


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Accept": "application/json"}


# ---- Forms admin CRUD ----
class TestForms:
    def test_list_forms_admin(self, admin_token):
        r = requests.get(f"{BASE}/forms", headers=_h(admin_token))
        assert r.status_code == 200, r.text

    def test_forms_rbac_forbidden_bde(self, bde_token):
        r = requests.get(f"{BASE}/forms", headers=_h(bde_token))
        assert r.status_code == 403, r.text

    def test_create_and_public_submit_form(self, admin_token):
        payload = {
            "name": "TEST_WebForm_UI",
            "description": "Auto test",
            "source": "Website",
            "sub_source": "Landing",
            "fields": [
                {"slug": "name", "label": "Name", "type": "text", "required": True, "maps_to_field": "name"},
                {"slug": "email", "label": "Email", "type": "email", "required": True, "maps_to_field": "email"},
                {"slug": "phone", "label": "Phone", "type": "text", "required": True, "maps_to_field": "phone"},
            ],
            "styling": {"primary_color": "#111827"},
            "submit_button": {"label": "Submit"},
        }
        r = requests.post(f"{BASE}/forms", headers=_h(admin_token), json=payload)
        assert r.status_code in (200, 201), r.text
        data = r.json()
        form = data.get("data", data)
        fid = form.get("id")
        slug = form.get("slug") or form.get("public_slug")
        assert fid, f"no id in {data}"

        # GET back
        g = requests.get(f"{BASE}/forms/{fid}", headers=_h(admin_token))
        assert g.status_code == 200
        assert g.json().get("data", g.json()).get("name") == "TEST_WebForm_UI"

        # Public schema/submit
        if slug:
            s = requests.get(f"{BASE}/public/forms/{slug}/schema")
            assert s.status_code == 200, s.text
            sub = requests.post(f"{BASE}/public/forms/{slug}/submit", json={
                "name": "TEST John", "email": "testjohn@example.com", "phone": "9999999999"
            })
            assert sub.status_code in (200, 201), sub.text

        # Cleanup
        requests.delete(f"{BASE}/forms/{fid}", headers=_h(admin_token))


# ---- Chatbots admin CRUD ----
class TestChatbots:
    def test_list_chatbots_admin(self, admin_token):
        r = requests.get(f"{BASE}/chatbots", headers=_h(admin_token))
        assert r.status_code == 200, r.text

    def test_chatbots_rbac_forbidden_bde(self, bde_token):
        r = requests.get(f"{BASE}/chatbots", headers=_h(bde_token))
        assert r.status_code == 403, r.text

    def test_create_chatbot_and_public_flow(self, admin_token):
        payload = {
            "name": "TEST_Bot_UI",
            "welcome_message": "Hi!",
            "menu_options": [
                {
                    "id": "opt1",
                    "label": "Get in touch",
                    "action": "form",
                    "qualified": True,
                    "form_fields": [
                        {"slug": "name", "label": "Name", "type": "text", "required": True, "maps_to_field": "name"},
                        {"slug": "phone", "label": "Phone", "type": "text", "required": True, "maps_to_field": "phone"},
                        {"slug": "email", "label": "Email", "type": "email", "required": True, "maps_to_field": "email"},
                    ],
                }
            ],
        }
        r = requests.post(f"{BASE}/chatbots", headers=_h(admin_token), json=payload)
        assert r.status_code in (200, 201), r.text
        bot = r.json().get("data", r.json())
        cid = bot.get("id")
        slug = bot.get("slug") or bot.get("public_slug")
        assert cid

        if slug:
            cfg = requests.get(f"{BASE}/public/chatbots/{slug}/config")
            assert cfg.status_code == 200, cfg.text
            sess = requests.post(f"{BASE}/public/chatbots/{slug}/session", json={})
            assert sess.status_code in (200, 201), sess.text
            sid = sess.json().get("data", sess.json()).get("session_id") or sess.json().get("data", sess.json()).get("id")
            if sid:
                act = requests.post(f"{BASE}/public/chatbots/{slug}/action", json={"session_id": sid, "option_id": "opt1"})
                assert act.status_code in (200, 201), act.text
                fm = requests.post(f"{BASE}/public/chatbots/{slug}/form", json={
                    "session_id": sid, "option_id": "opt1",
                    "name": "TEST Bot Lead", "phone": "8888888888", "email": "testbotlead@example.com",
                })
                assert fm.status_code in (200, 201), fm.text

        requests.delete(f"{BASE}/chatbots/{cid}", headers=_h(admin_token))
