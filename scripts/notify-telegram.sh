#!/usr/bin/env bash
# Send a progress update to Alena's Telegram.
#
# Womanie work lands as git commits; there was no feed surfacing it. This
# posts a short plain-text message to the existing bot (@alenajobsearchbot)
# so autonomous-session progress actually reaches her.
#
# Usage:
#   scripts/notify-telegram.sh "your message"
#   echo "your message" | scripts/notify-telegram.sh
#
# Credentials (never committed): read from the environment first, falling
# back to the existing job-monitor-agent .env so this works out of the box.
#   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID

set -euo pipefail

FALLBACK_ENV="${HOME}/job-monitor-agent/.env"

read_from_env_file() {
  local key="$1"
  [[ -f "$FALLBACK_ENV" ]] || return 0
  grep "^${key}=" "$FALLBACK_ENV" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'"
}

TOKEN="${TELEGRAM_BOT_TOKEN:-$(read_from_env_file TELEGRAM_BOT_TOKEN)}"
CHAT="${TELEGRAM_CHAT_ID:-$(read_from_env_file TELEGRAM_CHAT_ID)}"

if [[ -z "${TOKEN:-}" || -z "${CHAT:-}" ]]; then
  echo "notify-telegram: TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set (env or $FALLBACK_ENV)" >&2
  exit 1
fi

MSG="${*:-$(cat)}"
if [[ -z "${MSG// }" ]]; then
  echo "notify-telegram: empty message" >&2
  exit 1
fi

HTTP_OK=$(curl -sS -o /dev/null -w "%{http_code}" \
  "https://api.telegram.org/bot${TOKEN}/sendMessage" \
  --data-urlencode "chat_id=${CHAT}" \
  --data-urlencode "text=${MSG}" \
  --data-urlencode "disable_web_page_preview=true")

if [[ "$HTTP_OK" == "200" ]]; then
  echo "notify-telegram: sent"
else
  echo "notify-telegram: failed (HTTP $HTTP_OK)" >&2
  exit 1
fi
