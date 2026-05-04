#!/usr/bin/env bash
# Register a Hermes built-in cron job that runs trigger-node-daily-report.sh via the agent terminal.
# Requires: hermes on PATH, Gateway for execution, mcp-doctor-agent-bridge/.env with webhook vars.
#
# Optional env:
#   BRIDGE_ROOT          default: parent of scripts/ (this repo)
#   HERMES_CRON_SCHEDULE default: 0 7 * * *
#   HERMES_CRON_DELIVER  default: telegram  (e.g. telegram:1162529718)
set -euo pipefail

ROOT="${BRIDGE_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
SCHEDULE="${HERMES_CRON_SCHEDULE:-0 7 * * *}"
DELIVER="${HERMES_CRON_DELIVER:-telegram}"

if ! command -v hermes >/dev/null 2>&1; then
  echo "error: 'hermes' not on PATH" >&2
  exit 1
fi

if [[ ! -d "$ROOT" ]]; then
  echo "error: BRIDGE_ROOT is not a directory: $ROOT" >&2
  exit 1
fi

PROMPT='You are a scheduled job. Use the terminal tool exactly once.
Command: bash ./scripts/trigger-node-daily-report.sh
Rules: do not cd; cwd is already the project root. Do not ask the user questions.
Final reply: summarize success or paste truncated stdout/stderr (max 2000 chars).'

exec hermes cron create "$SCHEDULE" "$PROMPT" \
  --name "Doctor daily report (Node webhook)" \
  --deliver "$DELIVER" \
  --workdir "$ROOT"
