# Hermes AI Doctor: A Privacy-Aware Personal Health Assistant Using Model Context Protocol (MCP)

**Project title:** Hermes AI Doctor (hermes_ai_doctor)  
**Competition track:** CAST Global Youth Innovation & Entrepreneurship Summit — Track A: STEM Innovation  
**Sub-categories:** Information Technology (AI, Robotics, App); Healthcare & Biomedical Innovation; Multidisciplinary Project  
**Team:** [Student name(s)] — Age group: [10–14 / 15–18]  
**School / affiliation:** [Your school]  
**Date:** May 2026  

---

*Formatting note for submission: Convert this document to PDF or Word using 12-point Times New Roman, 1.5 line spacing, 1-inch margins on all sides. Target length: 4–6 pages (within the 2–8 page limit). Maximum file size: 10 MB.*

---

## Project Objectives

The Hermes AI Doctor project aims to build a **personalized health companion** that helps users ask everyday health questions in natural language (for example, via Telegram) while **grounding every answer in that user’s own medical profile**, not generic internet advice.

Specific objectives are:

1. **Personalized responses:** Before answering health-related questions, the system must load the user’s medications, recent vital signs, basic profile, and recent chat history from a secure backend.
2. **Safe fallback:** If personal data cannot be loaded, the assistant must **refuse to guess** and show a clear, non-alarming message instead of inventing medical facts.
3. **Practical access:** Users can interact through familiar messaging apps (Telegram) using an open-source AI agent framework (Hermes Agent by Nous Research).
4. **Continuous care support:** Support scheduled **daily health summaries** delivered to the user’s phone, using the same personal data pipeline.
5. **Education and innovation:** Demonstrate how **Model Context Protocol (MCP)** connects a general-purpose AI agent to a domain-specific health backend in a modular, auditable way.

This project is **not** a medical device and does not replace doctors; it is an educational prototype for responsible AI in personal health literacy.

---

## Background & Motivation

Many people use large language models (LLMs) for health questions. A common problem is that these models answer from **general training data**, not from **your** allergies, medications, or recent blood pressure readings. That can lead to answers that sound confident but are **not personalized**, or that miss important context (for example, drug interactions).

At the same time, storing full medical records inside a chatbot’s built-in “memory” is risky: memory files can mix users, grow stale, or leak sensitive information if misconfigured.

Our family project started from a practical question: **How can we use a powerful AI assistant while keeping personal health data in a controlled database and only sending summarized context to the model when needed?**

We chose:

- **Hermes Agent** — an open-source agent platform with messaging gateway, tools, cron jobs, and MCP support ([NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent)).
- **doctor-agent (ai-doctor-agent)** — a Node.js + Firebase application (sibling repository) that stores personal health data and builds structured AI context (`buildAIContext`) for each user.
- **MCP Doctor-Agent Bridge** — a small Node.js MCP server we developed to expose health tools to Hermes without giving the AI direct database access.

This combination fits the CAST summit themes of **AI**, **healthcare innovation**, and **interdisciplinary engineering** (software + medicine + ethics).

---

## Methodology / Technical Approach

### System architecture

The system has three layers:

1. **User channel (Telegram)**  
   The user sends messages to a Telegram bot. **Hermes Gateway** receives messages, manages sessions, and runs the AI agent with tools.

2. **Agent runtime (Hermes Agent)**  
   Hermes selects an LLM (e.g., GPT-4o or Gemini), follows instructions in `SOUL.md` and channel-specific prompts, and calls **MCP tools** when health context is required.

3. **Health data backend (doctor-agent)**  
   A Node.js / Express server backed by **Firebase Firestore** (optional MongoDB adapter). It is the **system of record** for profiles, medications, vitals, chat history, and generated reports. Context is built by `contextBuilderService` and formatted for the model by `formatContextForSystemPrompt`.

```
User (Telegram) → Hermes Gateway → LLM + MCP tools
                                      ↓
                         mcp-doctor-agent-bridge (stdio MCP)
                                      ↓
                         ai-doctor-agent/backend (Express + Firebase)
                                      ↑
                    Mobile app (JWT REST /api/*) — same database
```

### Doctor-agent backend implementation

The backend lives in the **`ai-doctor-agent`** repository (`backend/` directory). It predates the Hermes integration and serves both a **Capacitor mobile web app** and **automation endpoints** used by Hermes cron and Telegram binding. Hermes does **not** call the mobile REST API for chat; instead, the MCP bridge loads backend **services in-process** via Node `require`, using the same Firebase repositories as the app.

#### Technology stack

