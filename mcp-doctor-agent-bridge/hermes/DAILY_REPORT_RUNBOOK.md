# Daily health report → Telegram (operational runbook)

**Goal:** each day automatically call **`POST /internal/cron/daily-report`** so **doctor-agent (Node)** loads the personal profile, generates a daily summary, and sends it via **Telegram Bot API** to the bound user’s **`chat_id`**.

## Prerequisites

| Item | Notes |
|------|-------|
| Telegram binding | Firestore `userSettings` (document id = `userId`, usually email) has **`integrations.telegramChatId`** (or compatible `telegramChatId` / `messaging.telegramChatId`). Written via app short code + **`POST /internal/telegram/webhook`**. |
| Node can reach Firebase | `buildAIContext` must read the user’s base profile; otherwise job skips with **`no_basic_profile`**. |
| `TELEGRAM_BOT_TOKEN` | Backend env var for **`sendMessage`**. Must match the bot that holds the user’s `chat_id` (often **binding/report bot**, separate from Hermes chat bot). |
| Bearer | Caller token matches backend **`INTERNAL_CRON_BEARER_TOKEN`** (or **`DOCTOR_AGENT_DAILY_WEBHOOK_TOKEN`**). |

## 1. Configure doctor-agent (backend: Railway or local)

These three variables apply on the **Node process side** (Railway service / local `node src/index.js`), not inside Hermes.

### 1A. Railway

