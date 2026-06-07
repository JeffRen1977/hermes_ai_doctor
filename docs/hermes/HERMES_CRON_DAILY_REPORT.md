# Wake doctor-agent daily report with Hermes built-in Cron

Hermes Cron **does not run shell directly**; **Gateway** starts a **tool-enabled Agent** that follows your **prompt**. Here we use **terminal** to run **`trigger-node-daily-report.sh`** (auto-**`source`s** **`mcp-doctor-agent-bridge/.env`**).

Official docs: [Scheduled Tasks (Cron)](https://hermes-agent.nousresearch.com/docs/user-guide/features/cron)

## Prerequisites

1. **Gateway always on:** `hermes gateway install` + `hermes gateway start`, or foreground `hermes gateway`. Cron ticks every **60 seconds**; without Gateway, jobs do not run. Check with `hermes cron status`.
2. **`mcp-doctor-agent-bridge/.env`** has **`DOCTOR_AGENT_DAILY_WEBHOOK_URL`**, **`DOCTOR_AGENT_DAILY_WEBHOOK_TOKEN`** (production: do not set **`DOCTOR_AGENT_DAILY_DRY_RUN`**, or set `0`).
3. **Local machine** can `curl` your Railway (or tunnel) HTTPS URL.
4. **Telegram delivery:** **`TELEGRAM_HOME_CHANNEL`** in `~/.hermes/.env` (see [Cron docs](https://hermes-agent.nousresearch.com/docs/user-guide/features/cron) for `deliver: telegram`); or use **`telegram:<numeric_chat_id>`** in commands below.

## Option A: one-command registration (recommended)

On a machine with **Hermes CLI** (use **absolute paths**; wrap prompt in single quotes):

```bash
hermes cron create "0 7 * * *" \
'You are a scheduled job. Use the terminal tool exactly once.
Command: bash ./scripts/trigger-node-daily-report.sh
Rules: do not cd; cwd is already the project root. Do not ask the user questions.
Final reply: summarize success or paste truncated stdout/stderr (max 2000 chars).' \
  --name "Doctor daily report (Node webhook)" \
  --deliver telegram \
  --workdir "/Users/jeffren/Documents/hermes/mcp-doctor-agent-bridge"
```

- **`0 7 * * *`**: daily **07:00** (**Gateway machine local timezone**). Change to `0 9 * * *` etc.
- **`--workdir`**: must exist; terminal cwd is set there so **`./scripts/...`** works.
- **`--deliver telegram`**: sends this Agent turn’s **final reply** to Telegram home; report body still from **Node** Bot API when webhook succeeds.

## Option B: repo registration script

```bash
bash /Users/jeffren/Documents/hermes/mcp-doctor-agent-bridge/scripts/register-hermes-cron-daily-report.sh
```

Default schedule `0 7 * * *`. Override:

```bash
HERMES_CRON_SCHEDULE="0 9 * * *" \
BRIDGE_ROOT="/Users/jeffren/Documents/hermes/mcp-doctor-agent-bridge" \
bash .../register-hermes-cron-daily-report.sh
```

## After creation

```bash
hermes cron list
hermes cron run <job_id>    # set next_run to now; Gateway usually ticks within 60s
```

Immediate local tick: **`hermes cron tick`** in another terminal. Output: **`~/.hermes/cron/output/<job_id>/`**.

## vs launchd / crontab

| Method | Notes |
|--------|-------|
| **Hermes Cron** | Needs Gateway + one LLM turn; extra failure point; good if you want cron summary in Telegram chat |
| **launchd / system crontab** | No model; more reliable; see `DAILY_REPORT_RUNBOOK.md` §5 |

## `/cron` in Telegram (optional)

In a Gateway-connected Telegram chat (with home/deliver configured), e.g.:

```text
/cron add 0 7 * * * Use terminal once: bash ./scripts/trigger-node-daily-report.sh from project /Users/.../mcp-doctor-agent-bridge --deliver telegram
```

Subcommands vary by Hermes version — use **`/cron help`**.
