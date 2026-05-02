#!/usr/bin/env bash
# Example: Hermes Cron or system crontab calls this to wake doctor-agent daily job.
# Usage:
#   export DOCTOR_AGENT_DAILY_WEBHOOK_URL="https://doctor-agent.internal/internal/cron/daily-report"
#   export DOCTOR_AGENT_DAILY_WEBHOOK_TOKEN="change-me"
#   ./trigger-node-daily-report.sh
set -euo pipefail

if [[ -z "${DOCTOR_AGENT_DAILY_WEBHOOK_URL:-}" ]]; then
  echo "error: set DOCTOR_AGENT_DAILY_WEBHOOK_URL" >&2
  exit 1
fi

if [[ -z "${DOCTOR_AGENT_DAILY_WEBHOOK_TOKEN:-}" ]]; then
  echo "error: set DOCTOR_AGENT_DAILY_WEBHOOK_TOKEN" >&2
  exit 1
fi

payload=${DOCTOR_AGENT_DAILY_PAYLOAD:-'{"action":"daily-report","source":"hermes-cron"}'}

curl -sS -X POST "${DOCTOR_AGENT_DAILY_WEBHOOK_URL}" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${DOCTOR_AGENT_DAILY_WEBHOOK_TOKEN}" \
  -d "${payload}"

echo ""
