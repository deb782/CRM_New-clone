#!/bin/bash
# Email Broadcast module tests
BASE="http://127.0.0.1:8000/api/v1"
PASS=0; FAIL=0
declare -a FAILS
HDR_JSON=(-H "Accept: application/json" -H "Content-Type: application/json")

check() {
  local name="$1"; local expected="$2"; local actual="$3"; local extra="$4"
  if [ "$actual" = "$expected" ]; then
    echo "PASS: $name ($actual)"; PASS=$((PASS+1))
  else
    echo "FAIL: $name expected=$expected actual=$actual $extra"
    FAIL=$((FAIL+1)); FAILS+=("$name: expected=$expected actual=$actual $extra")
  fi
}

login() {
  curl -s -X POST "$BASE/auth/login" "${HDR_JSON[@]}" \
    -d "{\"email\":\"$1\",\"password\":\"$2\"}" | python3 -c "import sys,json;print(json.load(sys.stdin).get('token',''))"
}

PRIYA=$(login priya@crm.local Demo@12345)
RAHUL=$(login rahul@crm.local Demo@12345)
PARTNER=$(login partner@crm.local Demo@12345)
ADMIN=$(login admin@crm.local Admin@12345)
[ -z "$PRIYA" ] && echo "FATAL: no priya token" && exit 1
AUTH_P=(-H "Authorization: Bearer $PRIYA" -H "Accept: application/json" -H "Content-Type: application/json")

# 1. Starters
BODY=$(curl -s "$BASE/email/templates/starters" "${AUTH_P[@]}")
COUNT=$(echo "$BODY" | python3 -c "import sys,json;d=json.load(sys.stdin);print(len(d.get('starters',[])))")
check "starters count=5" 5 "$COUNT"

# 2. Templates CRUD
STAMP=$(date +%s)
BODY=$(curl -s -w "\n%{http_code}" -X POST "$BASE/email/templates" "${AUTH_P[@]}" \
  -d "{\"name\":\"TEST_Tpl_$STAMP\",\"subject\":\"Hi {name}\",\"category\":\"promo\",\"html\":\"<p>Hello {name} from {project}</p>\"}")
CODE=$(echo "$BODY" | tail -1); B=$(echo "$BODY" | head -n -1)
TPL_ID=$(echo "$B" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('template',{}).get('id',''))")
check "template create=201" 201 "$CODE"
echo "TPL_ID=$TPL_ID"

CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/email/templates" "${AUTH_P[@]}" -d '{"subject":"x","html":"<p>x</p>"}')
check "template missing name=422" 422 "$CODE"

CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/email/templates" "${AUTH_P[@]}")
check "template list=200" 200 "$CODE"

CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/email/templates/$TPL_ID" "${AUTH_P[@]}")
check "template show=200" 200 "$CODE"

CODE=$(curl -s -o /dev/null -w "%{http_code}" -X PUT "$BASE/email/templates/$TPL_ID" "${AUTH_P[@]}" \
  -d "{\"name\":\"TEST_Tpl_${STAMP}_upd\",\"subject\":\"Hi {name}\",\"html\":\"<p>Updated {name}</p>\"}")
check "template update=200" 200 "$CODE"

# 3. Campaign create (audience=all)
BODY=$(curl -s -w "\n%{http_code}" -X POST "$BASE/email/campaigns" "${AUTH_P[@]}" \
  -d "{\"name\":\"TEST_Camp_$STAMP\",\"subject\":\"Offer for {name}\",\"template_id\":$TPL_ID,\"html\":\"<p>Hi {name}, project {project}. <a href=\\\"https://acme.com\\\">Click</a></p>\",\"audience_type\":\"all\"}")
CODE=$(echo "$BODY" | tail -1); B=$(echo "$BODY" | head -n -1)
CAMP_ID=$(echo "$B" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('campaign',{}).get('id',''))")
RECIPS=$(echo "$B" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('campaign',{}).get('recipients',''))")
check "campaign create=201" 201 "$CODE" "body=${B:0:200}"
echo "CAMP_ID=$CAMP_ID recipients=$RECIPS"

CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/email/campaigns" "${AUTH_P[@]}" \
  -d "{\"name\":\"X\",\"subject\":\"s\",\"audience_type\":\"all\"}")
check "campaign missing html=422" 422 "$CODE"

CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/email/campaigns" "${AUTH_P[@]}" \
  -d "{\"name\":\"X\",\"html\":\"<p>x</p>\",\"audience_type\":\"all\"}")
check "campaign missing subject=422" 422 "$CODE"

# 4. Send
BODY=$(curl -s -w "\n%{http_code}" -X POST "$BASE/email/campaigns/$CAMP_ID/send" "${AUTH_P[@]}")
CODE=$(echo "$BODY" | tail -1); B=$(echo "$BODY" | head -n -1)
check "campaign send=200" 200 "$CODE" "body=${B:0:200}"
SENT=$(echo "$B" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('sent',0))" 2>/dev/null)
echo "SENT=$SENT B=$B"

CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/email/campaigns/$CAMP_ID/send" "${AUTH_P[@]}")
check "resend sent=422" 422 "$CODE"

CODE=$(curl -s -o /dev/null -w "%{http_code}" -X PUT "$BASE/email/campaigns/$CAMP_ID" "${AUTH_P[@]}" \
  -d "{\"name\":\"Y\",\"subject\":\"s\",\"html\":\"<p>x</p>\",\"audience_type\":\"all\"}")
check "edit sent campaign=422" 422 "$CODE"

# 5. Tracking
TOKEN=$(cd /app/laravel-crm && /usr/bin/php artisan tinker --execute="echo \App\Models\EmailMessage::where('campaign_id',$CAMP_ID)->first()->open_token;" 2>/dev/null | tail -1 | tr -d '[:space:]')
echo "OPEN_TOKEN=[$TOKEN]"

RESP=$(curl -s -o /dev/null -w "%{http_code}|%{content_type}" "$BASE/email/open/$TOKEN")
CODE=$(echo "$RESP" | cut -d'|' -f1)
CT=$(echo "$RESP" | cut -d'|' -f2)
check "open pixel=200" 200 "$CODE"
echo "content-type=$CT"

# Idempotent - hit again
curl -s -o /dev/null "$BASE/email/open/$TOKEN"
OPEN_COUNT=$(cd /app/laravel-crm && /usr/bin/php artisan tinker --execute="echo \App\Models\EmailCampaign::find($CAMP_ID)->open_count;" 2>/dev/null | tail -1 | tr -d '[:space:]')
check "open_count idempotent=1" 1 "$OPEN_COUNT"

# click
CLICK_TOKEN=$(cd /app/laravel-crm && /usr/bin/php artisan tinker --execute="\$m=\App\Models\EmailMessage::where('campaign_id',$CAMP_ID)->first(); echo \$m->click_token ?? \$m->open_token;" 2>/dev/null | tail -1 | tr -d '[:space:]')
echo "CLICK_TOKEN=[$CLICK_TOKEN]"
CLICK=$(curl -s -o /dev/null -w "%{http_code}|%{redirect_url}" "$BASE/email/click/$CLICK_TOKEN?u=https%3A%2F%2Facme.com")
CCODE=$(echo "$CLICK" | cut -d'|' -f1); CREDIR=$(echo "$CLICK" | cut -d'|' -f2)
check "click redirect=302" 302 "$CCODE"
if [ "$CREDIR" = "https://acme.com" ]; then echo "PASS: click target"; PASS=$((PASS+1)); else echo "FAIL: click target=$CREDIR"; FAIL=$((FAIL+1)); FAILS+=("click target=$CREDIR"); fi

