"""Backend integration tests for WhatsApp Media/Buttons, Template Sync, and Inbox Analytics."""
import base64
import io
import subprocess
import time
import pytest
import requests

BASE = "http://127.0.0.1:8000"
API = f"{BASE}/api/v1"

# 1x1 transparent PNG
PNG_BYTES = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)
# Minimal PDF
PDF_BYTES = (
    b"%PDF-1.1\n%\xe2\xe3\xcf\xd3\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
    b"2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n"
    b"3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 100 100]>>endobj\n"
    b"xref\n0 4\n0000000000 65535 f\n0000000015 00000 n\n0000000061 00000 n\n0000000108 00000 n\n"
    b"trailer<</Size 4/Root 1 0 R>>\nstartxref\n162\n%%EOF"
)


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=10)
    assert r.status_code == 200, f"login {email}: {r.status_code} {r.text[:200]}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def priya_tok():
    return _login("priya@crm.local", "Demo@12345")


@pytest.fixture(scope="session")
def rahul_tok():
    return _login("rahul@crm.local", "Demo@12345")


def H(tok):
    return {"Authorization": f"Bearer {tok}", "Accept": "application/json"}


def _tinker(stmt):
    proc = subprocess.run(
        ["php", "artisan", "tinker", "--execute", stmt],
        cwd="/app/laravel-crm", capture_output=True, text=True, timeout=30,
    )
    assert proc.returncode == 0, f"tinker failed: {proc.stderr}\n{proc.stdout}"
    return proc.stdout


@pytest.fixture(scope="session")
def lead_id(priya_tok):
    r = requests.get(f"{API}/leads?per_page=50", headers=H(priya_tok), timeout=10)
    assert r.status_code == 200
    data = r.json()
    items = data.get("data") or data.get("leads") or data
    if isinstance(items, dict):
        items = items.get("data", [])
    for it in items:
        if not it.get("whatsapp_opt_out") and not it.get("do_not_contact"):
            return it["id"]
    return items[0]["id"]


@pytest.fixture
def conv_id(priya_tok, lead_id):
    """Fresh in-window conversation."""
    r = requests.post(f"{API}/whatsapp/simulate-inbound",
                      headers=H(priya_tok), json={"lead_id": lead_id, "body": "media test"}, timeout=10)
    assert r.status_code == 201, r.text
    cid = (r.json().get("conversation") or {}).get("id")
    if not cid:
        cid = requests.get(f"{API}/whatsapp/conversations", headers=H(priya_tok)).json()["conversations"][0]["id"]
    # Ensure within window
    _tinker(f"\\App\\Models\\WhatsappConversation::find({cid})->update(['last_inbound_at'=>now()]);")
    return cid


# ---------- Media upload ----------
class TestMediaUpload:
    def test_upload_image_returns_public_url(self, priya_tok):
        files = {"file": ("test.png", io.BytesIO(PNG_BYTES), "image/png")}
        r = requests.post(f"{API}/whatsapp/media/upload",
                          headers={"Authorization": f"Bearer {priya_tok}", "Accept": "application/json"},
                          files=files, timeout=15)
        assert r.status_code == 201, f"{r.status_code} {r.text[:300]}"
        j = r.json()
        for k in ("url", "type", "name"):
            assert k in j, f"missing {k}: {j}"
        assert j["type"] == "image"
        # public GET
        url = j["url"] if j["url"].startswith("http") else f"{BASE}{j['url']}"
        rg = requests.get(url, timeout=10)
        assert rg.status_code == 200, f"public GET {url} -> {rg.status_code}"

    def test_upload_pdf_returns_document(self, priya_tok):
        files = {"file": ("doc.pdf", io.BytesIO(PDF_BYTES), "application/pdf")}
        r = requests.post(f"{API}/whatsapp/media/upload",
                          headers={"Authorization": f"Bearer {priya_tok}", "Accept": "application/json"},
                          files=files, timeout=15)
        assert r.status_code == 201, r.text[:300]
        j = r.json()
        assert j["type"] == "document"
        url = j["url"] if j["url"].startswith("http") else f"{BASE}{j['url']}"
        assert requests.get(url, timeout=10).status_code == 200

    def test_upload_invalid_type_422(self, priya_tok):
        files = {"file": ("bad.txt", io.BytesIO(b"hello"), "text/plain")}
        r = requests.post(f"{API}/whatsapp/media/upload",
                          headers={"Authorization": f"Bearer {priya_tok}", "Accept": "application/json"},
                          files=files, timeout=10)
        assert r.status_code == 422, f"expected 422 got {r.status_code} {r.text[:200]}"


