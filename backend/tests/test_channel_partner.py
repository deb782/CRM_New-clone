"""Channel Partner module: separate portal auth + admin bridge tests."""
import os
import time
import pytest
import requests

_url = os.environ.get('REACT_APP_BACKEND_URL') or 'http://127.0.0.1:8000'
# For local dev the API base is /api/v1; preview rewrites /crm-api/v1 -> /api/v1
BASE = _url.rstrip('/') + ('/crm-api/v1' if 'http' in _url and 'preview' in _url else '/api/v1')


# ---------- Helpers ----------

def _login(email, password):
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"login {email} -> {r.status_code} {r.text}"
    return r.json()['token']


def _cp_login(email, password):
    r = requests.post(f"{BASE}/cp/auth/login", json={"email": email, "password": password})
    return r


@pytest.fixture(scope="session")
def admin_token():
    return _login('admin@crm.local', 'Admin@12345')


@pytest.fixture(scope="session")
def process_token():
    return _login('process@crm.local', 'Demo@12345')


@pytest.fixture(scope="session")
def bde_token():
    return _login('rahul@crm.local', 'Demo@12345')


@pytest.fixture(scope="session")
def cp_token():
    r = _cp_login('cp@partner.local', 'Partner@12345')
    assert r.status_code == 200, f"cp login -> {r.status_code} {r.text}"
    return r.json()['token']


def H(t):
    return {"Authorization": f"Bearer {t}"}


# ---------- CP Auth ----------

class TestCpAuth:
    def test_cp_login_ok(self, cp_token):
        assert isinstance(cp_token, str) and len(cp_token) > 10

    def test_cp_login_wrong_password(self):
        r = _cp_login('cp@partner.local', 'wrong-password')
        assert r.status_code in (401, 422)

    def test_cp_me(self, cp_token):
        r = requests.get(f"{BASE}/cp/auth/me", headers=H(cp_token))
        assert r.status_code == 200
        data = r.json()
        # Should contain partner info
        assert 'partner' in data or 'email' in data or 'code' in str(data).lower()


# ---------- Auth Isolation (CRITICAL) ----------

class TestAuthIsolation:
    def test_partner_token_rejected_on_staff_dashboard(self, cp_token):
        r = requests.get(f"{BASE}/dashboard", headers=H(cp_token))
        assert r.status_code == 401, f"expected 401 got {r.status_code}: {r.text[:200]}"

    def test_staff_token_rejected_on_partner_dashboard(self, admin_token):
        r = requests.get(f"{BASE}/cp/dashboard", headers=H(admin_token))
        assert r.status_code == 401, f"expected 401 got {r.status_code}"

    def test_bogus_token_rejected_partner(self):
        r = requests.get(f"{BASE}/cp/dashboard", headers=H("bogus-token-xxx"))
        assert r.status_code == 401

    def test_bogus_token_rejected_staff(self):
        r = requests.get(f"{BASE}/dashboard", headers=H("bogus-token-xxx"))
        assert r.status_code == 401


# ---------- Portal features ----------

class TestPortalDashboardAndLeads:
    def test_dashboard(self, cp_token):
        r = requests.get(f"{BASE}/cp/dashboard", headers=H(cp_token))
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, dict)

    def test_submit_lead_and_not_in_crm(self, cp_token, admin_token):
        payload = {"customer_name": "TEST_CP_LEAD Alice", "phone": "9990001111", "notes": "portal-submitted"}
        r = requests.post(f"{BASE}/cp/leads", headers=H(cp_token), json=payload)
        assert r.status_code in (200, 201), f"{r.status_code} {r.text}"
        body = r.json()
        lead = body.get('lead') or body.get('data') or body
        lead_id = lead.get('id')
        assert lead_id, f"no id in {body}"
        assert (lead.get('status') or '').lower() == 'new'
        pytest.cp_lead_id = lead_id

        # Appears in partner list
        r2 = requests.get(f"{BASE}/cp/leads", headers=H(cp_token))
        assert r2.status_code == 200
        ids = [x.get('id') for x in (r2.json().get('data') or r2.json().get('leads') or r2.json())]
        assert lead_id in ids

        # Not auto-created in CRM: search staff leads by phone
        r3 = requests.get(f"{BASE}/leads?search=9990001111", headers=H(admin_token))
        if r3.status_code == 200:
            items = r3.json().get('data') or r3.json().get('leads') or []
            for it in items:
                assert it.get('phone') != '9990001111' or (it.get('source_meta') and 'cp' not in str(it).lower()), \
                    "CP lead unexpectedly appears in CRM leads before accept"

    def test_missing_required_fields(self, cp_token):
        r = requests.post(f"{BASE}/cp/leads", headers=H(cp_token), json={})
        assert r.status_code in (400, 422)