| Component | Choice | Role |
|-----------|--------|------|
| Runtime | Node.js ≥ 20 | Server and shared logic with MCP bridge |
| HTTP | Express 4 | REST API, static PWA hosting, internal webhooks |
| Database | Firebase Firestore (default) | User profiles, vitals, medications, reports |
| Auth (app) | JWT + Firebase Auth | Mobile and web clients |
| AI providers | Factory pattern (Gemini, OpenAI, Ernie, Qwen) | Analysis, chat, report text generation |
| Validation | Joi schemas | Report sections, payloads |

Entry point: `backend/src/index.js`. Data access uses a **repository facade** over Firestore adapters (`userSettings`, `personalHealthRecords`, `reports`, etc.).

#### Core services (functionality provided)

| Service | Key functions | Purpose |
|---------|---------------|---------|
| **`contextBuilderService`** | `buildAIContext(userId, options)`, `formatContextForSystemPrompt(payload)` | Assembles ephemeral AI context from profile, medications, recent vitals, and chat; formats prompt blocks for the LLM. **Not exposed over REST** — used by app chat routes and MCP bridge. |
| **`aiServiceFactory`** | `analyzeHealthRecords`, `healthChat`, `checkDrugInteractions`, image/PDF analysis | Multi-provider AI tasks for the mobile app and report generation. |
| **`reportService`** | `generateHealthAssessmentReport`, `generateComprehensiveReport`, `getUserReports` | LLM-generated structured reports (executive summary, metrics, risks, recommendations) persisted to Firestore. |
| **`riskMonitoringService`** | `detectAnomalies`, `processStreamData`, `predictHypoglycemia`, `generateAlert` | Wearable-style stream processing, rule + LLM anomaly detection, alert storage. |
| **`telegramIntegrationService`** | `createTelegramBindCode`, `bindTelegramChat`, `sendTelegramText` | One-time 6-character bind codes and Telegram Bot API messaging. |
| **`dailyReportCronService`** | `runDailyReportBatch` | Batch job: context check → report generation → Telegram summary per user. |

**User identity:** Firestore document ids use a **sanitized email** (e.g., `jianfengren.sd@gmail.com` → `jianfengren_sd_gmail_com`), consistent across app, MCP allowlists, and cron user lists.

#### Data stored (selected Firestore collections)

| Collection / path | Content |
|-------------------|---------|
| `userSettings/{userId}` | AI preferences, **`integrations.telegramChatId`** for Telegram push |
| `personalHealthRecords/{userId}` | Core health profile |
| `…/medications`, `…/vitals_daily`, `…/chat_sessions` | Subcollections used by `buildAIContext` |
| `reports/{reportId}` | Generated daily / assessment reports |
| `telegramBindingCodes/{code}` | Short-lived bind codes (≈15 min TTL) |
| `wearableStreamData`, `riskAlerts` | Optional wearable and risk-monitoring data |

Hermes **MEMORY.md** is intentionally **not** the medical record; clinical truth stays in Firestore and is loaded fresh per MCP call.

#### API surface: mobile app vs Hermes

**Mobile / PWA (JWT `Authorization: Bearer`):** Routes under `/api/*` include authentication, chat, health records, wearables, health analysis, user settings, digital twin, risk monitoring, intervention engine, rehabilitation assistant, reports, appointments, emergency contacts, and **`POST /api/integrations/telegram/bind-code`** (issues bind code from the app).

**Hermes integration (two paths):**

1. **MCP bridge (personalized chat)** — Hermes calls MCP tools; the bridge invokes the same backend services directly (no HTTP). Tools map to: context guard, text analysis, anomaly detection, report generation.
2. **Internal HTTP (automation only)** — Bearer- or secret-protected routes not used by the mobile app:

| Endpoint | Auth | Function |
|----------|------|----------|
| `POST /internal/cron/daily-report` | Bearer token | Runs `runDailyReportBatch`: build context, generate report, send Telegram summary |
| `POST /internal/telegram/webhook` | Optional webhook secret | Receives bind code from Telegram bot; writes `telegramChatId` to user settings |

This split keeps the **conversational agent** on MCP (auditable tool calls) while **scheduled jobs and binding webhooks** use simple HTTP triggers suitable for cron scripts and Telegram.

#### Telegram account binding (backend flow)

1. User logs into the **mobile app** and requests **`POST /api/integrations/telegram/bind-code`** → receives a 6-character code (stored in `telegramBindingCodes`, expires in ~15 minutes).  
2. User sends the code to the **Telegram binding bot**.  
3. Telegram posts an update to **`POST /internal/telegram/webhook`**.  
4. `bindTelegramChat(chatId, code)` validates the code, deletes it, and saves **`integrations.telegramChatId`** on the user’s `userSettings` document.  
5. MCP tool **`health_chat_guard_for_telegram`** later resolves `chat_id` → `userId` via `findUserIdByTelegramChatId` before loading health context.

