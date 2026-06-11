#!/usr/bin/env bash
# Womanie AUTHENTICATED smoke test.
#
# Logs in as the dedicated e2e patient account and exercises the big
# CRUD paths under a real session cookie — the class of regression the
# unauthenticated smoke.sh can't see (session 12's auth-stub bugs all
# returned clean 401s while silently discarding user data).
#
# Credentials come from .env.local (E2E_EMAIL / E2E_PASSWORD — never
# committed). First run auto-creates the account via /api/auth/signup.
#
# Usage: bash .planning/smoke-authed.sh [base-url]

set -u

BASE="${1:-https://womanie.info}"
PASS=0
FAIL=0
JAR=$(mktemp)
trap 'rm -f "$JAR"' EXIT

# Load creds without exporting everything in .env.local
E2E_EMAIL=$(grep '^E2E_EMAIL=' .env.local | cut -d= -f2)
E2E_PASSWORD=$(grep '^E2E_PASSWORD=' .env.local | cut -d= -f2)
if [[ -z "$E2E_EMAIL" || -z "$E2E_PASSWORD" ]]; then
  echo "E2E_EMAIL / E2E_PASSWORD missing from .env.local" >&2
  exit 1
fi

req() { # method path expected [json-body] -> body on match
  local method=$1 path=$2 expected=$3 body=${4:-}
  local args=(-sS -o /tmp/smoke_authed_body -w '%{http_code}' -X "$method" -b "$JAR" -c "$JAR" "$BASE$path")
  [[ -n "$body" ]] && args+=(-H 'Content-Type: application/json' -d "$body")
  local code
  code=$(curl "${args[@]}")
  if [[ "$code" == "$expected" ]]; then
    echo "  ok   $method $path -> $code"
    PASS=$((PASS + 1))
    return 0
  else
    echo "  FAIL $method $path -> $code (expected $expected): $(head -c 200 /tmp/smoke_authed_body)" >&2
    FAIL=$((FAIL + 1))
    return 1
  fi
}

db() { # operation helper against /api/db -> prints rows JSON
  curl -sS -X POST -b "$JAR" -H 'Content-Type: application/json' -d "$1" "$BASE/api/db"
}

echo "== Session =="
LOGIN_CODE=$(curl -sS -o /tmp/smoke_authed_body -w '%{http_code}' -X POST -c "$JAR" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$E2E_EMAIL\",\"password\":\"$E2E_PASSWORD\"}" "$BASE/api/auth/login")
if [[ "$LOGIN_CODE" != "200" ]]; then
  echo "  login -> $LOGIN_CODE; creating account"
  req POST /api/auth/signup 200 "{\"email\":\"$E2E_EMAIL\",\"password\":\"$E2E_PASSWORD\",\"name\":\"E2E Smoke\"}" || exit 1
else
  echo "  ok   POST /api/auth/login -> 200"
  PASS=$((PASS + 1))
fi
req GET /api/auth/me 200

echo
echo "== Period tracking round-trip (the session-12 bug class) =="
TODAY=$(date -u +%Y-%m-%d)
INSERT=$(db "{\"table\":\"period_tracking\",\"operation\":\"insert\",\"insertData\":{\"period_start_date\":\"$TODAY\",\"cycle_length\":28},\"filters\":[],\"isSingle\":false,\"isMaybeSingle\":false}")
if echo "$INSERT" | grep -q '"error"\s*:\s*null\|rows'; then echo "  ok   insert period record"; PASS=$((PASS+1)); else echo "  FAIL insert period: $(echo "$INSERT" | head -c 200)" >&2; FAIL=$((FAIL+1)); fi
READBACK=$(db "{\"table\":\"period_tracking\",\"operation\":\"select\",\"selectColumns\":\"*\",\"filters\":[[\"period_start_date\",\"eq\",\"$TODAY\"]],\"isSingle\":false,\"isMaybeSingle\":false}")
if echo "$READBACK" | grep -q "$TODAY"; then echo "  ok   read back period record"; PASS=$((PASS+1)); else echo "  FAIL read-back: $(echo "$READBACK" | head -c 200)" >&2; FAIL=$((FAIL+1)); fi
# Clean up so reruns don't accumulate rows
DEL=$(db "{\"table\":\"period_tracking\",\"operation\":\"delete\",\"filters\":[[\"period_start_date\",\"eq\",\"$TODAY\"]],\"isSingle\":false,\"isMaybeSingle\":false}")
if echo "$DEL" | grep -q '"error"\s*:\s*null\|rows'; then echo "  ok   delete period record"; PASS=$((PASS+1)); else echo "  FAIL delete: $(echo "$DEL" | head -c 200)" >&2; FAIL=$((FAIL+1)); fi

echo
echo "== Ownership enforcement =="
# Reading another user's rows must come back empty, not error/leak —
# /api/db injects user_id = session user regardless of client filters.
FOREIGN=$(db '{"table":"health_documents","operation":"select","selectColumns":"id,user_id","filters":[["user_id","eq","user_0000000000000000dead"]],"isSingle":false,"isMaybeSingle":false}')
if echo "$FOREIGN" | grep -q 'Owner mismatch'; then echo "  ok   foreign user_id filter rejected (Owner mismatch)"; PASS=$((PASS+1)); else echo "  FAIL ownership: $(echo "$FOREIGN" | head -c 200)" >&2; FAIL=$((FAIL+1)); fi

echo
echo "== Authed reads on session-64 endpoints =="
req GET "/api/me/appointments?upcoming=true" 200
req GET /api/me/chart-access 200
req GET /api/doctors/list 200
req POST /api/appointments/reschedule 404 '{"appointment_id":"00000000-0000-0000-0000-000000000000","scheduled_at":"2030-01-01T10:00:00Z"}'

echo
echo "== Logout =="
req POST /api/auth/logout 302
req GET /api/me/chart-access 401

echo
echo "== Result =="
echo "  $PASS passed, $FAIL failed"
[[ $FAIL -eq 0 ]] || exit 1