class TestRepresentatives:
    def test_add_and_delete_rep(self, cp_token):
        r = requests.post(f"{BASE}/cp/representatives", headers=H(cp_token),
                          json={"name": "TEST_Rep Bob", "phone": "9998887777", "email": "bob@partner.test"})
        assert r.status_code in (200, 201), f"{r.status_code} {r.text}"
        rep = r.json().get('representative') or r.json().get('data') or r.json()
        rid = rep.get('id')
        assert rid
        # List includes
        rl = requests.get(f"{BASE}/cp/representatives", headers=H(cp_token))
        assert rl.status_code == 200
        # Delete
        rd = requests.delete(f"{BASE}/cp/representatives/{rid}", headers=H(cp_token))
        assert rd.status_code in (200, 204)


class TestInventoryDocsProfile:
    def test_inventory(self, cp_token):
        r = requests.get(f"{BASE}/cp/inventory", headers=H(cp_token))
        assert r.status_code == 200
        # optional status filter
        r2 = requests.get(f"{BASE}/cp/inventory?status=available", headers=H(cp_token))
        assert r2.status_code == 200

    def test_documents(self, cp_token):
        r = requests.get(f"{BASE}/cp/documents", headers=H(cp_token))
        assert r.status_code == 200

    def test_profile_get_update_kyc(self, cp_token):
        r = requests.get(f"{BASE}/cp/profile", headers=H(cp_token))
        assert r.status_code == 200
        prof = r.json().get('partner') or r.json().get('data') or r.json()
        # Update
        upd = {"company_name": prof.get('company_name') or "TEST Partner Co", "bank_name": "TEST Bank"}
        r2 = requests.put(f"{BASE}/cp/profile", headers=H(cp_token), json=upd)
        assert r2.status_code in (200, 204), f"{r2.status_code} {r2.text}"
        # Submit KYC
        r3 = requests.post(f"{BASE}/cp/profile/submit-kyc", headers=H(cp_token))
        assert r3.status_code in (200, 204), f"{r3.status_code} {r3.text}"


class TestTickets:
    def test_create_reply_ticket(self, cp_token):
        r = requests.post(f"{BASE}/cp/tickets", headers=H(cp_token),
                          json={"subject": "TEST_Ticket - portal", "body": "Need help with lead X"})
        assert r.status_code in (200, 201), f"{r.status_code} {r.text}"
        t = r.json().get('ticket') or r.json().get('data') or r.json()
        tid = t.get('id')
        assert tid
        # Reply
        rr = requests.post(f"{BASE}/cp/tickets/{tid}/reply", headers=H(cp_token),
                           json={"body": "any updates?"})
        assert rr.status_code in (200, 201)
        # List
        rl = requests.get(f"{BASE}/cp/tickets", headers=H(cp_token))
        assert rl.status_code == 200
        pytest.cp_ticket_id = tid


# ---------- Admin flows ----------

class TestAdminPartners:
    def test_list_partners(self, admin_token):
        r = requests.get(f"{BASE}/admin/partners", headers=H(admin_token))
        assert r.status_code == 200

    def test_invite_partner(self, admin_token):
        r = requests.post(f"{BASE}/admin/partners/invite", headers=H(admin_token),
                          json={"name": "TEST InviteCo", "contact_name": "Invite Contact", "contact_email": f"invitee{int(time.time())}@partner.test", "phone": "8880009999"})
        assert r.status_code in (200, 201), f"{r.status_code} {r.text}"
        body = r.json()
        assert 'temp_password' in str(body).lower() or 'password' in body or 'partner' in body, \
            f"no temp password in {body}"

    def test_approve_kyc(self, admin_token, cp_token):
        # Ensure partner submitted KYC via portal test above
        requests.post(f"{BASE}/cp/profile/submit-kyc", headers=H(cp_token))
        # list partners, find cp@partner.local
        r = requests.get(f"{BASE}/admin/partners", headers=H(admin_token))
        items = r.json().get('data') or r.json().get('partners') or r.json()
        pid = None
        for p in items:
            if (p.get('email') or '') == 'cp@partner.local':
                pid = p.get('id'); break
        if not pid:
            pytest.skip("cp@partner.local partner not found in list")
        r2 = requests.post(f"{BASE}/admin/partners/{pid}/approve-kyc", headers=H(admin_token), json={})
        assert r2.status_code in (200, 204), f"{r2.status_code} {r2.text}"

    def test_set_status(self, admin_token):
        r = requests.get(f"{BASE}/admin/partners", headers=H(admin_token))
        items = r.json().get('data') or r.json().get('partners') or r.json()
        pid = None
        for p in items:
            if (p.get('email') or '') == 'cp@partner.local':
                pid = p.get('id'); break
        if not pid:
            pytest.skip("no partner")
        # approve then suspend then approve back
        for st in ['approved', 'suspended', 'approved']:
            r2 = requests.put(f"{BASE}/admin/partners/{pid}/status", headers=H(admin_token), json={"status": st})
            assert r2.status_code in (200, 204), f"set {st} -> {r2.status_code} {r2.text}"


