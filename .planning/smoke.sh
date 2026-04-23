#!/usr/bin/env bash
# Womanie smoke-test script.
#
# Fast sanity check against the deployed site. Hits every auth-gated
# API route without a session cookie and asserts the expected status
# code; hits the public routes and asserts 200 or redirect; compares
# the live JS bundle hash against the local dist/ so we can tell
# whether a deploy has propagated.
#
# Usage: bash .planning/smoke.sh [base-url]
# Default base-url: https://womanie.info
#
# Intended to run at the start of each autonomous session to catch
# regressions from the previous session's changes before more code
# lands on top of them.

set -u

BASE="${1:-https://womanie.info}"
PASS=0
FAIL=0

check() {
  local name="$1"
  local method="$2"
  local path="$3"
  local expect="$4"
  local body="${5:-}"

  local args=(-sS -o /dev/null -w "%{http_code}")
  args+=(-X "$method")
  if [[ -n "$body" ]]; then
    args+=(-H "Content-Type: application/json" -d "$body")
  fi
  local got
  got=$(curl "${args[@]}" "$BASE$path" 2>/dev/null)

  if [[ "$got" == "$expect" ]]; then
    printf "  %-36s %s  ok (%s)\n" "$path" "$method" "$got"
    PASS=$((PASS + 1))
  else
    printf "  %-36s %s  FAIL (got %s, want %s)\n" "$path" "$method" "$got" "$expect" >&2
    FAIL=$((FAIL + 1))
  fi
}

echo "Smoke test against $BASE"
echo
echo "== Liveness =="
check "root"                       GET  "/"                              200
check "health-records route"       GET  "/dashboard/medical-history"     200
check "login page"                 GET  "/auth/login"                    200

echo
echo "== Auth gates — unauth should 401 =="
check "db router (unauth)"         POST "/api/db"                        401 '{"table":"health_documents","operation":"select"}'
check "upload (unauth)"            POST "/api/upload"                    401 '{}'
check "analyze-document (unauth)"  POST "/api/analyze-document"          401 '{}'
check "ai-doctor-chat (unauth)"    POST "/api/ai-doctor-chat"            401 '{"messages":[{"role":"user","content":"hi"}]}'
check "summary/generate (unauth)"  POST "/api/summary/generate"          401 '{}'
check "predict-ovulation (unauth)" POST "/api/predict-ovulation"         401 '{}'
check "me/export (unauth)"         GET  "/api/me/export"                 401
check "me/delete-account (unauth)" POST "/api/me/delete-account"         401 '{}'
check "docs/delete (unauth)"       POST "/api/docs/delete"               401 '{"documentId":"x"}'
check "connections/pending (unauth)"      GET  "/api/connections/pending"        401
check "connections/approved (unauth)"     GET  "/api/connections/approved"       401
check "connections/redeem-code (unauth)"  POST "/api/connections/redeem-code"    401 '{"code":"X"}'
check "connections/respond (unauth)"      POST "/api/connections/respond"        401 '{"connectionId":"x","action":"approve"}'
check "doctors/list (unauth)"             GET  "/api/doctors/list"               401
check "doctors/patient (unauth)"          GET  "/api/doctors/patient?id=x"       401
check "admin/doctors GET (unauth)"        GET  "/api/admin/doctors"              403
check "admin/doctors POST (unauth)"       POST "/api/admin/doctors"              403 '{"userId":"x","action":"approve"}'

echo
echo "== Public auth endpoints =="
check "auth/login (empty body)"    POST "/api/auth/login"                400 '{}'
check "auth/signup (short pw)"     POST "/api/auth/signup"               400 '{"email":"a@b.c","password":"x"}'
check "auth/doctor-signup (missing fields)" POST "/api/auth/doctor-signup" 400 '{"email":"a@b.c"}'
check "auth/me (no cookie)"        GET  "/api/auth/me"                   200
check "auth/google"                GET  "/api/auth/google"               302

echo
echo "== Bundle freshness =="
if [[ -f dist/index.html ]]; then
  LOCAL=$(grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' dist/index.html | head -1)
  LIVE=$(curl -sS "$BASE/" | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' | head -1)
  if [[ "$LOCAL" == "$LIVE" ]]; then
    echo "  deployed bundle matches local build: $LIVE"
    PASS=$((PASS + 1))
  else
    echo "  bundle mismatch: local=$LOCAL, live=$LIVE  (deploy may not have propagated)" >&2
    FAIL=$((FAIL + 1))
  fi
else
  echo "  skipped — no local dist/ yet (run vite build)"
fi

echo
echo "== Result =="
echo "  $PASS passed, $FAIL failed"
[[ $FAIL -eq 0 ]] || exit 1
