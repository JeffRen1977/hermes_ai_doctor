# Hermes Intelligent Doctor Agent — Detailed Implementation Guide (Based on Open-Source Hermes Agent)

**Version:** 2.0  
**Related design:** `hermes_design_document.md`  
**Backend:** `../ai-doctor-agent/backend` (sibling repository; clone [JeffRen1977/ai-doctor-agent](https://github.com/JeffRen1977/ai-doctor-agent) next to this repo)  
**Last updated:** 2026-05-01  

This document is for **implementation engineers**: based on installation and configuration of **[NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent)**, it explains how to integrate with `ai-doctor-agent` (MCP / internal HTTP / Cron / **Telegram** / WeChat optional). It does **not** include the custom `hermes-agent/` FastAPI service that has been removed from this repository.

**Required upstream documentation:** [hermes-agent.nousresearch.com/docs](https://hermes-agent.nousresearch.com/docs/)

---

## 1. Reading Order

| Order | Section | Content |
|------|------|------|
| 1 | §2 | Prerequisites and boundaries |
| 2 | §3 | Install Hermes Agent |
| 3 | §4–§5 | Model, gateway, security baseline |
| 4 | §6 | Integration with doctor-agent (MCP preferred) |
| 5 | §13 | M4: Skills draft and Joi alignment |
| 6 | §14 | M5: Cron + Node webhook (daily report / **Telegram**) |
| 7 | §15 | M6: Observability, circuit breaking, MCP audit |
| 8 | §7–§8 | PHP injection, WeChat options |
| 9 | §9 | Cron daily report and Node callback (summary) |
| 10 | §10 | Testing and acceptance |

---

## 2. Prerequisites

### 2.1 Skills and Tools

- An environment capable of running the upstream install script (Linux / macOS / WSL2; **native Windows is not supported** — use WSL2). Reference: [Quickstart](https://hermes-agent.nousresearch.com/docs/getting-started/quickstart).
- Node.js and the existing `ai-doctor-agent/backend` runtime remain unchanged.
- Internal network connectivity: the host running the Agent must be able to reach doctor-agent via MCP or HTTPS (firewall allowlist).

### 2.2 Code Boundaries

- **This repository's `hermes/` root directory**: stores **design and integration documentation only**; it no longer contains the `hermes-agent/` Python microservice or a root-level `docker-compose.yml` orchestrating that microservice.
- **doctor-agent**: incrementally add an **MCP Server** or **internal routes** (e.g. `/internal/mcp/*` bound to localhost only + service token); avoid breaking existing external REST contracts.

### 2.3 Product Mandatory Requirements (consistent with design §1.2)

1. Before each health-related inference, execute `buildAIContext(sanitizedUserId, { medications: true, chatRecent: true, vitalsRecent: true, language })` (booleans may be adjusted based on data availability).  
2. Inject the result of `formatContextForSystemPrompt` or structured JSON into the Agent (tool return, context file, or session system fragment).  
3. On failure, do **not** call the model to fabricate user conditions; return a fixed Chinese prompt and log non-PHI information.

---

## 3. Install Nous Hermes Agent

### 3.1 Official One-Click Install

```bash
curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash
```

After installation, reload your shell and verify:

```bash
hermes doctor
```

### 3.2 Contributor / Source Path (Optional)

```bash
git clone https://github.com/NousResearch/hermes-agent.git
cd hermes-agent
./setup-hermes.sh
```

See upstream [Contributing](https://hermes-agent.nousresearch.com/docs/developer-guide/contributing) for details.

### 3.3 First-Time Setup Wizard

```bash
hermes setup
```

Complete **model provider**, **tools**, and **gateway** (if using Telegram, etc.) configuration as needed. See upstream [Environment Variables](https://hermes-agent.nousresearch.com/docs/reference/environment-variables) for the full set of environment variables.

---

## 4. Model and Inference Endpoints

Use the TUI:

```bash
hermes model
```

In automated environments, configure API keys and default models per upstream configuration documentation. For self-hosted OpenAI-compatible gateways (vLLM/Ollama), set the base URL per upstream instructions.

---

## 5. Messaging Gateway (Optional First Step)

If you want to validate the full pipeline with **Telegram** first, then extend to WeChat:

```bash
hermes gateway setup
hermes gateway start
```

Full documentation: [Messaging Gateway](https://hermes-agent.nousresearch.com/docs/user-guide/messaging).

---

## 6. Integration with doctor-agent: Recommended MCP (Including Runnable Example)

This repository provides an example directory: `mcp-doctor-agent-bridge/`. It is not a new AI service, but an **MCP tool bridge** that directly reuses existing doctor-agent capabilities:

- `buildAIContext`
- `formatContextForSystemPrompt`

This allows the Hermes Agent to call tools and obtain user-specific context before answering, without maintaining a duplicate `/v1/chat` microservice protocol.

### 6.1 Directory and Core Files

| File | Purpose |
|------|------|
| `mcp-doctor-agent-bridge/src/index.js` | MCP Server entry point (stdio transport) |
| `mcp-doctor-agent-bridge/src/doctorContextTools.js` | Wraps `health_context_get`, `health_context_prompt` |
| `mcp-doctor-agent-bridge/.env.example` | Path, allowlist, context truncation configuration |
| `mcp-doctor-agent-bridge/README.md` | Quick start and Hermes registration example |

### 6.2 Run Steps (Local)

1. Install dependencies:

```bash
cd mcp-doctor-agent-bridge
npm install
```

2. Copy and modify environment variables (at minimum change `LEGACY_BACKEND_ROOT`):

```bash
cp .env.example .env
```

3. Start:

```bash
npm start
```

> This service is stdio MCP; under normal circumstances it is launched and managed by the Hermes process and does not need an external port.

### 6.3 MCP Tools Design (Implemented)

#### Tool A: `health_context_get`

- **Input**: `{ userId, options }`
- **Internal logic**:
  1) Validate `userId` (optional allowlist `MCP_ALLOWED_USER_IDS`)  
  2) Call `buildAIContext(userId, options)`  
  3) Call `formatContextForSystemPrompt(payload, { maxChars })`
- **Output**: `{ userId, payload, systemPromptContext }`

#### Tool B: `health_context_prompt`

- **Input**: `{ userId, options }`
- **Output**: `{ userId, systemPromptContext }`
- **Purpose**: When only assembling the system prompt is needed, reduce token usage and tool return payload size.

#### Tool C: `health_analyze_text`

- **Input**: `{ userId, text, options }`
- **Internal logic**: `aiServiceFactory.analyzeHealthRecords({ documents:[{text}] }, { provider, model })`
- **Purpose**: Expose doctor-agent's existing "text health analysis" capability directly as an MCP tool for Hermes.

#### Tool C-0: `health_chat_guard` (M3 required)

- **Input**: `{ userId, options }`
- **Output**: `{ canAnswerHealthQuestion, fallbackMessage, contextResult? }`
- **Internal logic**:
  1) Call `buildAIContext` + `formatContextForSystemPrompt`  
  2) If context is empty or placeholder-only (e.g. backend returns `暂无基础档案信息。` / no basic profile), return `canAnswerHealthQuestion=false`  
  3) When context is available, return `contextResult`
- **Purpose**: Ensure the health Q&A pipeline performs personalized context checks first; failures use a unified fallback message.

#### Tool D: `risk_detect_anomalies`

- **Input**: `{ userEmail, dataStream, options }`
- **Internal logic**: `riskMonitoringService.detectAnomalies(userEmail, dataStream, options)`
- **Purpose**: Integrate wearable/streaming data risk detection without reimplementing rule + LLM hybrid logic.

#### Tool E: `report_generate`

- **Input**: `{ userEmail, reportType, options }`
- **Internal logic**: `reportService.generateHealthAssessmentReport` or `generateComprehensiveReport`
- **Purpose**: Expose daily report / comprehensive report generation and persistence as an MCP action tool.

### 6.4 Hermes Agent Integration

Register this server as a local command via upstream MCP configuration (see example in `mcp-doctor-agent-bridge/README.md`). The core settings are:

- command: `node`
- args: `mcp-doctor-agent-bridge/src/index.js`
- env: inject `LEGACY_BACKEND_ROOT` and other variables

Then explicitly constrain in Persona / instructions:

- Before answering health questions, must call `health_chat_guard` first
- If `canAnswerHealthQuestion=false`, return `fallbackMessage` directly
- If `canAnswerHealthQuestion=true`, prefer using `contextResult.systemPromptContext`
- Example templates: `mcp-doctor-agent-bridge/hermes/M3_system_prompt_template.md` and `mcp-doctor-agent-bridge/hermes/M3_tool_call_strategy.md`

### 6.5 Security Requirements (MCP Version)

- **Local-first**: Start with `stdio + localhost`; avoid exposing network interfaces.  
- **Least privilege**: Enforce `MCP_ALLOWED_USER_IDS` allowlist during testing.  
- **Audit logging**: Log `traceId/userId/toolName`; do not log full PHI text.  
- **Failure degradation**: When tools error, generating personalized medical advice is prohibited.
- **Action tool isolation**: `risk_detect_anomalies` and `report_generate` are side-effect tools; recommend setting them to "call only after explicit permission" in Hermes tool policy (to avoid accidental write/push pipeline triggers).

### 6.6 Alternative: Internal HTTPS (Coexists with MCP)

If the team needs reuse for cron or other backends, add `POST /internal/agent/context` on Node (returns `{ payload, systemPrompt }`). Recommendations:

- Conversation pipeline prefers MCP (closer to Agent tooling)
- Batch pipeline can use HTTPS (easier integration with existing job systems)

---

## 7. PHP (Personal Health Payload) Injection into Sessions

Choose one or combine:

1. **Tool calls**: The model fetches `health_chat_guard` / `health_context_get` before answering. In Persona or AGENTS.md, require: when answering health questions, context tools **must** be fetched first.  
2. **Context Files**: Use upstream [Context Files](https://hermes-agent.nousresearch.com/docs/user-guide/features/context-files) for long-term stable preferences; **daily-changing vitals** should still come from tools.  
3. **Preprocessing Webhook**: WeChat → Node already assembles user message + system prefix in §8, then forwards to Agent (depends on chosen WeChat approach).

---

## 8. WeChat Implementation Paths

### 8.1 HermesClaw (Community)

Reference: [HermesClaw](https://github.com/AaronWong1999/hermesclaw) and the upstream README "Community" section. Evaluate account and compliance risks before deployment.

### 8.2 Official Callback + Node Mediator

1. Configure server URL on WeChat Official Account Platform → Node.  
2. Node: `OpenID` → `userId`, `buildAIContext`, assemble user message.  
3. Send message to Agent: if Agent and Node are on the same machine, use **local HTTP** or upstream-supported **API** (per version at the time); otherwise use a **message queue** for decoupling.  
4. Split Agent reply into chunks and return to user via **customer service message API**.

**Note:** The specific "Node → Hermes" HTTP API depends on the upstream version; this guide does not bind to the deleted `/v1/chat` custom contract.

### 8.3 Hermes Telegram Only (Personalization + Daily Report)

If the primary entry point is **Telegram + Hermes**, personalization relies on **MCP + `userId` binding**; daily reports rely on **M5 Node cron + `integrations.telegramChatId`**. Step-by-step instructions:

- `mcp-doctor-agent-bridge/hermes/Telegram_only_personal_chat_and_daily_report.md`

---

## 9. Cron: Daily Report (Design Summary)

1. Use upstream [Cron](https://hermes-agent.nousresearch.com/docs/user-guide/features/cron) or **Node's own scheduler** to trigger daily tasks.  
2. **Personalized data** still comes from Node: `buildAIContext` / `reportService`; Hermes optionally only handles narrative drafts (via MCP) or does not participate at all.  
3. **Push delivery**: Currently **Telegram** is primary (Node calls Bot API or Hermes gateway for delivery); if WeChat is added, templates/subscription messages remain on Node (`access_token`).  

**M5 implementation files (this repository):** See §14.

If you want to run cron **entirely within Node**, you can skip Hermes Cron and use only **node-cron + cloud provider or self-hosted LLM**; this does not conflict with "adopting Hermes Agent" — the Agent handles conversation and personal assistant duties, while daily reports can be scheduled by Node.

---

## 10. Testing and Acceptance

### 10.1 Upstream Self-Check

```bash
hermes doctor
```

### 10.2 Integration Test Recommendations

- **MCP**: Mock `buildAIContext`, assert tool return includes `medications` / `vitalsRecent` fields.  
- **E2E (staging)**: Test user sends Telegram message, logs show `traceId` associated with `userId`, and no full PHI plaintext written to disk.  
- **M6**: Go through acceptance checklist per §15 and section 4 of `hermes/M6_observability_circuit_mcp_audit.md`.

### 10.3 Existing doctor-agent Unit Tests

Continue running Jest in `ai-doctor-agent/backend`; `contextBuilderService` etc. are decoupled from Hermes and should all pass without starting the Agent.

---

## 11. Troubleshooting Checklist

| Symptom | Check |
|------|------|
| Gateway unresponsive | `hermes gateway` logs, Token, firewall |
| MCP connection failure | Node MCP listen address, Bearer, TLS |
| Empty context | `buildAIContext` options, Firebase rules, userId mapping |
| WeChat not received | access_token refresh, template fields, whether user subscribed |

---

## 12. Reference Links Summary

| Topic | URL |
|------|-----|
| Repository | https://github.com/NousResearch/hermes-agent |
| Documentation home | https://hermes-agent.nousresearch.com/docs/ |
| MCP | https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp |
| Cron | https://hermes-agent.nousresearch.com/docs/user-guide/features/cron |
| Security | https://hermes-agent.nousresearch.com/docs/user-guide/security |
| HermesClaw | https://github.com/AaronWong1999/hermesclaw |

---

## 13. M4: Skills Draft (Aligned with `reportModels` Joi)

This repository provides **copy-ready** Hermes Skill drafts in `mcp-doctor-agent-bridge/hermes/skills/`:

| Path | Purpose |
|------|------|
| `hermes/skills/README.md` | Installation instructions and alignment with doctor-agent |
| `hermes/skills/daily-health-report/SKILL.md` | Daily report / assessment report: call `health_chat_guard` first, output `sections` JSON, then optionally `report_generate` |
| `hermes/skills/lab-result-extraction/SKILL.md` | Lab text → strict JSON, no fabricated values; personalization still requires passing `health_chat_guard` first |

**Joi alignment key points:** `sections` key names must match `reportSchema` in `ai-doctor-agent/backend/src/models/reportModels.js` (`executiveSummary`, `healthMetrics`, `riskAssessment`, `recommendations`, `actionItems`, `charts`, `attachments`). Before persistence, **Node must still** run `reportSchema.validate`.

**Upstream documentation:** [Skills](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills)

---

## 14. M5: Cron + Node Webhook (Daily Report → **Telegram**)

### 14.1 Goals

- **Schedule**: Trigger at a fixed time daily (e.g. `0 7 * * *`).  
- **Generation and persistence**: Call `reportService` / `reportRepo` within **doctor-agent** (consistent with existing Joi).  
- **Telegram**: Daily report summary/link delivered by **Node calling Telegram Bot API** (`sendMessage` + user-bound `chat_id`) or **Hermes gateway**; when choosing WeChat or running both, follow your current product (this document treats **Telegram as primary**).  
- **WeChat (optional)**: If enabled, Node calls Official Account API to send template/subscription messages; do **not** assume Hermes can directly send WeChat template messages on your behalf.

### 14.2 Recommended Integration: Hermes Cron → `curl` → Node

1. **Implemented (`ai-doctor-agent`)**: `POST /internal/cron/daily-report`  
   - Authentication: `Authorization: Bearer <token>`, token from **`INTERNAL_CRON_BEARER_TOKEN`** or **`DOCTOR_AGENT_DAILY_WEBHOOK_TOKEN`** (consistent with wake script). Returns **503** when token is not configured.  
   - User list: request body **`{ "userEmails": ["a@b.com"] }`**, or environment variable **`CRON_DAILY_REPORT_USER_EMAILS`** (comma-separated). Returns 200 with explanation when no users, no error thrown.  
   - Flow: `buildAIContext` (all enabled) → skip if no basic profile → **`reportService.generateHealthAssessmentReport`** (includes `reportRepo` persistence) → send summary via **`TELEGRAM_BOT_TOKEN` + `userSettings.integrations.telegramChatId`**; `?dryRun=true` or body `dryRun:true` runs drill only without writing to DB or calling Telegram.  
   - WeChat: when `WECHAT_DAILY_REPORT_ENABLED=true`, returns placeholder "not implemented"; for production WeChat, integrate template message SDK separately.  
2. Wake script in this repository: `mcp-doctor-agent-bridge/scripts/trigger-node-daily-report.sh`  
   - `DOCTOR_AGENT_DAILY_WEBHOOK_URL` points to e.g. `http://127.0.0.1:8000/internal/cron/daily-report` (adjust to doctor-agent's actual port).  
3. Hermes Cron: execute this script per upstream documentation; see `mcp-doctor-agent-bridge/hermes/M5_cron_and_node_webhook.md`.

### 14.3 Alternative: Node Cron Only

Cloud Scheduler / `node-cron` directly `POST`s to the same webhook, **without depending** on the Hermes process; Hermes handles conversation and MCP only.

### 14.4 Relationship with MCP

- Daily reports can call `report_generate` equivalent logic directly within **Node** (already existing service).  
- If you want Hermes to generate section drafts and Node to validate before persistence, call MCP tools within Node routes (requires custom inter-process invocation); this repository does not mandate that path.

### 14.5 Acceptance (M5)

- Staging: manually execute script once, Node returns 200, report persisted (or dry-run logged).  
- Telegram: test user `chat_id` receives at least one daily report summary (or record Bot API `message_id`). If WeChat is also enabled, test one template message.

---

## 15. M6: Observability, Circuit Breaking, MCP Audit

### 15.1 Documentation and Checklist

Full checklist: **`mcp-doctor-agent-bridge/hermes/M6_observability_circuit_mcp_audit.md`** (Hermes + Node + MCP bridge on three sides; includes acceptance checklist items).

### 15.2 Mapping to Components in This Repository

| Component | M6 Key Points |
|------|---------|
| **Hermes (upstream)** | Logging/health checks/tool policy; follow [Security](https://hermes-agent.nousresearch.com/docs/user-guide/security) |
| **`mcp-doctor-agent-bridge`** | stderr logging, `MCP_ALLOWED_USER_IDS`, context length truncation; avoid stdout debug PHI |
| **doctor-agent** | `/internal/cron/*` internal network only; Bearer rotation; LLM timeout and existing retries; optional Sentry/OTel |
| **Cron script** | Failure backoff; do not trigger full daily reports at high frequency |

### 15.3 Circuit Breaking (Recommended Strategy)

- **LLM**: Primary model consecutive failures → Hermes switches to backup provider/model; doctor-agent side maintains existing `analyzeHealthRecordsWithRetry` behavior.  
- **MCP**: Consecutive `buildAIContext` timeouts → temporarily reject new tool calls or return degradation (consistent with `health_chat_guard`).  
- **Telegram**: On Bot API 429, respect `retry_after`; add intervals for batch sends.

### 15.4 MCP Audit (Minimum Requirements)

- Log for each tool call: `timestamp`, `tool_name`, **userId hash or length**, `success`, `latency_ms`, error type; do **not** log full `payload` / `systemPromptContext` by default.  
- Production environment **must enforce** `MCP_ALLOWED_USER_IDS` until a stronger per-session `userId` binding mechanism exists.

### 15.5 Penetration and Security Testing

- Self-test: `/internal/cron/daily-report` without Bearer → 401; wrong Bearer → 401; no configured token → 503.  
- External scan: confirm internal routes are not accessible from the public internet.  
- MCP: confirm unauthorized `userId` cannot be accessed by tampering with parameters (when allowlist is enabled).

---

*Version 2.0 removes all milestone descriptions targeting the self-built `hermes-agent/` FastAPI, `hermesService.js`, and `HERMES_AGENT_URL` microservice contract; integration is primarily based on open-source Hermes Agent + incremental doctor-agent changes.*
