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
- **doctor-agent (legacy backend)** — an existing Node.js + Firebase application that already builds structured health context (`buildAIContext`) for each user.
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
   Firebase-backed user settings, vitals, medications, and reports. Context is built by `contextBuilderService` and formatted for the model by `formatContextForSystemPrompt`.

```
User (Telegram) → Hermes Gateway → LLM + MCP tools
                                      ↓
                         mcp-doctor-agent-bridge (stdio MCP)
                                      ↓
                         ai-doctor-agent (Node / Firebase)
```

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
3. Bridge loads legacy services, runs `buildAIContext`, checks allowlist (`MCP_ALLOWED_USER_IDS` in production).
4. If `canAnswerHealthQuestion` is **false**, the user sees only `fallbackMessage` — no fabricated diagnosis.
5. If **true**, the agent answers using `systemPromptContext` and states that the reply is based on the user’s stored profile.

### Identity and binding

- **Primary account id:** email-based `userId` (e.g., stored as Firestore `userSettings` document id).
- **Telegram:** separate binding bot writes `integrations.telegramChatId`; MCP resolves chat id → user id for multi-channel use.

### Scheduled daily reports

A **cron pipeline** triggers `POST /internal/cron/daily-report` on the backend (Bearer token). The backend:

1. Builds AI context per user.  
2. Generates a health assessment report.  
3. Sends an executive summary to Telegram via Bot API.

Hermes can also schedule a cron job that runs a shell script (`trigger-node-daily-report.sh`) to wake this endpoint daily.

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

2. **Separation of concerns:** Hermes handles conversation, tools, and scheduling; doctor-agent remains the **system of record** for health data. MCP is the narrow bridge — easier to audit than giving the LLM database credentials.

3. **Dual-channel identity:** Same backend serves CLI (known `userId`) and Telegram (chat id binding), using one MCP server with two entry tools.

4. **Composable open stack:** We integrate **open-source** Hermes Agent with an existing health backend without rewriting either system — a pattern other student teams could reuse for finance, education, or sports analytics.

5. **Operational hooks for growth:** Daily cron, report generation, and observability checklist (M6) support moving from demo to a monitored pilot.

---

## Results / Findings

During development and family testing we observed the following:

### Functional results

- **MCP integration:** Hermes successfully registered `doctor_context` MCP tools and invoked `health_chat_guard` in CLI tests, returning profile fields (name, role, location, etc.) from the backend context builder.
- **Telegram path:** After configuring Gateway, `channel_prompts`, and `SOUL.md` platform rules, the bot could answer basic profile questions when MCP was loaded; when MCP was missing or the wrong tool was used, the bot correctly reported that the health tool was unavailable instead of inventing data.
- **Account identity:** Using a stable `userId` (email document id) aligned Firestore data with MCP allowlist entries.
- **Daily report pipeline:** Backend route `/internal/cron/daily-report` implemented; trigger script and Hermes cron registration documented; dry-run supported before live send.

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
3. Project repository: https://github.com/JeffRen1977/hermes_ai_doctor  
4. Telegram Bot API. https://core.telegram.org/bots/api  

---

## Acknowledgments

[Optional: thank teachers, parents, CAST organizers, and mentors who helped with Firebase, Telegram, and safety review.]

---

**Declaration:** This project was developed as a youth STEM innovation effort. It does not provide medical diagnosis or emergency services. Users should consult qualified healthcare professionals for medical decisions.
