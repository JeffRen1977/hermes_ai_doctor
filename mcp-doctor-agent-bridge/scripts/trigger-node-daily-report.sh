#!/usr/bin/env bash
# Wake doctor-agent POST /internal/cron/daily-report (Bearer).
# Typical schedulers: macOS launchd, Linux crontab, cloud Scheduler, or Hermes host cron.
#
# Required:
#   DOCTOR_AGENT_DAILY_WEBHOOK_URL   e.g. https://<railway>/internal/cron/daily-report
#   DOCTOR_AGENT_DAILY_WEBHOOK_TOKEN same secret as backend INTERNAL_CRON_BEARER_TOKEN (or DOCTOR_AGENT_DAILY_WEBHOOK_TOKEN on server)
#
# Optional:
#   DOCTOR_AGENT_DAILY_USER_EMAILS   comma-separated → JSON userEmails (overrides default payload body)
#   DOCTOR_AGENT_DAILY_PAYLOAD       full JSON body when USER_EMAILS unset (default below)
#   DOCTOR_AGENT_DAILY_DRY_RUN       1/true → append ?dryRun=true (no LLM / Telegram / DB writes beyond reads)
#
# If DOCTOR_AGENT_SKIP_BRIDGE_ENV is unset, KEY=value lines from
# mcp-doctor-agent-bridge/.env (next to this repo) are loaded when the file exists.
set -euo pipefail

_script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_bridge_env="${_script_dir}/../.env"
if [[ -z "${DOCTOR_AGENT_SKIP_BRIDGE_ENV:-}" && -f "${_bridge_env}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${_bridge_env}"
  set +a
fi

if [[ -z "${DOCTOR_AGENT_DAILY_WEBHOOK_URL:-}" ]]; then
  echo "error: set DOCTOR_AGENT_DAILY_WEBHOOK_URL" >&2
  exit 1
fi

if [[ -z "${DOCTOR_AGENT_DAILY_WEBHOOK_TOKEN:-}" ]]; then
  echo "error: set DOCTOR_AGENT_DAILY_WEBHOOK_TOKEN" >&2
  exit 1
fi

url="${DOCTOR_AGENT_DAILY_WEBHOOK_URL}"
dry="${DOCTOR_AGENT_DAILY_DRY_RUN:-}"
if [[ "${dry}" =~ ^(1|true|yes)$ ]]; then
  if [[ "${url}" == *\?* ]]; then
    url="${url}&dryRun=true"
  else
    url="${url}?dryRun=true"
  fi
fi

if [[ -n "${DOCTOR_AGENT_DAILY_USER_EMAILS:-}" ]]; then
  payload="$(DOCTOR_AGENT_DAILY_USER_EMAILS="${DOCTOR_AGENT_DAILY_USER_EMAILS}" python3 - <<'PY'
import json, os
raw = os.environ.get("DOCTOR_AGENT_DAILY_USER_EMAILS", "")
emails = sorted({e.strip().lower() for e in raw.split(",") if "@" in e})
print(json.dumps({"action": "daily-report", "source": "hermes-cron", "userEmails": emails}))
PY
)"
else
  if [[ -n "${DOCTOR_AGENT_DAILY_PAYLOAD:-}" ]]; then
    payload="${DOCTOR_AGENT_DAILY_PAYLOAD}"
  else
    payload='{"action":"daily-report","source":"hermes-cron"}'
  fi
fi

curl -sS -X POST "${url}" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${DOCTOR_AGENT_DAILY_WEBHOOK_TOKEN}" \
  -d "${payload}"

echo ""