#### Daily report batch (backend flow)

When **`POST /internal/cron/daily-report`** is called (by Hermes cron script, launchd, or Railway scheduler):

1. **`internalCronAuth`** validates the Bearer token.  
2. **`runDailyReportBatch`** reads user emails from the request body or env `CRON_DAILY_REPORT_USER_EMAILS`.  
3. For each user: **`buildAIContext`** — if no real profile (placeholder only), skip with `no_basic_profile`.  
4. Unless `dryRun=true`: **`generateHealthAssessmentReport`** persists a report; **`sendTelegramSummary`** sends the executive summary via **`TELEGRAM_BOT_TOKEN`**.  
5. JSON response lists per-user status (`success`, `skipped`, `error`).

Dry-run mode supports competition demos and testing without LLM cost or live Telegram sends.


### Model Context Protocol (MCP)

**MCP** is an open standard for connecting AI applications to external data and tools. Our bridge registers tools such as:

| MCP tool | Purpose |
|----------|---------|
| `health_chat_guard` | Load personal context by `userId`; return whether the model may answer; provide `systemPromptContext` or a fallback message. |
| `health_chat_guard_for_telegram` | Resolve `userId` from Telegram `chat_id` after account binding, then same guard logic. |
| `health_context_get` | Return full payload and prompt text for advanced flows. |
| `report_generate` | Generate structured health assessment reports stored in the backend. |
| `risk_detect_anomalies` | Optional anomaly detection on wearable-style data streams. |

Hermes exposes these as prefixed tools (e.g., `mcp_doctor_context_health_chat_guard`). The agent is instructed to **call the guard tool first** for health questions.

### Personalization workflow (M3 strategy)

For each health-related user message:

1. Agent receives the message on Telegram (or CLI for testing).
2. Agent calls **`health_chat_guard_for_telegram`** with `telegramChatId` and options: medications, recent vitals, recent chat, language `zh` or `en`.
3. Bridge loads backend services in-process, runs `buildAIContext`, checks allowlist (`MCP_ALLOWED_USER_IDS` in production).
4. If `canAnswerHealthQuestion` is **false**, the user sees only `fallbackMessage` — no fabricated diagnosis.
5. If **true**, the agent answers using `systemPromptContext` and states that the reply is based on the user’s stored profile.

### Identity and binding

- **Primary account id:** email-based `userId` (e.g., stored as Firestore `userSettings` document id).
- **Telegram:** separate binding bot writes `integrations.telegramChatId`; MCP resolves chat id → user id for multi-channel use.

### Scheduled daily reports

A **cron pipeline** (Hermes built-in cron, macOS launchd, or cloud scheduler) runs `trigger-node-daily-report.sh`, which calls **`POST /internal/cron/daily-report`** on the backend with a Bearer token matching `INTERNAL_CRON_BEARER_TOKEN`. The backend batch service (see **Daily report batch** above) builds context, generates a health assessment report, and sends an executive summary to the user’s bound Telegram `chat_id`. Hermes cron may also deliver a short status message to the mentor channel when the script completes.

Dry-run (`dryRun=true`) validates connectivity and user eligibility without report writes or Telegram delivery.

### Safety and privacy controls

- MCP allowlist for `userId` in development/production.  
- No full PHI in default logs; audit design documented in project M6 checklist.  
- Clear disclaimer: not for emergency diagnosis; seek care for urgent symptoms.  
- Hermes `MEMORY.md` stores **preferences**, not the medical record of truth — clinical data stays in Firebase.

### Development and testing methods

- Local testing: Hermes CLI with fixed `userId` in `SOUL.md`.  
- Telegram testing: `channel_prompts` + `health_chat_guard_for_telegram`.  
- Dry-run mode for daily report webhook (`?dryRun=true`) before live Telegram send.  
- Manual verification: confirm tool calls in session logs and compare answers with/without MCP enabled.

---

## Key Innovation

1. **Guard-first design:** Unlike a chatbot that always answers immediately, our agent must pass a **health chat guard** that proves personal context was loaded. This reduces “hallucinated personalization.”

2. **Separation of concerns:** Hermes handles conversation, tools, and scheduling; **doctor-agent** remains the **system of record** for health data (Firestore + Express API for the mobile app). MCP is the narrow bridge for chat — easier to audit than giving the LLM database credentials. Internal HTTP routes handle cron and Telegram binding separately from `/api/*`.

3. **Dual-channel identity:** Same backend serves CLI (known `userId`) and Telegram (chat id binding), using one MCP server with two entry tools.

