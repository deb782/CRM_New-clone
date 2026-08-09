"""WhatsApp Notes + Tags tests (iteration 17)."""
import os
import time
import pytest
import requests

BASE = "http://127.0.0.1:8000/api/v1"


def login(email, password):
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text[:200]}"
    return r.json()["token"]


def H(tok):
    return {"Authorization": f"Bearer {tok}", "Accept": "application/json"}


@pytest.fixture(scope="module")
def tokens():
    return {
        "priya": login("priya@crm.local", "Demo@12345"),
        "rahul": login("rahul@crm.local", "Demo@12345"),
        "partner": login("partner@crm.local", "Demo@12345"),
        "admin": login("admin@crm.local", "Admin@12345"),
    }


@pytest.fixture(scope="module")
def conversation_id(tokens):
    tp = tokens["priya"]
    r = requests.get(f"{BASE}/whatsapp/conversations", headers=H(tp), timeout=15)
    assert r.status_code == 200, r.text
    items = r.json().get("conversations") or r.json().get("data") or []
    if items:
        return items[0]["id"]
    # simulate inbound
    leads = requests.get(f"{BASE}/leads", headers=H(tp), timeout=15).json()
    lead_list = leads.get("leads") or leads.get("data") or []
    assert lead_list, "no leads"
    lead_id = lead_list[0]["id"]
    r = requests.post(f"{BASE}/whatsapp/simulate-inbound", headers=H(tp),
                      json={"lead_id": lead_id, "body": "Hello (TEST_iter17)"}, timeout=15)
    assert r.status_code in (200, 201), r.text
    d = r.json()
    return d.get("conversation", d).get("id")


# ---------- Regression sanity ----------
class TestRegression:
    def test_login_priya_rahul(self, tokens):
        assert tokens["priya"] and tokens["rahul"]

    def test_leads_seeded(self, tokens):
        r = requests.get(f"{BASE}/leads", headers=H(tokens["priya"]), timeout=15)
        assert r.status_code == 200
        data = r.json()
        leads = data.get("leads") or data.get("data") or []
        assert len(leads) >= 1

    def test_list_conversations(self, tokens):
        r = requests.get(f"{BASE}/whatsapp/conversations", headers=H(tokens["priya"]), timeout=15)
        assert r.status_code == 200

    def test_reply_within_window(self, tokens, conversation_id):
        # ensure inbound within window
        r = requests.post(f"{BASE}/whatsapp/conversations/{conversation_id}/reply",
                          headers=H(tokens["priya"]),
                          json={"body": "TEST_iter17 reply"}, timeout=15)
        assert r.status_code in (200, 201), r.text


# ---------- Tags ----------
class TestTags:
    def test_update_tags_dedup_trim(self, tokens, conversation_id):
        r = requests.put(f"{BASE}/whatsapp/conversations/{conversation_id}/tags",
                         headers=H(tokens["priya"]),
                         json={"tags": ["hot", "site-visit", "  hot  "]}, timeout=15)
        assert r.status_code == 200, r.text
        conv = r.json()["conversation"]
        assert set(conv["tags"]) == {"hot", "site-visit"}
        assert len(conv["tags"]) == 2

    def test_tags_present_in_list(self, tokens, conversation_id):
        r = requests.get(f"{BASE}/whatsapp/conversations", headers=H(tokens["priya"]), timeout=15)
        items = r.json().get("conversations") or r.json().get("data") or []
        found = next((c for c in items if c["id"] == conversation_id), None)
        assert found is not None
        assert "tags" in found
        assert set(found["tags"]) >= {"hot", "site-visit"}

    def test_clear_tags(self, tokens, conversation_id):
        r = requests.put(f"{BASE}/whatsapp/conversations/{conversation_id}/tags",
                         headers=H(tokens["priya"]), json={"tags": []}, timeout=15)
        assert r.status_code == 200
        assert r.json()["conversation"]["tags"] == []

    def test_partner_forbidden_tags(self, tokens, conversation_id):
        r = requests.put(f"{BASE}/whatsapp/conversations/{conversation_id}/tags",
                         headers=H(tokens["partner"]), json={"tags": ["x"]}, timeout=15)
        assert r.status_code == 403

    def test_rahul_can_edit_tags(self, tokens, conversation_id):
        r = requests.put(f"{BASE}/whatsapp/conversations/{conversation_id}/tags",
                         headers=H(tokens["rahul"]), json={"tags": ["follow-up"]}, timeout=15)
        assert r.status_code == 200


