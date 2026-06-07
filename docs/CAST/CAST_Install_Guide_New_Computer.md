# Hermes AI Doctor — Install Guide (New Computer)

**For:** Parent or student setting up the project on a **new laptop** (e.g. your daughter’s computer for CAST)  
**Time:** About 45–90 minutes the first time (mostly waiting on downloads and copying secrets)  
**Repos on GitHub:**

| Repo | URL | What it is |
|------|-----|------------|
| **hermes_ai_doctor** | [github.com/JeffRen1977/hermes_ai_doctor](https://github.com/JeffRen1977/hermes_ai_doctor) | MCP bridge + documentation |
| **ai-doctor-agent** | [github.com/JeffRen1977/ai-doctor-agent](https://github.com/JeffRen1977/ai-doctor-agent) | Health backend (Node.js + Firebase) |

**Related reading:** [`CAST_Student_Mentor_Guide.md`](CAST_Student_Mentor_Guide.md) (project concepts + demo day), [`../README.md`](../README.md) (full doc index)

---

## What you are installing

Three pieces work together:

```
Telegram / CLI  →  Hermes Agent  →  MCP bridge  →  ai-doctor-agent backend  →  Firebase
     (chat)         (~/.hermes/)      (hermes repo)      (sibling repo)
```

- **Hermes Agent** — open-source AI assistant with Telegram and tools ([Nous Research](https://github.com/NousResearch/hermes-agent)).
- **MCP bridge** — small program inside `hermes/mcp-doctor-agent-bridge/` that loads your health profile before the AI answers.
- **ai-doctor-agent** — stores profile, medications, vitals; must be cloned as a **second repo** next to `hermes/`.

> **Education project only.** Not a medical device. For emergencies, call local emergency services — do not rely on the bot.

---

## Before you start (checklist)

| Item | Who usually provides it |
|------|-------------------------|
| **macOS or Linux** laptop (Windows works with path changes; see §12) | Student |
| **Internet** | — |
| **Git** | Install from [git-scm.com](https://git-scm.com/) or Xcode Command Line Tools on Mac |
| **Node.js 20+** | [nodejs.org](https://nodejs.org/) — check with `node -v` |
| **LLM API key** (OpenAI recommended) | Parent — goes in `~/.hermes/.env` |
| **Firebase / backend secrets** | Parent — copy from a working machine or Firebase console into `backend/.env` |
| **Telegram bot token** (Hermes chat bot) | Parent — from [@BotFather](https://t.me/BotFather) |
| **Test user email** in Firebase | Parent — e.g. student’s demo account |

**Parent tip:** Do steps that involve **API keys, Firebase, and tokens** yourself. The student can run `git clone`, `npm install`, and `hermes doctor` with supervision.

---

## Step 1 — Create a projects folder

Open **Terminal** and run:

```bash
mkdir -p ~/Documents
cd ~/Documents
```

All paths below assume:

```
~/Documents/hermes/           ← hermes_ai_doctor repo
~/Documents/ai-doctor-agent/  ← backend repo (sibling folder)
```

If you use a different folder, replace paths everywhere (Hermes config requires **absolute paths**).

---

## Step 2 — Clone both GitHub repos

```bash
cd ~/Documents

git clone https://github.com/JeffRen1977/hermes_ai_doctor.git hermes
git clone https://github.com/JeffRen1977/ai-doctor-agent.git
```

Verify:

```bash
ls ~/Documents/hermes/mcp-doctor-agent-bridge/package.json
ls ~/Documents/ai-doctor-agent/backend/package.json
```

Both commands should print a file path with no error.

---

## Step 3 — Install Node dependencies

**Backend:**

```bash
cd ~/Documents/ai-doctor-agent
npm install
```

**MCP bridge:**

```bash
cd ~/Documents/hermes/mcp-doctor-agent-bridge
npm install
cp .env.example .env
```

---

## Step 4 — Backend environment (`backend/.env`)

Copy the template from the hermes repo:

```bash
cp ~/Documents/hermes/docs/hermes/doctor-agent-backend.env.example \
   ~/Documents/ai-doctor-agent/backend/.env
```

Edit `~/Documents/ai-doctor-agent/backend/.env` (use TextEdit, VS Code, or `nano`):

| Variable | Purpose |
|----------|---------|
| `FIREBASE_API_KEY` | Required — plus any other Firebase vars your project uses |
| `PORT` | `8000` for local dev |
| `INTERNAL_CRON_BEARER_TOKEN` | Random secret — run `openssl rand -hex 32` |
| `CRON_DAILY_REPORT_USER_EMAILS` | Demo user email in Firebase |
| `CRON_DAILY_REPORT_LANGUAGE` | `en` for English daily reports |
| `TELEGRAM_BOT_TOKEN` | Bot that sends daily reports (can differ from Hermes chat bot) |

**Easiest path for a student laptop:** copy the entire `backend/.env` from a computer that already works (parent’s machine), then change nothing except maybe `PORT` if needed.

**Alternative — cloud backend only:** If the backend already runs on Railway, you can skip running it locally. Use the Railway URL in Step 5 instead of `http://127.0.0.1:8000`. Production deploys from the **`release`** branch of `ai-doctor-agent`, not `main`.

---

## Step 5 — MCP bridge environment

Edit `~/Documents/hermes/mcp-doctor-agent-bridge/.env`.

Replace `YOU` with the Mac username on **this** computer (run `whoami` in Terminal):

```bash
LEGACY_BACKEND_ROOT=/Users/YOU/Documents/ai-doctor-agent/backend
MCP_ALLOWED_USER_IDS=student-demo@email.com
MCP_MAX_CONTEXT_CHARS=8000
```

For **local** backend + daily report tests, also add:

```bash
DOCTOR_AGENT_DAILY_WEBHOOK_URL=http://127.0.0.1:8000/internal/cron/daily-report
DOCTOR_AGENT_DAILY_WEBHOOK_TOKEN=<same value as INTERNAL_CRON_BEARER_TOKEN in backend/.env>
DOCTOR_AGENT_DAILY_USER_EMAILS=student-demo@email.com
```

For **Railway** backend:

```bash
DOCTOR_AGENT_DAILY_WEBHOOK_URL=https://YOUR-APP.up.railway.app/internal/cron/daily-report
DOCTOR_AGENT_DAILY_WEBHOOK_TOKEN=<same Bearer token as on Railway>
```

---

## Step 6 — Install Hermes Agent

```bash
curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash
```

Then:

```bash
hermes doctor
hermes setup
```

Fix anything `hermes doctor` flags (missing API keys, etc.).

Add your LLM key to **`~/.hermes/.env`**, for example:

```bash
OPENAI_API_KEY=sk-...
```

Add Telegram token if using chat demo:

```bash
TELEGRAM_BOT_TOKEN=...
```

---

## Step 7 — Configure Hermes (`~/.hermes/config.yaml`)

Open `~/.hermes/config.yaml` and register the MCP server. Use **absolute paths on this computer**:

```yaml
model:
  default: gpt-4o
  provider: openai

mcp_servers:
  doctor_context:
    command: node
    args:
      - /Users/YOU/Documents/hermes/mcp-doctor-agent-bridge/src/index.js
    env:
      LEGACY_BACKEND_ROOT: /Users/YOU/Documents/ai-doctor-agent/backend
      MCP_ALLOWED_USER_IDS: "student-demo@email.com"
      MCP_MAX_CONTEXT_CHARS: "8000"

telegram:
  channel_prompts:
    "YOUR_TELEGRAM_CHAT_ID":
      |
      For health questions, always call mcp_doctor_context_health_chat_guard_for_telegram first.
      Pass options: {"medications":true,"vitalsRecent":true,"chatRecent":true,"language":"en"}.
      If canAnswerHealthQuestion is false, reply with fallbackMessage only.
      Default to English unless the user asks for Chinese.
```

Find `YOUR_TELEGRAM_CHAT_ID` by messaging the bot once, then checking Hermes logs or using Telegram’s API — parent can copy from an already-working setup.

---

## Step 8 — System prompt (`~/.hermes/SOUL.md`)

Copy the health rules template:

```bash
cp ~/Documents/hermes/docs/hermes/M3_system_prompt_template.md ~/.hermes/SOUL.md
```

Or merge its contents into an existing `SOUL.md`. This tells the AI to **load profile data before** answering health questions.

---

## Step 9 — Start the stack

### Option A — Full local setup (best for learning)

**Terminal 1 — backend:**

```bash
cd ~/Documents/ai-doctor-agent
npm run start:backend
```

Wait until you see the server listening on port **8000**.

**Terminal 2 — Hermes gateway (Telegram + MCP):**

```bash
hermes gateway start
```

Keep both terminals open while demoing.

### Option B — Backend in the cloud, Hermes on the laptop

Only run:

```bash
hermes gateway start
```

MCP still needs `LEGACY_BACKEND_ROOT` pointing at a **local clone** of `backend/` (for Node `require` of services), even when Firebase data is shared via the cloud. Keep the `ai-doctor-agent` repo cloned and `backend/.env` filled with the same Firebase keys.

---

## Step 10 — Verify installation

Run these in order:

| # | Command | Expected result |
|---|---------|-----------------|
| 1 | `hermes doctor` | All checks pass |
| 2 | `hermes gateway status` | Gateway running |
| 3 | `hermes` then ask a health question | Agent calls MCP guard; answer mentions profile data |
| 4 | Message Telegram bot | Same guard behavior in chat |
| 5 | Daily report dry-run (optional) | See below |

**Daily report dry-run** (no Telegram send):

```bash
export DOCTOR_AGENT_DAILY_DRY_RUN=1
bash ~/Documents/hermes/mcp-doctor-agent-bridge/scripts/trigger-node-daily-report.sh
```

Expect HTTP **200** and JSON with `"dryRun": true` and `"language": "en"`.

**Acceptance checklist:**

- [ ] Both repos cloned under `~/Documents/`
- [ ] `npm install` succeeded in both projects
- [ ] `backend/.env` and MCP `.env` use correct **absolute paths**
- [ ] `hermes doctor` passes
- [ ] Health question triggers MCP tool (check `~/.hermes/logs/`)
- [ ] Wrong/missing profile → fallback message, not fake medical advice

---

## Step 11 — Day-to-day commands (student cheat sheet)

| Task | Command |
|------|---------|
| Start backend (local) | `cd ~/Documents/ai-doctor-agent && npm run start:backend` |
| Start Telegram bot | `hermes gateway start` |
| Stop gateway | `hermes gateway stop` |
| After config change | `hermes gateway restart` or `/reload-mcp` in Telegram |
| New chat session | `/new` in Telegram |
| CLI test (no Telegram) | `hermes` |
| Pull latest code | `cd ~/Documents/hermes && git pull` and same in `ai-doctor-agent` |

---

## Step 12 — Windows notes

If the student laptop runs **Windows**:

1. Use **Git Bash** or **WSL2** for the commands above.
2. Replace paths like `/Users/YOU/Documents/...` with WSL paths, e.g. `/mnt/c/Users/Student/Documents/...`, or native Windows paths in Hermes YAML if Hermes on Windows expects them.
3. Install Node 20+ from [nodejs.org](https://nodejs.org/) for Windows.
4. Hermes install script is aimed at macOS/Linux — check [Hermes quickstart](https://hermes-agent.nousresearch.com/docs/getting-started/quickstart) for Windows support status.

When in doubt, use **WSL2 Ubuntu** and follow this guide exactly with Linux-style paths.

---

## Troubleshooting

| Problem | What to try |
|---------|-------------|
| `MCP tool not available` | Check paths in `config.yaml`; `hermes gateway restart`; `/reload-mcp` |
| `Cannot find module` in MCP | `LEGACY_BACKEND_ROOT` must point to `.../ai-doctor-agent/backend` |
| Generic health answers | Guard failed — check Firebase user exists and `MCP_ALLOWED_USER_IDS` |
| Daily report still in Chinese | Set `CRON_DAILY_REPORT_LANGUAGE=en`; Railway must deploy **`release`** branch |
| `401` on daily webhook | `DOCTOR_AGENT_DAILY_WEBHOOK_TOKEN` must match `INTERNAL_CRON_BEARER_TOKEN` |
| Telegram bot silent | `hermes gateway status`; token in `~/.hermes/.env`; firewall / sleep mode |

Logs: `~/.hermes/logs/gateway.log`, `~/.hermes/logs/mcp-stderr.log`

More detail: [`CAST_Student_Mentor_Guide.md`](CAST_Student_Mentor_Guide.md) §11 and [`../hermes/DAILY_REPORT_RUNBOOK.md`](../hermes/DAILY_REPORT_RUNBOOK.md).

---

## What not to commit to GitHub

Never push these files:

- `~/.hermes/.env` (API keys)
- `ai-doctor-agent/backend/.env` (Firebase + tokens)
- `hermes/mcp-doctor-agent-bridge/.env` (paths + webhook token)

They stay **only on the laptop**.

---

## Document map

| Need | Read |
|------|------|
| **This file** | Clone repos + install on a new computer |
| Project concepts & CAST demo | [`CAST_Student_Mentor_Guide.md`](CAST_Student_Mentor_Guide.md) |
| Research paper | [`CAST_Research_Paper_hermes_ai_doctor.md`](CAST_Research_Paper_hermes_ai_doctor.md) |
| Slide outline | [`CAST_Presentation_Outline_hermes_ai_doctor.md`](CAST_Presentation_Outline_hermes_ai_doctor.md) |
| MCP tool reference | [`../../mcp-doctor-agent-bridge/README.md`](../../mcp-doctor-agent-bridge/README.md) |

---

*Parent on first setup: complete Steps 1–10 once alongside your daughter, save a copy of all `.env` files in a secure password manager, then she can use Step 11 for daily practice before CAST.*
