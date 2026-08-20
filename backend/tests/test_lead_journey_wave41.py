"""Wave-41: End-to-end Lead Journey demo tests.

Covers:
  1. Public /enquiry form submit -> Lead(name, source='Website Form', BDE, NOT_CONTACTED)
     + 1 email + 1 WhatsApp + 1 Verify task + popup notif to assigned BDE.
  2. FlowEngine journey through all 8 stages fires WA/email/tasks/handover.
  3. Ownership handover pre-sales (BDE) -> sales (BDM) -> post-sales (CRM Head).
"""
import os
import subprocess
import time
import uuid
import requests

LOCAL = "http://127.0.0.1:8000"
API = f"{LOCAL}/api/v1"


def _artisan(php_snippet: str) -> str:
    """Run a PHP snippet inside laravel tinker and return stdout."""
    out = subprocess.run(
        ["php", "artisan", "tinker", "--execute", php_snippet],
        cwd="/app/laravel-crm", capture_output=True, text=True, timeout=90
    )
    return (out.stdout or "") + (out.stderr or "")


# ---------- 1. Public form -> lead capture ----------
class TestPublicEnquiryCapture:
    def test_schema_reachable(self):
        r = requests.get(f"{API}/public/forms/website-lead/schema", timeout=10)
        assert r.status_code == 200
        data = r.json()
        slugs = {f["slug"] for f in data.get("fields", [])}
        assert {"name", "phone", "email"}.issubset(slugs)

    def test_submit_creates_lead_with_full_side_effects(self):
        tag = f"TEST_W41_{uuid.uuid4().hex[:8]}"
        name = f"{tag} Alice"
        phone = "9" + str(int(time.time()))[-9:]  # unique digits
        email = f"{tag.lower()}@example.com"
        r = requests.post(
            f"{API}/public/forms/website-lead/submit",
            json={"name": name, "phone": phone, "email": email, "message": "hi"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True

        # Give any async listeners a moment (there are none, but safe).
        time.sleep(0.5)

        snippet = f"""
$l = \\App\\Models\\Lead::where('email','{email}')->latest()->first();
if(!$l){{ echo 'NO_LEAD'; exit; }}
$owner = $l->owner; $role = optional(optional($owner)->role)->slug;
echo 'ID='.$l->id.'|NAME='.$l->name.'|SOURCE='.$l->source.'|STATUS='.$l->status_code.'|OWNER_ROLE='.$role;
echo '|EMAILS='.\\App\\Models\\Email::where('lead_id',$l->id)->count();
echo '|WA='.\\App\\Models\\WhatsappMessage::where('lead_id',$l->id)->count();
echo '|VERIFY_TASKS='.\\App\\Models\\Task::where('lead_id',$l->id)->where('type','verify')->count();
echo '|POPUPS='.\\App\\Models\\Notification::where('user_id',$l->owner_id)->where('data->lead_id',$l->id)->where('data->popup',true)->count();
"""
        out = _artisan(snippet)
        assert "NO_LEAD" not in out, out
        # parse
        parts = {}
        for chunk in out.strip().split("|"):
            if "=" in chunk:
                k, v = chunk.split("=", 1)
                parts[k.strip()] = v.strip()
        assert parts.get("NAME") == name, f"expected {name}, got {parts}"
        assert parts.get("SOURCE") == "Website Form"
        assert parts.get("STATUS") == "NOT_CONTACTED"
        assert parts.get("OWNER_ROLE") == "sales_bde"
        assert int(parts.get("EMAILS", 0)) == 1
        assert int(parts.get("WA", 0)) == 1
        assert int(parts.get("VERIFY_TASKS", 0)) == 1
        assert int(parts.get("POPUPS", 0)) >= 1


# ---------- 2 & 3. Journey engine + ownership handover ----------
class TestLeadJourneyEngine:
    def test_full_journey_fires_all_touchpoints_and_handoffs(self):
        tag = f"TEST_W41_{uuid.uuid4().hex[:8]}"
        name = f"{tag} JourneyGuy"
        phone = "8" + str(int(time.time() * 10))[-9:]
        email = f"{tag.lower()}_j@example.com"

        r = requests.post(
            f"{API}/public/forms/website-lead/submit",
            json={"name": name, "phone": phone, "email": email},
            timeout=15,
        )
        assert r.status_code == 200

        statuses = [
            "CONTACTED", "FOLLOWUP_1", "CONVERTED_OPPORTUNITY",
            "OPP_NOT_CONTACTED", "OPP_PRICING_SHEET", "OPP_NEGOTIATION",
            "OPP_FINAL_CALL", "OPP_WON",
        ]
        # Apply each status via FlowEngine
        drive = f"""
$l = \\App\\Models\\Lead::where('email','{email}')->latest()->first();
if(!$l){{ echo 'NO_LEAD'; exit; }}
$fe = app(\\App\\Services\\FlowEngine::class);
$owners = [];
foreach ({str(statuses).replace("'", '"')} as $s) {{
    $r = $fe->applyStatus($l->fresh(), $s, false, 1);
    $fresh = $l->fresh();
    $owners[$s] = optional(optional($fresh->owner)->role)->slug;
    if(!$r['ok']){{ echo 'FAIL@'.$s.':'.$r['message']; exit; }}
}}
$fresh = $l->fresh();
echo 'FINAL_ROLE='.optional(optional($fresh->owner)->role)->slug;
echo '|EMAILS='.\\App\\Models\\Email::where('lead_id',$l->id)->count();
echo '|WA='.\\App\\Models\\WhatsappMessage::where('lead_id',$l->id)->count();
echo '|TASKS='.\\App\\Models\\Task::where('lead_id',$l->id)->count();
echo '|OWNER_CONV='.$owners['CONVERTED_OPPORTUNITY'];
echo '|OWNER_WON='.$owners['OPP_WON'];
"""
        # Note: statuses in list uses double quotes in PHP after replace.
        drive = drive.replace(
            str(statuses).replace("'", '"'),
            "[" + ",".join(f'"{s}"' for s in statuses) + "]"
        )
        out = _artisan(drive)
        assert "FAIL@" not in out, out
        assert "NO_LEAD" not in out, out

        parts = {}
        for chunk in out.strip().split("|"):
            if "=" in chunk:
                k, v = chunk.split("=", 1)
                parts[k.strip()] = v.strip()

        # Ownership handover
        assert parts.get("OWNER_CONV") == "sales_bdm", parts
        assert parts.get("OWNER_WON") == "crm_head", parts
        assert parts.get("FINAL_ROLE") == "crm_head"
        # Cumulative touchpoints: 1 (capture NOT_CONTACTED) + 7-8 more stages
        # (some opp stages may not have email/wa configured). Require >=8 each.
        assert int(parts.get("EMAILS", 0)) >= 8, parts
        assert int(parts.get("WA", 0)) >= 8, parts
        # Tasks: Verify + follow-ups at CONTACTED, FOLLOWUP_1, OPP_PRICING_SHEET,
        # OPP_NEGOTIATION, OPP_FINAL_CALL => >= 6
        assert int(parts.get("TASKS", 0)) >= 6, parts


# ---------- 4. Staff login regression ----------
class TestStaffLoginRegression:
    ACCOUNTS = [
        ("admin@crm.local", "Admin@12345"),
        ("rahul@crm.local", "Demo@12345"),
        ("bdm@crm.local", "Demo@12345"),
        ("crmhead@crm.local", "Demo@12345"),
    ]

    def test_all_roles_can_login(self):
        for email, pwd in self.ACCOUNTS:
            r = requests.post(
                f"{API}/auth/login",
                json={"email": email, "password": pwd},
                timeout=10,
            )
            assert r.status_code == 200, f"{email}: {r.status_code} {r.text}"
            data = r.json()
            assert data.get("token") or data.get("access_token") or data.get("user"), \
                f"no token/user in login response for {email}: {data}"