CLICK_COUNT=$(cd /app/laravel-crm && /usr/bin/php artisan tinker --execute="echo \App\Models\EmailCampaign::find($CAMP_ID)->click_count;" 2>/dev/null | tail -1 | tr -d '[:space:]')
check "click_count=1" 1 "$CLICK_COUNT"

# bad/missing u -> safe redirect
CCODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/email/click/$CLICK_TOKEN")
if [ "$CCODE" = "302" ] || [ "$CCODE" = "301" ]; then echo "PASS: click missing u redirect ($CCODE)"; PASS=$((PASS+1)); else echo "FAIL: click missing u=$CCODE"; FAIL=$((FAIL+1)); FAILS+=("click missing u=$CCODE"); fi

# Verify injection
INJ=$(cd /app/laravel-crm && /usr/bin/php artisan tinker --execute="\$m=\App\Models\EmailMessage::where('campaign_id',$CAMP_ID)->first(); \$h=\$m->body_html ?? \$m->html ?? ''; echo (strpos(\$h,'email/click/')!==false?'C':'').'|'.(strpos(\$h,'email/open/')!==false?'O':'').'|'.(strpos(\$h,'{name}')===false?'P':'');" 2>/dev/null | tail -1)
echo "injection flags: $INJ"
echo "$INJ" | grep -q "C" && { echo "PASS: click injection"; PASS=$((PASS+1)); } || { echo "FAIL: click injection"; FAIL=$((FAIL+1)); FAILS+=("click injection missing"); }
echo "$INJ" | grep -q "O" && { echo "PASS: open pixel injection"; PASS=$((PASS+1)); } || { echo "FAIL: open pixel injection"; FAIL=$((FAIL+1)); FAILS+=("open pixel injection missing"); }
echo "$INJ" | grep -q "P" && { echo "PASS: personalization"; PASS=$((PASS+1)); } || { echo "FAIL: personalization not applied"; FAIL=$((FAIL+1)); FAILS+=("personalization"); }

# 6. RBAC
AUTH_R=(-H "Authorization: Bearer $RAHUL" -H "Accept: application/json")
AUTH_PT=(-H "Authorization: Bearer $PARTNER" -H "Accept: application/json")
AUTH_A=(-H "Authorization: Bearer $ADMIN" -H "Accept: application/json")
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/email/templates" "${AUTH_R[@]}"); check "rahul templates=403" 403 "$CODE"
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/email/campaigns" "${AUTH_R[@]}"); check "rahul campaigns=403" 403 "$CODE"
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/email/templates" "${AUTH_PT[@]}"); check "partner templates=403" 403 "$CODE"
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/email/templates" "${AUTH_A[@]}"); check "admin templates=200" 200 "$CODE"

# public open no auth
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/email/open/$TOKEN")
check "open no-auth=200" 200 "$CODE"

# 7. audience filter: temperature (needs template_id)
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/email/campaigns" "${AUTH_P[@]}" \
  -d "{\"name\":\"TEST_CampTEMP_$STAMP\",\"subject\":\"Sub {name}\",\"template_id\":$TPL_ID,\"html\":\"<p>Hi {name}</p>\",\"audience_type\":\"temperature\",\"audience_value\":\"hot\"}")
check "campaign audience=temperature=201" 201 "$CODE"

# DELETE template
B=$(curl -s -X POST "$BASE/email/templates" "${AUTH_P[@]}" -d "{\"name\":\"TEST_DelTpl_$STAMP\",\"subject\":\"s\",\"html\":\"<p>x</p>\"}")
DEL_ID=$(echo "$B" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('template',{}).get('id',''))")
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$BASE/email/templates/$DEL_ID" "${AUTH_P[@]}")
check "template delete=200" 200 "$CODE"

echo ""
echo "===== RESULTS: PASS=$PASS FAIL=$FAIL ====="
if [ $FAIL -gt 0 ]; then echo "FAILURES:"; for f in "${FAILS[@]}"; do echo "  - $f"; done; fi
