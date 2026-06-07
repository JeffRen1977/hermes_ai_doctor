# Hermes AI Doctor — Student & Mentor Guide

**For:** CAST competition team (senior high school) + parent/teacher mentor  
**Purpose:** Understand the project, learn Hermes Agent concepts, and run demos safely  
**Repo:** [github.com/JeffRen1977/hermes_ai_doctor](https://github.com/JeffRen1977/hermes_ai_doctor)  
**Related docs:** [`../README.md`](../README.md) (doc index); in this folder: `CAST_Research_Paper_hermes_ai_doctor.md`, `CAST_Presentation_Outline_hermes_ai_doctor.md`

---

## 0. Read this first (5-minute version)

**What we built:** A **personal health assistant** that talks like ChatGPT but **must load your real profile** (medications, vitals, etc.) before answering health questions.

**Two products in one demo:**

| Piece | What it is | Analogy |
|-------|------------|---------|
| **Hermes Agent** | Open-source “AI robot brain + messaging + tools” | The **student** who can use a phone and a library card |
| **AI Doctor (doctor-agent)** | Node.js app + Firebase with your health data | The **library** with your personal file |
| **MCP bridge** | Small program connecting Hermes to the library | The **library card scanner** — only allowed queries |

**Golden rule for the competition story:**  
> We do **not** trust the AI to remember medicine lists in chat memory. We **pull fresh data from the backend every time** via MCP.

**Disclaimer:** This is an **education / innovation project**, not a medical device. Always tell judges: *“See a doctor for diagnosis and emergencies.”*

**Mentors — to install on a new laptop:** start with [`CAST_Install_Guide_New_Computer.md`](CAST_Install_Guide_New_Computer.md), then **§6 How to run the project** below for deeper detail.

---

## 1. What is Hermes Agent?

**Hermes Agent** ([Nous Research](https://github.com/NousResearch/hermes-agent)) is an open-source **AI agent platform**. Unlike a single chat webpage, it can:

- Talk on **Telegram, Discord, CLI**, and other channels (**Gateway**)
- Call **tools** (terminal, files, web, custom APIs)
- Connect **MCP servers** (external tool/data plugins)
- Run **scheduled jobs** (**Cron**)
- Load **Skills** (reusable instruction packs)
- Keep lightweight **Memory** across sessions

For CAST, you can say: **“Hermes is the engine; AI Doctor is the health app we plug into it.”**

Official docs: [hermes-agent.nousresearch.com/docs](https://hermes-agent.nousresearch.com/docs)

---

## 2. Hermes building blocks (what judges may ask)

### 2.1 Prompt & personality

| Concept | Where it lives | What it does |
|---------|----------------|--------------|
| **System prompt** | Built by Hermes from many pieces | Tells the model *how to behave* |
| **SOUL.md** | `~/.hermes/SOUL.md` | **Your project rules** — e.g. “always call MCP before health answers” |
| **Personality** | `config.yaml` → `display.personality` | Mostly **cosmetic** tone (cute, formal) — **not** where medical rules go |
| **Channel prompts** | `config.yaml` → `telegram.channel_prompts` | Extra rules **per Telegram chat** (e.g. fixed `telegramChatId`) |

**For AI Doctor:** Medical safety rules belong in **`SOUL.md`** and **`telegram.channel_prompts`**, not in personality presets.

### 2.2 Context

**Context** = everything the model sees in one turn: system instructions + tool results + recent chat.

In our project:

- **Live health context** comes from MCP → doctor-agent → `buildAIContext` (medications, vitals, profile).
- **Conversation context** is managed by Hermes (compression when chat gets long).
- **Project context files** (optional): `AGENTS.md`, `.hermes.md` in a repo when using `--workdir`.

**Important:** Context is **not** the same as Memory. Context changes every message; Memory is a small saved summary.

### 2.3 Tools & toolsets

Hermes can **call tools** instead of only typing text:

- Built-in: terminal, read file, web search, etc.
- **MCP tools**: our `health_chat_guard`, `report_generate`, …

In config, **toolsets** control which tools are enabled (e.g. `hermes-telegram` for Telegram).

Our MCP tools appear with a prefix, e.g.:

`mcp_doctor_context_health_chat_guard_for_telegram`

### 2.4 MCP (Model Context Protocol)

**MCP** = a standard way to plug **external data/services** into an AI app.

```
Hermes Agent  ←stdio→  mcp-doctor-agent-bridge  ←Node require→  doctor-agent backend
```

- **stdio transport:** Hermes starts our bridge as a subprocess; no extra public port for MCP.
- **Bridge code:** `mcp-doctor-agent-bridge/src/index.js` + `doctorContextTools.js`
- **Why MCP?** The AI never gets Firebase passwords; it only gets **tool results**.

### 2.5 Skills

**Skills** are packaged instructions + optional scripts (like mini playbooks).

In this repo:

- `docs/hermes/skills/daily-health-report/SKILL.md` — how to draft a daily report JSON
- `docs/hermes/skills/lab-result-extraction/SKILL.md` — lab text extraction

Skills are **optional** for basic demo. The **required** path for health chat is **MCP guard tools**, not skills.

### 2.6 Memory

Hermes can store small long-term notes:

| File | Typical content | For AI Doctor |
|------|-----------------|---------------|
| `~/.hermes/memories/MEMORY.md` | Things the agent “learned” about you | **Preferences only** — not the medical record |
| `~/.hermes/memories/USER.md` | User profile blurbs | Same — do not store diagnoses here |
| `SOUL.md` | Stable rules | **Use this** for “always call MCP first” |

**Medical truth** stays in **Firebase / doctor-agent**, loaded via MCP each time.

### 2.7 Gateway & Cron

| Feature | Role in demo |
|---------|----------------|
| **Gateway** | Keeps Telegram bot online; runs agent per message |
| **Cron** | Runs scheduled tasks (e.g. daily report trigger script) |

Commands mentors use:

```bash
hermes gateway status
hermes cron list
```

---

## 3. AI Doctor — main functions (what to show judges)

### 3.1 Personalized health Q&A

**User story:** “I ask about my health in Telegram; the bot answers using **my** meds and vitals.”

**Flow:**

1. User sends message on Telegram  
2. Hermes agent calls **`health_chat_guard_for_telegram`**  
3. Backend loads profile → returns `systemPromptContext`  
4. Model answers in Chinese/English with guardrails  

**If data fails:** User sees **fallback message** — no fake personalization.

### 3.2 Account binding (Telegram ↔ user)

**User story:** “The bot knows which Firebase user I am.”

- Binding bot + webhook writes `integrations.telegramChatId` in user settings  
- MCP resolves `telegramChatId` → `userId` (email-based id)

See: `../hermes/Telegram_only_personal_chat_and_daily_report.md`

### 3.3 Daily health report

**User story:** “Every morning I get a short summary on Telegram.”

- Backend: `POST /internal/cron/daily-report`  
- Generates report + sends Telegram message  
- Trigger: `scripts/trigger-node-daily-report.sh` or Hermes cron  

See: `../hermes/DAILY_REPORT_RUNBOOK.md`

### 3.4 Optional advanced tools (mention if asked)

| Tool | Use |
|------|-----|
| `health_analyze_text` | Deeper analysis of pasted health text |
| `risk_detect_anomalies` | Wearable / trend anomaly hints |
| `report_generate` | Create structured assessment report in DB |

---

## 4. Architecture map (draw this on a whiteboard)

```
┌─────────────────────────────────────────────────────────────┐
│  YOU (Telegram / CLI)                                        │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  HERMES AGENT (~/.hermes/)                                   │
│  • Gateway (Telegram)                                        │
│  • LLM (GPT-4o, Gemini, …)                                   │
│  • SOUL.md + channel_prompts                                 │
│  • MCP client                                                │
└───────────────────────────┬─────────────────────────────────┘
                            │ MCP stdio
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  mcp-doctor-agent-bridge/                                    │
│  • health_chat_guard*                                        │
│  • report_generate, …                                        │
└───────────────────────────┬─────────────────────────────────┘
                            │ Node services
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  ai-doctor-agent/backend/                             │
│  • contextBuilderService (buildAIContext)                    │
│  • Firebase / userSettings / reports                         │
│  • daily-report cron, Telegram sendMessage                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. Repository tour (for students)

| Path | Who cares | One-line description |
|------|-----------|----------------------|
| `docs/hermes_design_document.md` | Judges / report | Why we built this (English design doc) |
| `docs/hermes_implementation_guide.md` | Mentors | Engineer checklist |
| `mcp-doctor-agent-bridge/README.md` | Everyone | MCP tools list + setup |
| `mcp-doctor-agent-bridge/src/index.js` | Developers | Registers MCP tools |
| `mcp-doctor-agent-bridge/src/doctorContextTools.js` | Developers | Guard logic + Firebase calls |
| `docs/hermes/M3_tool_call_strategy.md` | Students | When to call which tool |
| `docs/competition/` | CAST team | Paper + slides + this guide |
| `ai-doctor-agent/` | Mentors only | Sibling repo — clone next to `hermes/`; not tracked in this repo |

**GitHub public repo** (`hermes_ai_doctor`) has bridge + docs. The **doctor-agent backend** lives in a **sibling repo** (`ai-doctor-agent`) — clone it next to `hermes/` on your laptop.

---

## 6. How to run the project (setup & operations)

This section is the **step-by-step runbook** for mentors. Students can follow along for a supervised lab session.

### 6.1 Folder layout on your machine

```
~/Documents/
├── hermes/                          # This repo
│   ├── docs/                        # All reference documentation
│   │   ├── competition/             # CAST materials (this guide)
│   │   └── hermes/                  # Runbooks, M3 templates, skills
│   └── mcp-doctor-agent-bridge/     # Runnable MCP server + scripts
└── ai-doctor-agent/                 # Doctor-agent backend (Node + Firebase)
    └── backend/
```

Hermes Agent itself is installed separately under **`~/.hermes/`** (not inside this git repo).

### 6.2 Prerequisites

| Requirement | Notes |
|-------------|--------|
| **Node.js ≥ 20** | For doctor-agent and MCP bridge |
| **Hermes Agent** | [Quickstart install](https://hermes-agent.nousresearch.com/docs/getting-started/quickstart) |
| **LLM API key** | e.g. OpenAI in `~/.hermes/.env` (GPT-4o recommended if Gemini times out) |
| **Firebase credentials** | In `ai-doctor-agent/backend/.env` |
| **Telegram bot token** | For Hermes gateway chat; separate token optional for daily report bot |

### 6.3 One-time setup

#### A. Clone repos (if needed)

```bash
cd ~/Documents
git clone https://github.com/JeffRen1977/hermes_ai_doctor.git hermes
git clone https://github.com/JeffRen1977/ai-doctor-agent.git
```

#### B. Doctor-agent backend environment

```bash
cp ~/Documents/hermes/docs/hermes/doctor-agent-backend.env.example \
   ~/Documents/ai-doctor-agent/backend/.env
```

Edit `backend/.env` and set at minimum:

- `FIREBASE_API_KEY` (+ other Firebase vars your backend needs)
- `PORT=8000`
- `INTERNAL_CRON_BEARER_TOKEN` — random secret for the daily-report webhook (`openssl rand -hex 32`)
- `CRON_DAILY_REPORT_USER_EMAILS=your-test-user@email.com`
- `TELEGRAM_BOT_TOKEN` — bot used for daily report `sendMessage`

#### C. MCP bridge environment

```bash
cd ~/Documents/hermes/mcp-doctor-agent-bridge
npm install
cp .env.example .env
```

Edit `.env` (use **absolute paths** on your machine):

```bash
LEGACY_BACKEND_ROOT=/Users/YOU/Documents/ai-doctor-agent/backend
MCP_ALLOWED_USER_IDS=your-test-user@email.com
```

For daily reports, also add:

```bash
DOCTOR_AGENT_DAILY_WEBHOOK_URL=http://127.0.0.1:8000/internal/cron/daily-report
DOCTOR_AGENT_DAILY_WEBHOOK_TOKEN=<same as INTERNAL_CRON_BEARER_TOKEN>
DOCTOR_AGENT_DAILY_USER_EMAILS=your-test-user@email.com
```

Use your Railway HTTPS URL instead of `127.0.0.1` when the backend runs in the cloud.

#### D. Hermes Agent

```bash
curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash
hermes doctor
hermes setup
```

Register MCP in **`~/.hermes/config.yaml`** (see §9 cheat sheet). Copy **`docs/hermes/M3_system_prompt_template.md`** into **`~/.hermes/SOUL.md`** (or merge with existing rules). For Telegram, configure **`health_chat_guard_for_telegram`** (scheme B) or a fixed test `userId` (scheme A).

### 6.4 Start each piece

#### Doctor-agent backend (local)

Backend only:

```bash
cd ~/Documents/ai-doctor-agent
npm install
npm run start:backend
```

Listens on **`http://127.0.0.1:8000`** (or your `PORT`).

Backend + frontend dev servers:

```bash
npm run dev
```

Production-style (same as Railway):

```bash
npm start
```

#### MCP bridge

You usually **do not** start this yourself — Hermes launches it over stdio when the gateway runs.

Manual smoke test (waits on stdin; stop with Ctrl+C):

```bash
cd ~/Documents/hermes/mcp-doctor-agent-bridge
npm start
```

#### Hermes + Telegram chat

```bash
hermes gateway start
```

Or as a background service:

```bash
hermes gateway install
hermes gateway start
```

After config changes: `hermes gateway restart` or `/reload-mcp` in Telegram.

CLI test (no Telegram):

```bash
hermes
```

Ask a health question; check `~/.hermes/logs/` for MCP tool calls.

#### Daily health report

**Dry run** (no DB write, no Telegram send):

```bash
export DOCTOR_AGENT_DAILY_DRY_RUN=1
bash ~/Documents/hermes/mcp-doctor-agent-bridge/scripts/trigger-node-daily-report.sh
```

Expect HTTP **200** and `"dryRun": true`.

**Live run:**

```bash
unset DOCTOR_AGENT_DAILY_DRY_RUN
bash ~/Documents/hermes/mcp-doctor-agent-bridge/scripts/trigger-node-daily-report.sh
```

Requires: backend running, user has `integrations.telegramChatId` in Firestore, matching Bearer token on both sides.

**Scheduled (Hermes Cron, e.g. daily 07:00)** — gateway must stay running:

```bash
hermes gateway start
bash ~/Documents/hermes/mcp-doctor-agent-bridge/scripts/register-hermes-cron-daily-report.sh
hermes cron list
```

See `../hermes/HERMES_CRON_DAILY_REPORT.md` for schedule overrides.

### 6.5 Typical local dev session (3 terminals)

| Terminal | Command | Purpose |
|----------|---------|---------|
| 1 | `cd ~/Documents/ai-doctor-agent && npm run start:backend` | Firebase + health APIs |
| 2 | `hermes gateway start` | Telegram + MCP + LLM |
| 3 | (optional) dry-run daily report script | Test cron webhook |

### 6.6 Run acceptance checklist

- [ ] `hermes doctor` passes
- [ ] Telegram health question → MCP `health_chat_guard*` runs → answer uses demo profile
- [ ] Missing/wrong profile → fallback message, **not** fabricated personalization
- [ ] Dry-run daily report → HTTP 200
- [ ] Live daily report → Telegram message received (optional)

### 6.7 Reference docs (deeper detail)

| Topic | File |
|-------|------|
| MCP tools & env | `../../mcp-doctor-agent-bridge/README.md` |
| Documentation index | `../README.md` |
| Full implementation guide | `../hermes_implementation_guide.md` |
| Telegram chat + daily report | `../hermes/Telegram_only_personal_chat_and_daily_report.md` |
| Daily report runbook | `../hermes/DAILY_REPORT_RUNBOOK.md` |
| Hermes Cron setup | `../hermes/HERMES_CRON_DAILY_REPORT.md` |

---

## 7. How to USE the AI Doctor (demo day playbook)

### 7.1 Before the demo (mentor checklist)

Complete **§6** first, then verify:

- [ ] Hermes installed: `hermes doctor`  
- [ ] Gateway running: `hermes gateway status`  
- [ ] MCP in `~/.hermes/config.yaml` → `mcp_servers.doctor_context`  
- [ ] `~/.hermes/SOUL.md` has health guard rules  
- [ ] Telegram bot token in `~/.hermes/.env`  
- [ ] Backend reachable (local or Railway) with Firebase keys  
- [ ] Test user has profile data + optional Telegram binding  
- [ ] LLM API key works (OpenAI recommended if Gemini times out)

### 7.2 Demo A — CLI (safest for classroom)

**Best for:** Showing MCP tool call without Telegram setup.

1. Open terminal  
2. Run `hermes` (CLI chat)  
3. Ask: *“Based on my personal health profile, briefly summarize my basic information.”*  
4. **Point out:** Agent should call `mcp_doctor_context_health_chat_guard` first  
5. Show answer cites profile fields from backend  

**If it asks for userId:** Check `SOUL.md` — CLI should use fixed test `userId`.

### 7.3 Demo B — Telegram (wow factor)

1. Send message to your Hermes Telegram bot  
2. Ask a health-related question in Chinese  
3. Show (if `/verbose` enabled) tool progress: MCP guard  
4. Explain binding: chat id → user id  

**Do not** show real PHI on projector — use a **demo account** with fake/safe data.

### 7.4 Demo C — Daily report (optional)

**Dry run (no Telegram send):**

```bash
export DOCTOR_AGENT_DAILY_DRY_RUN=1
bash ~/Documents/hermes/mcp-doctor-agent-bridge/scripts/trigger-node-daily-report.sh
```

Explain JSON response: `dryRun`, `userEmail`, `wouldGenerate`.

### 7.5 Useful Hermes chat commands

| Command | Effect |
|---------|--------|
| `/new` | Fresh conversation |
| `/reload-mcp` | Reload MCP servers |
| `/model` | Switch LLM |
| `/status` | Session info |
| `/help` | Command list |

---

## 8. How to DEVELOP / extend (student-safe experiments)

### Level 1 — No coding (configuration)

1. Edit **`~/.hermes/SOUL.md`** — add one rule (e.g. “always answer in simple English for teens”)  
2. Edit **`telegram.channel_prompts`** — per-chat behavior  
3. Change **`MCP_MAX_CONTEXT_CHARS`** in MCP env — see truncation effect  

### Level 2 — Read the bridge

1. Open `doctorContextTools.js` — find `runHealthChatGuard`  
2. Trace: `buildAIContext` → `canAnswerHealthQuestion` → return JSON  
3. Read `M3_tool_call_strategy.md` — draw flow on paper  

### Level 3 — Small code change (with mentor)

1. Change fallback message in `.env` → `MCP_HEALTH_FALLBACK_MESSAGE`  
2. Add a log line in bridge (no PHI in logs!)  
3. Add one field to `options` in SOUL.md and test  

### Level 4 — New feature idea (for future competition)

- Multilingual reports  
- Parent/teen consent screen  
- Automated test: “10 questions must call MCP”  

**Do not** for v1: give LLM direct DB access, store diagnoses in MEMORY.md, or claim FDA/clinical validation.

---

## 9. Configuration cheat sheet (mentor)

### ~/.hermes/config.yaml (key parts)

```yaml
model:
  default: gpt-4o          # or your chosen model
  provider: openai

mcp_servers:
  doctor_context:
    command: node
    args:
      - /ABSOLUTE/PATH/mcp-doctor-agent-bridge/src/index.js
    env:
      LEGACY_BACKEND_ROOT: /ABSOLUTE/PATH/ai-doctor-agent/backend
      MCP_ALLOWED_USER_IDS: 'your-test-user@email.com'

telegram:
  channel_prompts:
    "YOUR_CHAT_ID":
      |  # rules for Telegram health guard tool
```

### mcp-doctor-agent-bridge/.env

```bash
LEGACY_BACKEND_ROOT=...
MCP_ALLOWED_USER_IDS=...
DOCTOR_AGENT_DAILY_WEBHOOK_URL=...   # for daily report trigger
DOCTOR_AGENT_DAILY_WEBHOOK_TOKEN=...
```

### ai-doctor-agent/backend/.env (backend)

See `../hermes/doctor-agent-backend.env.example`:

- `FIREBASE_API_KEY`, …  
- `INTERNAL_CRON_BEARER_TOKEN`  
- `CRON_DAILY_REPORT_USER_EMAILS`  
- `TELEGRAM_BOT_TOKEN` (for report send)

---

## 10. CAST presentation script (8 minutes)

| Min | Slide topic | Do / say |
|-----|-------------|----------|
| 0–1 | Problem | “ChatGPT doesn’t know your meds.” |
| 1–2 | Objectives | Personalized + safe fallback + Telegram |
| 2–3 | Architecture | Draw 3 layers |
| 3–4 | MCP + guard | “Load data first, answer second” |
| 4–5 | Innovation | Guard-first, MCP bridge, open stack |
| 5–6 | Safety | Not a device; data in backend |
| 6–7 | **Live demo** | CLI or Telegram (pre-tested) |
| 7–8 | Future + Q&A | Cron, tests, ethics |

Assign roles: **Speaker 1** architecture, **Speaker 2** demo, **Speaker 3** safety & Q&A.

---

## 11. Troubleshooting (quick)

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| “MCP tool not available” | Gateway not loading MCP | `/reload-mcp`, restart gateway, check `config.yaml` path |
| Bot uses wrong tool on Telegram | Used CLI tool name | SOUL + channel_prompts → `…_for_telegram` |
| “No response from provider” 15+ min | LLM API timeout | Switch model/provider; `/model` |
| Empty / generic health answer | Guard failed or no profile | Check Firebase user + `MCP_ALLOWED_USER_IDS` |
| Daily report no Telegram | No `telegramChatId` | Complete binding flow |
| 401 on daily webhook | Token mismatch | Match Bearer on both sides |

Logs: `~/.hermes/logs/gateway.log`, `~/.hermes/logs/mcp-stderr.log`

---

## 12. Glossary (for Q&A)

| Term | Simple definition |
|------|-------------------|
| **LLM** | Large language model (e.g. GPT-4o) — the “brain” |
| **Agent** | LLM + tools + rules that can take actions |
| **MCP** | Standard plugin protocol for tools/data |
| **Gateway** | Hermes process that connects Telegram to the agent |
| **Guard** | Our check: “Did we load real user context?” |
| **userId** | Internal account key (often email doc id in Firebase) |
| **PHI** | Protected health information — handle carefully |
| **Cron** | Scheduled automatic jobs |
| **Skill** | Reusable instruction module in Hermes |

---

## 13. Study plan for the team (1 week)

| Day | Activity |
|-----|----------|
| Day 1 | Read §0–§2 and §6 of this guide; watch parent demo CLI |
| Day 2 | Draw architecture from memory; label MCP |
| Day 3 | Each student explains one MCP tool to the group |
| Day 4 | Rehearse slides; assign speaking parts |
| Day 5 | Full dry-run demo + Q&A practice |
| Day 6 | Polish research paper PDF; blur screenshots |
| Day 7 | Competition day — arrive early, test Wi‑Fi / hotspot backup |

---

## 14. Document map (what to read when)

| Need | Read |
|------|------|
| CAST paper content | `CAST_Research_Paper_hermes_ai_doctor.md` |
| Slide bullets | `CAST_Presentation_Outline_hermes_ai_doctor.md` |
| Teach Hermes + demo + **how to run** | **This file** (§6–§7) |
| MCP tool details | `../../mcp-doctor-agent-bridge/README.md`, `../hermes/M3_tool_call_strategy.md` |
| Telegram binding | `../hermes/Telegram_only_personal_chat_and_daily_report.md` |
| Daily report setup | `../hermes/DAILY_REPORT_RUNBOOK.md` |
| Design rationale | `../hermes_design_document.md` |

---

## 15. Ethics statement (read aloud at competition)

> Our project helps users understand health information using their own stored profile. It is **not** a doctor, **not** for emergencies, and **not** approved medical equipment. We designed it so the AI **cannot pretend** to know your records unless it successfully loads them through a secured tool. We believe responsible AI in healthcare means **privacy, honesty, and human oversight**.

---

*Good luck at CAST! Questions for the mentor: start with `hermes doctor`, Section 6 (run setup), and Section 11 (troubleshooting).*