# ---------- Notes ----------
class TestNotes:
    def test_add_note_priya(self, tokens, conversation_id):
        r = requests.post(f"{BASE}/whatsapp/conversations/{conversation_id}/notes",
                          headers=H(tokens["priya"]),
                          json={"body": "Prefers weekend visits (TEST_iter17)"}, timeout=15)
        assert r.status_code == 201, r.text
        note = r.json()["note"]
        assert note["body"].startswith("Prefers")
        assert note["author"]["name"].lower().startswith("priya")
        pytest.priya_note_id = note["id"]

    def test_add_note_empty_422(self, tokens, conversation_id):
        r = requests.post(f"{BASE}/whatsapp/conversations/{conversation_id}/notes",
                          headers=H(tokens["priya"]), json={"body": ""}, timeout=15)
        assert r.status_code == 422

    def test_list_notes_newest_first(self, tokens, conversation_id):
        # add a second
        requests.post(f"{BASE}/whatsapp/conversations/{conversation_id}/notes",
                      headers=H(tokens["rahul"]), json={"body": "Rahul note TEST_iter17"}, timeout=15)
        r = requests.get(f"{BASE}/whatsapp/conversations/{conversation_id}/notes",
                         headers=H(tokens["priya"]), timeout=15)
        assert r.status_code == 200
        notes = r.json()["notes"]
        assert len(notes) >= 2
        # newest first
        assert notes[0]["created_at"] >= notes[-1]["created_at"]
        assert all("author" in n and "name" in n["author"] for n in notes)

    def test_rahul_cannot_delete_priya_note(self, tokens, conversation_id):
        note_id = pytest.priya_note_id
        r = requests.delete(f"{BASE}/whatsapp/conversations/{conversation_id}/notes/{note_id}",
                            headers=H(tokens["rahul"]), timeout=15)
        assert r.status_code == 403

    def test_priya_can_delete_own_note(self, tokens, conversation_id):
        # create fresh note by priya, then delete
        r = requests.post(f"{BASE}/whatsapp/conversations/{conversation_id}/notes",
                          headers=H(tokens["priya"]), json={"body": "own note TEST"}, timeout=15)
        nid = r.json()["note"]["id"]
        r2 = requests.delete(f"{BASE}/whatsapp/conversations/{conversation_id}/notes/{nid}",
                             headers=H(tokens["priya"]), timeout=15)
        assert r2.status_code == 200

    def test_manager_can_delete_any_note(self, tokens, conversation_id):
        # rahul creates note, priya (config.manage) deletes
        r = requests.post(f"{BASE}/whatsapp/conversations/{conversation_id}/notes",
                          headers=H(tokens["rahul"]), json={"body": "rahul note to be deleted"}, timeout=15)
        nid = r.json()["note"]["id"]
        r2 = requests.delete(f"{BASE}/whatsapp/conversations/{conversation_id}/notes/{nid}",
                             headers=H(tokens["priya"]), timeout=15)
        assert r2.status_code == 200

    def test_admin_can_delete_any_note(self, tokens, conversation_id):
        r = requests.post(f"{BASE}/whatsapp/conversations/{conversation_id}/notes",
                          headers=H(tokens["rahul"]), json={"body": "note for admin del"}, timeout=15)
        nid = r.json()["note"]["id"]
        r2 = requests.delete(f"{BASE}/whatsapp/conversations/{conversation_id}/notes/{nid}",
                             headers=H(tokens["admin"]), timeout=15)
        assert r2.status_code == 200

    def test_delete_note_wrong_conversation_404(self, tokens, conversation_id):
        # create another conversation via simulate-inbound
        tp = tokens["priya"]
        leads = requests.get(f"{BASE}/leads", headers=H(tp)).json()
        lead_list = leads.get("leads") or leads.get("data") or []
        # find a different lead
        other_lead = None
        for l in lead_list:
            other_lead = l["id"]
            break
        r = requests.post(f"{BASE}/whatsapp/simulate-inbound", headers=H(tp),
                          json={"lead_id": other_lead, "body": "second conv TEST_iter17"}, timeout=15)
        other_conv = r.json().get("conversation", r.json()).get("id")
        if other_conv == conversation_id:
            pytest.skip("could not get distinct conversation")
        # add note on original
        r = requests.post(f"{BASE}/whatsapp/conversations/{conversation_id}/notes",
                          headers=H(tp), json={"body": "note in conv A"}, timeout=15)
        nid = r.json()["note"]["id"]
        # delete via other conv path
        r2 = requests.delete(f"{BASE}/whatsapp/conversations/{other_conv}/notes/{nid}",
                             headers=H(tp), timeout=15)
        assert r2.status_code == 404


# ---------- RBAC ----------
class TestRBAC:
    def test_partner_forbidden_get_notes(self, tokens, conversation_id):
        r = requests.get(f"{BASE}/whatsapp/conversations/{conversation_id}/notes",
                         headers=H(tokens["partner"]), timeout=15)
        assert r.status_code == 403

    def test_partner_forbidden_add_note(self, tokens, conversation_id):
        r = requests.post(f"{BASE}/whatsapp/conversations/{conversation_id}/notes",
                          headers=H(tokens["partner"]), json={"body": "x"}, timeout=15)
        assert r.status_code == 403

    def test_rahul_can_read_notes(self, tokens, conversation_id):
        r = requests.get(f"{BASE}/whatsapp/conversations/{conversation_id}/notes",
                         headers=H(tokens["rahul"]), timeout=15)
        assert r.status_code == 200

    def test_rahul_can_add_note(self, tokens, conversation_id):
        r = requests.post(f"{BASE}/whatsapp/conversations/{conversation_id}/notes",
                          headers=H(tokens["rahul"]), json={"body": "rahul rbac note"}, timeout=15)
        assert r.status_code == 201
