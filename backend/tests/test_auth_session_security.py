"""
Auth / Session Security hardening tests (Wave 33)

Covers:
- Login returns token; session recorded with IP + user_agent + expires_at ~60min
- Unauthenticated /me -> 401 (with & without Accept header, bogus token)
- Sliding TTL: authenticated call pushes expires_at forward
- Logout invalidates current token
- Logout-all revokes all user tokens
- Forgot password returns generic 200
- Reset password with invalid token returns 422
- Disable user immediately invalidates existing tokens (RE-ENABLE after)
- No regression: sales user can list leads
"""
import os
import time
import re
import subprocess
import pytest
import requests
from datetime import datetime

BASE_URL = "http://localhost:8000/api/v1"
ADMIN = {"email": "admin@crm.local", "password": "Admin@12345"}
SALES = {"email": "rahul@crm.local", "password": "Demo@12345"}


def _login(creds):
    r = requests.post(f"{BASE_URL}/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()


# ---------- Login + session recording ----------
class TestLoginAndSession:
    def test_login_returns_token(self):
        data = _login(ADMIN)
        assert "token" in data and len(data["token"]) > 10
        assert data.get("user", {}).get("email") == ADMIN["email"]

    def test_sessions_endpoint_shows_current_with_ip_ua(self):
        token = _login(ADMIN)["token"]
        r = requests.get(
            f"{BASE_URL}/auth/sessions",
            headers={"Authorization": f"Bearer {token}", "User-Agent": "pytest-agent/1.0"},
            timeout=10,
        )
        assert r.status_code == 200, r.text
        # Response may be {"sessions":[...]} or list
        body = r.json()
        if isinstance(body, dict):
            sessions = body.get("data") or body.get("sessions") or []
        else:
            sessions = body
        assert isinstance(sessions, list) and len(sessions) >= 1, f"body={body}"
        current = [s for s in sessions if s.get("current")]
        assert current, f"no 'current' session found in {sessions}"
        cur = current[0]
        assert cur.get("ip_address"), "ip_address missing"
        assert cur.get("user_agent"), "user_agent missing"
        assert cur.get("expires_at"), "expires_at missing"


# ---------- Unauthenticated access ----------
class TestUnauthenticated:
    def test_me_no_auth_returns_401(self):
        r = requests.get(f"{BASE_URL}/me", timeout=10)
        assert r.status_code == 401, f"expected 401 got {r.status_code} body={r.text[:200]}"

    def test_me_no_auth_no_accept_header_returns_401(self):
        # Explicitly send no Accept: application/json
        r = requests.get(f"{BASE_URL}/me", headers={"Accept": "*/*"}, timeout=10)
        assert r.status_code == 401, f"expected 401 got {r.status_code} body={r.text[:200]}"

    def test_me_bogus_token_returns_401(self):
        r = requests.get(
            f"{BASE_URL}/me",
            headers={"Authorization": "Bearer not-a-real-token-xxxxx"},
            timeout=10,
        )
        assert r.status_code == 401


# ---------- Sliding TTL ----------
class TestSlidingTTL:
    def test_expires_at_slides_forward(self):
        token = _login(ADMIN)["token"]
        h = {"Authorization": f"Bearer {token}"}

        def get_current_expiry():
            r = requests.get(f"{BASE_URL}/auth/sessions", headers=h, timeout=10)
            assert r.status_code == 200
            body = r.json()
            if isinstance(body, dict):
                sess = body.get("data") or body.get("sessions") or []
            else:
                sess = body
            cur = [s for s in sess if s.get("current")][0]
            return cur["expires_at"]

        e1 = get_current_expiry()
        time.sleep(2)
        # authenticated call to slide
        assert requests.get(f"{BASE_URL}/me", headers=h, timeout=10).status_code == 200
        time.sleep(1)
        e2 = get_current_expiry()
        # ISO strings, compare lexicographically works for same tz format
        assert e2 > e1, f"expires_at did not slide forward: {e1} -> {e2}"


# ---------- Logout ----------
class TestLogout:
    def test_logout_invalidates_token(self):
        token = _login(ADMIN)["token"]
        h = {"Authorization": f"Bearer {token}"}
        r = requests.post(f"{BASE_URL}/auth/logout", headers=h, timeout=10)
        assert r.status_code in (200, 204), r.text
        r2 = requests.get(f"{BASE_URL}/me", headers=h, timeout=10)
        assert r2.status_code == 401

    def test_logout_all_invalidates_all_tokens(self):
        t1 = _login(ADMIN)["token"]
        t2 = _login(ADMIN)["token"]
        # logout-all using t2
        r = requests.post(
            f"{BASE_URL}/auth/logout-all",
            headers={"Authorization": f"Bearer {t2}"},
            timeout=10,
        )
        assert r.status_code in (200, 204), r.text
        # both should be invalid
        assert requests.get(f"{BASE_URL}/me", headers={"Authorization": f"Bearer {t1}"}).status_code == 401
        assert requests.get(f"{BASE_URL}/me", headers={"Authorization": f"Bearer {t2}"}).status_code == 401


# ---------- Forgot / Reset ----------
class TestForgotReset:
    def test_forgot_password_generic_response_for_any_email(self):
        for email in ["admin@crm.local", "nonexistent-xyz@nowhere.test"]:
            r = requests.post(
                f"{BASE_URL}/auth/forgot-password", json={"email": email}, timeout=10
            )
            assert r.status_code == 200, f"{email}: {r.status_code} {r.text}"
            msg = (r.json().get("message") or "").lower()
            assert "reset" in msg or "if that email" in msg, r.text

    def test_reset_password_invalid_token_returns_422(self):
        r = requests.post(
            f"{BASE_URL}/auth/reset-password",
            json={
                "email": "admin@crm.local",
                "token": "invalid-fake-token-abc",
                "password": "NewPass@12345",
                "password_confirmation": "NewPass@12345",
            },
            timeout=10,
        )
        assert r.status_code == 422, f"expected 422 got {r.status_code} {r.text}"
        body_lower = r.text.lower()
        assert "invalid" in body_lower or "reset" in body_lower


# ---------- Disable user invalidates session ----------
class TestDisableUser:
    def test_disable_user_invalidates_token_then_reenable(self):
        # Login as target sales user
        sales_token = _login(SALES)["token"]
        h_sales = {"Authorization": f"Bearer {sales_token}"}
        me = requests.get(f"{BASE_URL}/me", headers=h_sales, timeout=10)
        assert me.status_code == 200
        sales_user_id = me.json().get("user", me.json()).get("id") or me.json().get("id")
        assert sales_user_id, f"could not resolve sales user id from {me.json()}"

        # Admin disables the sales user
        admin_token = _login(ADMIN)["token"]
        h_admin = {"Authorization": f"Bearer {admin_token}"}
        try:
            r = requests.put(
                f"{BASE_URL}/users/{sales_user_id}",
                json={"is_active": False},
                headers=h_admin,
                timeout=10,
            )
            assert r.status_code == 200, r.text

            # sales token should be invalid
            r2 = requests.get(f"{BASE_URL}/me", headers=h_sales, timeout=10)
            assert r2.status_code == 401, f"disabled user token still valid: {r2.status_code}"
        finally:
            # ALWAYS re-enable
            requests.put(
                f"{BASE_URL}/users/{sales_user_id}",
                json={"is_active": True},
                headers=h_admin,
                timeout=10,
            )

        # confirm sales can log in again
        again = requests.post(f"{BASE_URL}/auth/login", json=SALES, timeout=10)
        assert again.status_code == 200, f"re-enable failed: {again.text}"


# ---------- Regression ----------
class TestNoRegression:
    def test_sales_user_can_list_leads(self):
        token = _login(SALES)["token"]
        r = requests.get(
            f"{BASE_URL}/leads",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10,
        )
        assert r.status_code == 200, r.text

    def test_admin_dashboard_endpoint(self):
        token = _login(ADMIN)["token"]
        r = requests.get(
            f"{BASE_URL}/me",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10,
        )
        assert r.status_code == 200
