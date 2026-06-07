# M5 — Hermes Cron + Node webhook (daily report → **Telegram**)

**Operational runbook (env vars, dry run, launchd / crontab):** see **`DAILY_REPORT_RUNBOOK.md`** in this directory.

**Design goal:** scheduled triggers run **inside Node (doctor-agent)**: fetch data → generate → persist → **push summary/link to Telegram**. Hermes Cron only provides **reliable wake-up** and optional natural-language reminders.

> To switch to WeChat template messages later, replace Node’s send implementation from **Telegram Bot API** to **WeChat Official Account APIs**; webhook and Cron trigger stay the same.

## Architecture A (recommended): Hermes Cron → shell → Node

1. doctor-agent implements **`POST /internal/cron/daily-report`** (Bearer; see `hermes_implementation_guide.md` §14). Use **mTLS / private network** in production.
2. This repo’s script: `mcp-doctor-agent-bridge/scripts/trigger-node-daily-report.sh`  
   Configure `DOCTOR_AGENT_DAILY_WEBHOOK_URL` and `DOCTOR_AGENT_DAILY_WEBHOOK_TOKEN`.
3. In Hermes, create a scheduled job per [Cron docs](https://hermes-agent.nousresearch.com/docs/user-guide/features/cron) to run that script (or an equivalent one-line `curl`).

**Cron expression example (daily 07:00, server local timezone):** `0 7 * * *`

**Natural-language task example (illustrative; UI varies by Hermes version):**

> Every day at 07:00, run `/path/to/mcp-doctor-agent-bridge/scripts/trigger-node-daily-report.sh` and log success or HTTP status.

## Architecture B: Node cron only

Use `node-cron` / cloud Scheduler to call the same webhook **without** Hermes; Hermes handles chat and MCP only. Good when daily reports and **Telegram (or your own push)** are tightly coupled and you do not want Hermes running 24/7.

## Request body convention (example)

Node accepts minimal JSON (you can extend to a batch userId list):

```json
{
  "action": "daily-report",
  "source": "hermes-cron",
  "runId": "optional-uuid"
}
```

## Telegram delivery (current default)

Pick one approach for the team:

1. **Node sends Telegram (common)**  
   - After `reportRepo`, use **BotFather bot token** with [Telegram Bot API](https://core.telegram.org/bots/api) (`sendMessage`) to send the daily summary to the user’s bound `chat_id`.  
   - User binding: `chat_id` stored in doctor-agent user settings or a mapping table.

2. **Hermes gateway sends Telegram**  
   - If Hermes generates the report body and you want less Node send code, Hermes Cron can deliver via **Messaging Gateway**; **persistence should still be in Node** (avoid “only a copy in chat”).

## WeChat (optional)

- Template/subscription messages remain in **Node** (`access_token`, etc.); can run in parallel with Telegram or replace it.

## Security

- Webhook URL **private network only**; rotate tokens; do not log full PHI in logs.
- Optional: override default JSON via `DOCTOR_AGENT_DAILY_PAYLOAD` (supported by the script).