# ---------- Send media/interactive in conversation ----------
class TestSendMediaInteractive:
    def _upload_png(self, tok):
        files = {"file": ("t.png", io.BytesIO(PNG_BYTES), "image/png")}
        r = requests.post(f"{API}/whatsapp/media/upload",
                          headers={"Authorization": f"Bearer {tok}", "Accept": "application/json"},
                          files=files, timeout=15)
        assert r.status_code == 201
        return r.json()["url"]

    def _upload_pdf(self, tok):
        files = {"file": ("t.pdf", io.BytesIO(PDF_BYTES), "application/pdf")}
        r = requests.post(f"{API}/whatsapp/media/upload",
                          headers={"Authorization": f"Bearer {tok}", "Accept": "application/json"},
                          files=files, timeout=15)
        assert r.status_code == 201
        return r.json()["url"]

    def test_send_image(self, priya_tok, conv_id):
        url = self._upload_png(priya_tok)
        r = requests.post(f"{API}/whatsapp/conversations/{conv_id}/reply", headers=H(priya_tok),
                          json={"type": "image", "media_url": url, "body": "caption"}, timeout=10)
        assert r.status_code == 200, r.text[:300]
        m = r.json().get("message") or r.json()
        assert m.get("message_type") == "image"
        assert m.get("media_url")

    def test_send_document(self, priya_tok, conv_id):
        url = self._upload_pdf(priya_tok)
        r = requests.post(f"{API}/whatsapp/conversations/{conv_id}/reply", headers=H(priya_tok),
                          json={"type": "document", "media_url": url, "body": "brochure"}, timeout=10)
        assert r.status_code == 200, r.text[:300]
        m = r.json().get("message") or r.json()
        assert m.get("message_type") == "document"
        assert m.get("media_url")

    def test_send_image_empty_media_url_422(self, priya_tok, conv_id):
        r = requests.post(f"{API}/whatsapp/conversations/{conv_id}/reply", headers=H(priya_tok),
                          json={"type": "image", "media_url": "", "body": "no url"}, timeout=10)
        assert r.status_code == 422, f"expected 422 got {r.status_code} {r.text[:200]}"

    def test_send_interactive_buttons(self, priya_tok, conv_id):
        r = requests.post(f"{API}/whatsapp/conversations/{conv_id}/reply", headers=H(priya_tok),
                          json={"type": "interactive", "body": "Pick a slot",
                                "buttons": [{"title": "Sat 11am"}, {"title": "Sun 4pm"}]}, timeout=10)
        assert r.status_code == 200, r.text[:300]
        m = r.json().get("message") or r.json()
        assert m.get("message_type") == "interactive"
        meta = m.get("meta") or {}
        if isinstance(meta, str):
            import json as _j
            meta = _j.loads(meta)
        assert meta.get("buttons"), f"buttons missing in meta: {meta}"
        assert len(meta["buttons"]) == 2

    def test_interactive_empty_body_422(self, priya_tok, conv_id):
        r = requests.post(f"{API}/whatsapp/conversations/{conv_id}/reply", headers=H(priya_tok),
                          json={"type": "interactive", "body": "",
                                "buttons": [{"title": "A"}]}, timeout=10)
        assert r.status_code == 422

    def test_interactive_empty_buttons_422(self, priya_tok, conv_id):
        r = requests.post(f"{API}/whatsapp/conversations/{conv_id}/reply", headers=H(priya_tok),
                          json={"type": "interactive", "body": "Pick", "buttons": []}, timeout=10)
        assert r.status_code == 422

    def test_interactive_max_3_buttons(self, priya_tok, conv_id):
        r = requests.post(f"{API}/whatsapp/conversations/{conv_id}/reply", headers=H(priya_tok),
                          json={"type": "interactive", "body": "pick",
                                "buttons": [{"title": "A"}, {"title": "B"}, {"title": "C"}, {"title": "D"}]},
                          timeout=10)
        assert r.status_code == 422, f"expected 422 for 4 buttons got {r.status_code}"