1. Open [Railway Dashboard](https://railway.app/) → select the **doctor-agent** service (deploying `ai-doctor-agent/backend`).
2. Go to **Variables** (or **Settings → Variables**).
3. Add each variable (names must match exactly):

| Variable name | Value |
|---------------|-------|
| `INTERNAL_CRON_BEARER_TOKEN` | Long random secret (e.g. `openssl rand -hex 32`). Do not reuse DB password or bot token. |
| `CRON_DAILY_REPORT_USER_EMAILS` | Comma-separated emails, no spaces, e.g. `jianfengren.sd@gmail.com`. Must match Firestore `userSettings` doc id / `userId`. |
| `TELEGRAM_BOT_TOKEN` | Bot for **`sendMessage`** (@BotFather token). User must have started the bot; `chat_id` from **`integrations.telegramChatId`**. May differ from Hermes chat bot token. |

4. **Save** → Railway redeploys. Wait until healthy.
5. Note public HTTPS base URL, e.g. `https://doctor-agent-production-xxxx.up.railway.app`. Daily report URL:

   `https://<your-host>/internal/cron/daily-report`

   Browser GET may **404** (POST only); test with script or `curl` below.

### 1B. Local doctor-agent

1. Copy **`hermes/doctor-agent-backend.env.example`** → **`../ai-doctor-agent/backend/.env`** (merge if file exists).
2. Set **`INTERNAL_CRON_BEARER_TOKEN`**, **`CRON_DAILY_REPORT_USER_EMAILS`**, **`TELEGRAM_BOT_TOKEN`**, plus existing Firebase vars.
3. Start backend (e.g. `npm run dev`), confirm port e.g. `http://127.0.0.1:8000`.
4. For local tests, **`DOCTOR_AGENT_DAILY_WEBHOOK_URL`** =

   `http://127.0.0.1:8000/internal/cron/daily-report`

   If using **ngrok / Cloudflare Tunnel**, put the public HTTPS URL in the trigger side (§2).

---

## 2. Configure the trigger side (machine that runs the script)

The trigger runs **`scripts/trigger-node-daily-report.sh`** (Mac, Pi, GitHub Actions, etc.). **`DOCTOR_AGENT_DAILY_WEBHOOK_TOKEN`** must **exactly match** backend **`INTERNAL_CRON_BEARER_TOKEN`**.

### Option A: `mcp-doctor-agent-bridge/.env` (recommended)

1. Add to **`mcp-doctor-agent-bridge/.env`** (align with **`.env.example`**):

```bash
DOCTOR_AGENT_DAILY_WEBHOOK_URL=https://<your-railway-host>/internal/cron/daily-report
DOCTOR_AGENT_DAILY_WEBHOOK_TOKEN=<same-as-INTERNAL_CRON_BEARER_TOKEN>
# Optional: explicit userEmails in request (else backend CRON_DAILY_REPORT_USER_EMAILS)
DOCTOR_AGENT_DAILY_USER_EMAILS=jianfengren.sd@gmail.com
```

2. Do **not** commit token `.env` to git.
3. Script auto-**`source`s** **`mcp-doctor-agent-bridge/.env`** unless **`DOCTOR_AGENT_SKIP_BRIDGE_ENV=1`**.

### Option B: export in current shell

```bash
export DOCTOR_AGENT_DAILY_WEBHOOK_URL="https://<your-host>/internal/cron/daily-report"
export DOCTOR_AGENT_DAILY_WEBHOOK_TOKEN="<same-as-INTERNAL_CRON_BEARER_TOKEN>"
export DOCTOR_AGENT_DAILY_USER_EMAILS="jianfengren.sd@gmail.com"   # optional
```

### Option C: launchd / crontab

Put variables in **plist `EnvironmentVariables`** or **crontab line prefix** (§5). Use absolute script path.

## 3. Dry run

No LLM / DB writes / Telegram send (per server `dryRun` branch):

```bash
export DOCTOR_AGENT_DAILY_DRY_RUN=1
bash /Users/jeffren/Documents/hermes/mcp-doctor-agent-bridge/scripts/trigger-node-daily-report.sh
```

(Use your machine’s **absolute path**. If vars are in **`.env`**, only export `DOCTOR_AGENT_DAILY_DRY_RUN=1`.)

Expect HTTP **200** and JSON **`"dryRun": true`**. **Could not resolve host** → check URL; **401** → token mismatch.

## 4. Live run once

```bash
unset DOCTOR_AGENT_DAILY_DRY_RUN
bash /Users/jeffren/Documents/hermes/mcp-doctor-agent-bridge/scripts/trigger-node-daily-report.sh
```

Check Telegram for summary; backend logs for **`telegramError`** (token, chat_id, network).

## 5. Schedule (daily 07:00 example)

Use **absolute script path**; env vars in **plist/crontab** OR rely on script **`source`** of **`.env`** (pick one to avoid drift).

### A. macOS launchd

1. Copy **`scripts/launchd/io.hermes.doctor-daily-report.plist.example`** → **`~/Library/LaunchAgents/io.hermes.doctor-daily-report.plist`**.
2. Edit:
   - **`ProgramArguments`**: script absolute path  
   - **`StandardOutPath` / `StandardErrorPath`**: replace `CHANGE_ME` with your username  
   - **`EnvironmentVariables`**: URL, TOKEN, optional emails — or omit if already in **`.env`**
3. Load:

```bash
launchctl load ~/Library/LaunchAgents/io.hermes.doctor-daily-report.plist
```

4. Test immediately:

```bash
launchctl start io.hermes.doctor-daily-report
tail -20 ~/.hermes/logs/daily-report-launchd.err.log
```

### B. Linux crontab

```bash
crontab -e
```

One line (replace URL, TOKEN, path):

```cron
0 7 * * * DOCTOR_AGENT_DAILY_WEBHOOK_URL='https://YOUR-HOST/internal/cron/daily-report' DOCTOR_AGENT_DAILY_WEBHOOK_TOKEN='YOUR_TOKEN' /home/you/hermes/mcp-doctor-agent-bridge/scripts/trigger-node-daily-report.sh >>/home/you/.hermes/logs/daily-report-cron.log 2>&1
```

If `PATH` lacks `curl`/`python3`: prefix `PATH=/usr/bin:/bin`

### C. Hermes built-in Cron

**Gateway** runs an Agent with **terminal** to execute **`./scripts/trigger-node-daily-report.sh`**. See **`HERMES_CRON_DAILY_REPORT.md`** or **`scripts/register-hermes-cron-daily-report.sh`**.

For reliability without LLM, prefer **A/B** (launchd / system crontab).

## 6. One-shot curl (same as script)

Dry run:

```bash
curl -sS -X POST 'https://<host>/internal/cron/daily-report?dryRun=true' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <INTERNAL_CRON_BEARER_TOKEN>' \
  -d '{"userEmails":["jianfengren.sd@gmail.com"]}'
```

## Troubleshooting

| Symptom | Action |
|---------|--------|
| 401 | Bearer mismatch |
| 503 Cron bearer not configured | Backend missing `INTERNAL_CRON_BEARER_TOKEN` / `DOCTOR_AGENT_DAILY_WEBHOOK_TOKEN` |
| JSON: `No users to process` | No `userEmails` in body and empty **`CRON_DAILY_REPORT_USER_EMAILS`** |
| `no_telegram_chat_id_in_userSettings` | Not bound; set **`integrations.telegramChatId`** |
| `no_basic_profile` | Incomplete profile in app |
| Telegram API error | Check **`TELEGRAM_BOT_TOKEN`**; user started bot / not blocked |

More: `hermes/M5_cron_and_node_webhook.md`, `Telegram_only_personal_chat_and_daily_report.md`.
