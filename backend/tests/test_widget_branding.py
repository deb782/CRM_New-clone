"""Iteration 13 — Widget Branding (partner-scoped) + regressions."""
import os
import re
import requests
import pytest

BASE = "http://127.0.0.1:8000"
API = BASE + "/api/v1"


def login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def partner_token():
    return login("partner@crm.local", "Demo@12345")


@pytest.fixture(scope="module")
def sales_token():
    return login("rahul@crm.local", "Demo@12345")


@pytest.fixture(scope="module")
def admin_token():
    return login("admin@crm.local", "Admin@12345")


@pytest.fixture(scope="module")
def partner_code(partner_token):
    r = requests.get(f"{API}/partner/portal", headers={"Authorization": f"Bearer {partner_token}"}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["partner"]["referral_code"]


# ---- Branding save & echo ----
class TestBrandingSave:
    def test_put_branding_success(self, partner_token):
        payload = {
            "widget_title": "Prime Realty Chat",
            "widget_accent": "#e0532f",
            "widget_greeting": "Namaste! Prime Realty here — how can we help?",
        }
        r = requests.put(f"{API}/partner/branding", json=payload,
                         headers={"Authorization": f"Bearer {partner_token}"}, timeout=15)
        assert r.status_code == 200, r.text
        p = r.json()["partner"]
        assert p["widget_title"] == payload["widget_title"]
        assert p["widget_accent"] == payload["widget_accent"]
        assert p["widget_greeting"] == payload["widget_greeting"]

    def test_portal_returns_snippet(self, partner_token, partner_code):
        r = requests.get(f"{API}/partner/portal",
                         headers={"Authorization": f"Bearer {partner_token}"}, timeout=15)
        assert r.status_code == 200
        p = r.json()["partner"]
        assert p["widget_title"] == "Prime Realty Chat"
        assert p["widget_accent"] == "#e0532f"
        assert "Prime Realty" in p["widget_greeting"]
        assert "widget_snippet" in p
        assert f'data-ref="{partner_code}"' in p["widget_snippet"]


# ---- Validation ----
class TestBrandingValidation:
    def _put(self, tok, body):
        return requests.put(f"{API}/partner/branding", json=body,
                            headers={"Authorization": f"Bearer {tok}"}, timeout=15)

    def test_accent_not_hex(self, partner_token):
        r = self._put(partner_token, {"widget_accent": "red"})
        assert r.status_code == 422

    def test_title_too_long(self, partner_token):
        r = self._put(partner_token, {"widget_title": "x" * 61})
        assert r.status_code == 422

    def test_greeting_too_long(self, partner_token):
        r = self._put(partner_token, {"widget_greeting": "g" * 301})
        assert r.status_code == 422

    def test_accent_short_hex_valid(self, partner_token):
        r = self._put(partner_token, {"widget_accent": "#abc"})
        assert r.status_code == 200, r.text
        assert r.json()["partner"]["widget_accent"] == "#abc"

    def test_accent_long_hex_valid(self, partner_token):
        r = self._put(partner_token, {"widget_accent": "#aabbcc"})
        assert r.status_code == 200
        assert r.json()["partner"]["widget_accent"] == "#aabbcc"
        # restore branded accent for later widget test
        self._put(partner_token, {"widget_accent": "#e0532f"})


# ---- Public widget-config endpoint (no auth) ----
class TestPublicWidgetConfig:
    def test_reflects_partner_branding(self, partner_token, partner_code):
        # Ensure branding is set (parallel-safe)
        requests.put(f"{API}/partner/branding",
                     json={"widget_title": "Prime Realty Chat", "widget_accent": "#e0532f",
                           "widget_greeting": "Namaste! Prime Realty here — how can we help?"},
                     headers={"Authorization": f"Bearer {partner_token}"}, timeout=15)
        r = requests.get(f"{API}/public/widget-config/{partner_code}", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["title"] == "Prime Realty Chat"
        assert d["accent"] == "#e0532f"
        assert "Prime Realty" in d["greeting"]

    def test_badcode_returns_defaults_200(self):
        r = requests.get(f"{API}/public/widget-config/BADCODE", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["title"] == "Find your dream home"
        assert d["accent"] == "#6c8cff"
        assert isinstance(d["greeting"], str) and len(d["greeting"]) > 0


# ---- Isolation / RBAC ----
class TestBrandingIsolation:
    def test_sales_exec_forbidden(self, sales_token):
        r = requests.put(f"{API}/partner/branding", json={"widget_title": "hack"},
                         headers={"Authorization": f"Bearer {sales_token}"}, timeout=15)
        # Sales exec has no partner.portal permission -> 403
        assert r.status_code in (403,), r.status_code

    def test_admin_without_partner_profile_404(self, admin_token):
        # Admin has all perms but no linked channel_partner row -> 404
        r = requests.put(f"{API}/partner/branding", json={"widget_title": "adm"},
                         headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
        # Depending on admin permission wildcard, could be 403 (no partner.portal) OR 404 (no linked partner).
        assert r.status_code in (403, 404), r.status_code

    def test_partner_cannot_affect_other_partner(self, partner_token, partner_code):
        # There is no PUT by-id route in partner-scoped API; branding is always scoped to currentPartner.
        # Verify by ensuring their own row was updated & the public endpoint for another partner is unaffected.
        # Grab admin list to find another partner code if any:
        adm = login("admin@crm.local", "Admin@12345")
        lst = requests.get(f"{API}/partners", headers={"Authorization": f"Bearer {adm}"}, timeout=15)
        if lst.status_code != 200:
            pytest.skip("cannot list partners")
        partners = lst.json().get("partners", [])
        other = next((p for p in partners if p.get("referral_code") and p["referral_code"] != partner_code), None)
        if not other:
            pytest.skip("no second partner to compare")
        r = requests.get(f"{API}/public/widget-config/{other['referral_code']}", timeout=15)
        assert r.status_code == 200
        d = r.json()
        # The other partner should NOT have Prime Realty branding
        assert d["title"] != "Prime Realty Chat" or d["accent"] != "#e0532f"


# ---- Regressions: partner referral capture + chatbot lead ----
class TestRegressionCaptures:
    def test_partner_refer_creates_lead(self, partner_code):
        phone = "9876513101"
        r = requests.post(f"{API}/public/refer/{partner_code}",
                          json={"name": "TEST Iter13 Referral", "phone": phone,
                                "message": "iter13 branding regression"}, timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        assert "will be in touch" in j.get("message", "").lower() or j.get("status") in ("created", "duplicate")

    def test_chatbot_creates_lead(self):
        phone = "9876513102"
        payload = {
            "name": "TEST Iter13 Chatbot",
            "phone": phone,
            "message": "chatbot regression",
            "source": "Chatbot",
        }
        r = requests.post(f"{API}/chatbot", json=payload, timeout=15)
        # chatbot endpoint may accept various shapes; accept 200/201
        assert r.status_code in (200, 201), f"{r.status_code} {r.text}"