class TestWindowEnforcement:
    def test_media_and_interactive_blocked_outside_window(self, priya_tok, lead_id):
        # Create a conv, set 30h ago
        rs = requests.post(f"{API}/whatsapp/simulate-inbound",
                           headers=H(priya_tok), json={"lead_id": lead_id, "body": "window"}, timeout=10)
        cid = (rs.json().get("conversation") or {}).get("id")
        assert cid
        _tinker(f"\\App\\Models\\WhatsappConversation::find({cid})->update(['last_inbound_at'=>now()->subHours(30)]);")
        # upload
        files = {"file": ("t.png", io.BytesIO(PNG_BYTES), "image/png")}
        up = requests.post(f"{API}/whatsapp/media/upload",
                           headers={"Authorization": f"Bearer {priya_tok}", "Accept": "application/json"},
                           files=files, timeout=15)
        url = up.json()["url"]

        ri = requests.post(f"{API}/whatsapp/conversations/{cid}/reply", headers=H(priya_tok),
                           json={"type": "image", "media_url": url, "body": "x"}, timeout=10)
        assert ri.status_code == 422, f"image outside window expected 422 got {ri.status_code} {ri.text[:200]}"

        rb = requests.post(f"{API}/whatsapp/conversations/{cid}/reply", headers=H(priya_tok),
                           json={"type": "interactive", "body": "pick",
                                 "buttons": [{"title": "A"}]}, timeout=10)
        assert rb.status_code == 422, f"interactive outside window expected 422 got {rb.status_code}"

        # template still works
        rt = requests.post(f"{API}/whatsapp/conversations/{cid}/reply", headers=H(priya_tok),
                           json={"type": "template", "template": "followup", "body": "hey"}, timeout=10)
        assert rt.status_code == 200, rt.text[:200]


# ---------- Template Sync ----------
class TestTemplateSync:
    def test_sync_returns_five(self, priya_tok):
        r = requests.post(f"{API}/whatsapp/templates/sync", headers=H(priya_tok), timeout=15)
        assert r.status_code == 200, r.text[:300]
        j = r.json()
        assert j.get("synced") == 5, f"expected synced=5 got {j.get('synced')}"
        assert isinstance(j.get("templates"), list)
        names = [t.get("name") for t in j["templates"]]
        for expected in ("welcome_message", "site_visit_reminder", "price_list", "payment_due", "followup"):
            assert expected in names, f"missing template {expected} in {names}"

    def test_sync_idempotent(self, priya_tok):
        requests.post(f"{API}/whatsapp/templates/sync", headers=H(priya_tok), timeout=15)
        r = requests.post(f"{API}/whatsapp/templates/sync", headers=H(priya_tok), timeout=15)
        assert r.status_code == 200
        assert r.json().get("synced") == 5
        # GET list count is still 5
        gl = requests.get(f"{API}/whatsapp/templates", headers=H(priya_tok), timeout=10)
        assert gl.status_code == 200
        items = gl.json().get("templates") or gl.json().get("data") or gl.json()
        if isinstance(items, dict):
            items = items.get("data", [])
        assert len(items) == 5, f"expected 5 templates got {len(items)}"

    def test_rbac_sync_gated(self, rahul_tok, priya_tok):
        r = requests.post(f"{API}/whatsapp/templates/sync", headers=H(rahul_tok), timeout=10)
        assert r.status_code == 403, f"rahul sync expected 403 got {r.status_code}"
        # GET allowed for rahul
        g = requests.get(f"{API}/whatsapp/templates", headers=H(rahul_tok), timeout=10)
        assert g.status_code == 200, f"rahul GET templates got {g.status_code}"


# ---------- Send template outside window ----------
class TestSendTemplate:
    def test_template_send_outside_window(self, priya_tok, lead_id):
        # ensure synced
        requests.post(f"{API}/whatsapp/templates/sync", headers=H(priya_tok), timeout=15)
        rs = requests.post(f"{API}/whatsapp/simulate-inbound",
                           headers=H(priya_tok), json={"lead_id": lead_id, "body": "tpl"}, timeout=10)
        cid = (rs.json().get("conversation") or {}).get("id")
        _tinker(f"\\App\\Models\\WhatsappConversation::find({cid})->update(['last_inbound_at'=>now()->subHours(30)]);")
        r = requests.post(f"{API}/whatsapp/conversations/{cid}/reply", headers=H(priya_tok),
                          json={"type": "template", "template": "followup", "body": "hi"}, timeout=10)
        assert r.status_code == 200, r.text[:300]


# ---------- Analytics ----------
class TestAnalytics:
    def test_analytics_shape(self, priya_tok):
        r = requests.get(f"{API}/whatsapp/analytics", headers=H(priya_tok), timeout=15)
        assert r.status_code == 200, r.text[:300]
        j = r.json()
        for k in ("open_conversations", "unread_backlog", "unread_total",
                  "unassigned", "avg_response_minutes", "per_agent", "trend"):
            assert k in j, f"missing key '{k}' in analytics response: {list(j.keys())}"
        assert isinstance(j["per_agent"], list)
        assert isinstance(j["trend"], list)
        # avg_response_minutes is number or None
        assert j["avg_response_minutes"] is None or isinstance(j["avg_response_minutes"], (int, float))

    def test_analytics_rbac_rahul_allowed(self, rahul_tok):
        # analytics is gated leads.view -> rahul allowed
        r = requests.get(f"{API}/whatsapp/analytics", headers=H(rahul_tok), timeout=10)
        assert r.status_code == 200, f"rahul analytics expected 200 got {r.status_code}"