4. **Composable open stack:** We integrate **open-source** Hermes Agent with an existing full-stack health backend (mobile app + Firebase + AI services) without rewriting either system — a pattern other student teams could reuse for finance, education, or sports analytics.

5. **Dual integration model:** In-process MCP for interactive guard-first chat; REST internal webhooks for scheduled reports and Telegram binding — each path uses the appropriate interface for its job.

6. **Operational hooks for growth:** Daily cron batch service, structured report persistence, and observability checklist (M6) support moving from demo to a monitored pilot.

## Results / Findings

During development and family testing we observed the following:

### Functional results

- **MCP integration:** Hermes successfully registered `doctor_context` MCP tools and invoked `health_chat_guard` in CLI tests, returning profile fields (name, role, location, etc.) from the backend context builder.
- **Telegram path:** After configuring Gateway, `channel_prompts`, and `SOUL.md` platform rules, the bot could answer basic profile questions when MCP was loaded; when MCP was missing or the wrong tool was used, the bot correctly reported that the health tool was unavailable instead of inventing data.
- **Account identity:** Using a stable `userId` (email document id) aligned Firestore data with MCP allowlist entries.
- **Backend services:** Express server with `contextBuilderService`, `reportService`, `dailyReportCronService`, and Telegram binding/webhook routes; mobile app uses the same Firestore data via `/api/*` JWT routes.
- **Daily report pipeline:** `POST /internal/cron/daily-report` batch job tested with dry-run and live Telegram send; Hermes cron trigger script documented.

### Limitations discovered

- **LLM provider latency:** Long health questions with tool calls sometimes caused multi-minute timeouts on some cloud models (e.g., Gemini); switching providers (e.g., OpenAI GPT-4o) improved reliability.
- **Gateway dependency:** Telegram cron and messaging require Hermes Gateway to stay running; direct OS cron calling the webhook is more reliable for production schedules.
- **Not a clinical trial:** Results are qualitative (correct use of tools, sensible answers in test cases), not statistically validated medical outcomes.

### Example scenario (illustrative)

A user describes straining during bowel movement and sudden nosebleed. The designed behavior is: guard loads profile → agent gives general educational context (possible mucosal irritation, when to seek care) **without** claiming to have reviewed labs unless they exist in context — and urges urgent care if bleeding is heavy or persistent. *This illustrates workflow only; not medical advice for readers.*

---

## Impact / Future Development

### Potential impact

- **Health literacy:** Teenagers and adults can ask questions in chat apps they already use, with answers tied to their own medication and vitals lists when available.
- **STEM education:** Demonstrates MCP, agent tool loops, and backend API design — skills relevant to future AI engineering careers.
- **Scalable pattern:** The same architecture could add WeChat, school nurse dashboards, or wearable sync with minimal changes to the MCP layer.

### Future work

1. **Stronger evaluation:** Create a test suite of 20–30 scripted health questions with expected “must call MCP” and “must fallback” outcomes.  
2. **Finer memory policy:** Keep Hermes `MEMORY.md` for tone/preferences only; never store diagnoses there; document doctor-only prompts in skills.  
3. **Continuous ingestion:** App and webhook updates write new vitals and chat into Firebase; MCP always pulls fresh data per message; daily cron materializes summaries.  
4. **Multilingual and accessibility:** Expand `language` options and simplify summaries for younger users.  
5. **Ethics review:** Parental consent, data retention policy, and clear UI disclaimers before any public beta.  
6. **Competition demo:** Live Telegram demo with binding flow, one health Q&A, and one dry-run daily report log.

### Alignment with CAST summit

This project fits **Track A — STEM Innovation**, combining **AI/IT** with **healthcare**, and optional **entrepreneurship** narrative (personal health assistant as a future app service). Team size 1–5 and age groups 10–14 or 15–18 are supported by a student-led implementation with adult mentorship on security and deployment.

---

## References (optional for submission)

1. Nous Research. *Hermes Agent documentation.* https://hermes-agent.nousresearch.com/docs/  
2. Anthropic. *Model Context Protocol.* https://modelcontextprotocol.io/  
3. Project repository (Hermes integration): https://github.com/JeffRen1977/hermes_ai_doctor  
4. Doctor-agent backend repository: https://github.com/JeffRen1977/ai-doctor-agent  
5. Telegram Bot API. https://core.telegram.org/bots/api  

---

## Acknowledgments

[Optional: thank teachers, parents, CAST organizers, and mentors who helped with Firebase, Telegram, and safety review.]

---

**Declaration:** This project was developed as a youth STEM innovation effort. It does not provide medical diagnosis or emergency services. Users should consult qualified healthcare professionals for medical decisions.