class TestAdminCpLeadsBridge:
    def test_list_cp_leads(self, admin_token):
        r = requests.get(f"{BASE}/admin/cp-leads", headers=H(admin_token))
        assert r.status_code == 200

    def test_accept_and_double_accept(self, admin_token, cp_token):
        # Create a fresh lead via portal
        r = requests.post(f"{BASE}/cp/leads", headers=H(cp_token),
                          json={"customer_name": "TEST_Bridge Accept", "phone": "9779779770"})
        assert r.status_code in (200, 201), f"create lead {r.status_code} {r.text}"
        lead = r.json().get('lead') or r.json().get('data') or r.json()
        lid = lead['id']
        # Accept
        ra = requests.post(f"{BASE}/admin/cp-leads/{lid}/accept", headers=H(admin_token), json={})
        assert ra.status_code in (200, 201), f"accept -> {ra.status_code} {ra.text}"
        body = ra.json()
        # Response should include converted_lead_id or converted status
        assert 'converted' in str(body).lower() or 'lead' in body, f"no conversion evidence: {body}"
        # Double accept -> 422
        ra2 = requests.post(f"{BASE}/admin/cp-leads/{lid}/accept", headers=H(admin_token), json={})
        assert ra2.status_code == 422, f"double accept expected 422 got {ra2.status_code}: {ra2.text}"

    def test_reject_requires_reason(self, admin_token, cp_token):
        r = requests.post(f"{BASE}/cp/leads", headers=H(cp_token),
                          json={"customer_name": "TEST_Bridge Reject", "phone": "9779779771"})
        assert r.status_code in (200, 201), f"create lead {r.status_code} {r.text}"
        lead = r.json().get('lead') or r.json().get('data') or r.json()
        lid = lead['id']
        # empty reason
        rr = requests.post(f"{BASE}/admin/cp-leads/{lid}/reject", headers=H(admin_token), json={})
        assert rr.status_code == 422, f"expected 422 for empty reason, got {rr.status_code}"
        # with reason
        rr2 = requests.post(f"{BASE}/admin/cp-leads/{lid}/reject", headers=H(admin_token),
                            json={"reason": "duplicate contact"})
        assert rr2.status_code in (200, 204), f"reject -> {rr2.status_code} {rr2.text}"


class TestAdminDocsAndTickets:
    def test_docs_list(self, admin_token):
        r = requests.get(f"{BASE}/admin/cp-documents", headers=H(admin_token))
        assert r.status_code == 200

    def test_upload_and_delete_doc(self, admin_token):
        files = {"file": ("test.txt", b"hello world", "text/plain")}
        data = {"title": "TEST_Doc", "active": "1"}
        r = requests.post(f"{BASE}/admin/cp-documents", headers=H(admin_token), files=files, data=data)
        assert r.status_code in (200, 201), f"{r.status_code} {r.text}"
        body = r.json()
        did = (body.get('document') or body.get('data') or body).get('id') if isinstance(body, dict) else None
        if did:
            rd = requests.delete(f"{BASE}/admin/cp-documents/{did}", headers=H(admin_token))
            assert rd.status_code in (200, 204)

    def test_tickets_admin(self, admin_token):
        r = requests.get(f"{BASE}/admin/cp-tickets", headers=H(admin_token))
        assert r.status_code == 200
        items = r.json().get('data') or r.json().get('tickets') or r.json()
        if isinstance(items, dict):
            items = items.get('data') or list(items.values())
        if not items:
            pytest.skip("no tickets")
        tid = items[0]['id']
        # open
        r2 = requests.get(f"{BASE}/admin/cp-tickets/{tid}", headers=H(admin_token))
        assert r2.status_code == 200
        # reply
        r3 = requests.post(f"{BASE}/admin/cp-tickets/{tid}/reply", headers=H(admin_token),
                           json={"body": "TEST admin reply"})
        assert r3.status_code in (200, 201)
        # status
        r4 = requests.put(f"{BASE}/admin/cp-tickets/{tid}/status", headers=H(admin_token),
                          json={"status": "resolved"})
        assert r4.status_code in (200, 204)


# ---------- RBAC ----------

class TestRBAC:
    def test_process_admin_can_access(self, process_token):
        r = requests.get(f"{BASE}/admin/partners", headers=H(process_token))
        assert r.status_code == 200, f"process_admin expected 200 got {r.status_code}"
        r2 = requests.get(f"{BASE}/admin/cp-leads", headers=H(process_token))
        assert r2.status_code == 200

    def test_bde_gets_403(self, bde_token):
        r = requests.get(f"{BASE}/admin/partners", headers=H(bde_token))
        assert r.status_code == 403, f"bde expected 403 got {r.status_code}"
        r2 = requests.get(f"{BASE}/admin/cp-leads", headers=H(bde_token))
        assert r2.status_code == 403
