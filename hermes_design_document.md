# Hermes Intelligent Doctor Agent — Backend Design Document (Based on Open-Source Hermes Agent)

**Status:** v1.0 (English version, aligned with NousResearch/hermes-agent)  
**Maintainer:** TBD  
**Last Updated:** 2026-05-01  
**Scope:** Focuses primarily on **backend and data flow**; the primary user entry point may be **WeChat** (on-demand conversation + daily reports). **Orchestration and Agent runtime** use the open-source **[NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent)** (MIT); we **no longer** maintain a custom FastAPI "Hermes microservice" in this repository. The source of business truth remains the sibling repo **`../ai-doctor-agent/`** ([JeffRen1977/ai-doctor-agent](https://github.com/JeffRen1977/ai-doctor-agent); Node + Firebase, etc.).

**Official Documentation:** [hermes-agent.nousresearch.com/docs](https://hermes-agent.nousresearch.com/docs/)

---

## 1. Goals and Non-Goals

### 1.1 Problems to Solve

Under privacy and compliance constraints, use **Nous Hermes Agent** as the unified Agent runtime (multi-model, tools, memory, scheduled tasks, multi-channel gateway) to reason over and orchestrate multi-source personal health-related data; collaborate with the existing **Node backend**, which remains the **system of record** (users, profiles, medications, vitals, alerts, report persistence, WeChat OAuth and template messages), while Hermes Agent focuses on **conversation experience, skills, MCP extensions, cross-session memory, and scheduled output**.

On the user side, **WeChat** may serve as the primary channel: medical and health Q&A; boundaries for weakly related casual chat are in §9.3; **daily** report generation and push based on personal data (§5, §9.4). WeChat-side compliance and product form factor are reviewed separately during implementation.

### 1.2 Mandatory Personalization (Hard Product Requirement)

All **health-related answers** delivered to users (including WeChat conversations and proactive reports) **must** carry that user's own **PHP (Personal Health Payload)** before calling the model: basic profile, medications, recent vitals, recent conversations, etc., consistent with the existing `AIContextPayload`; later extensions may include wearables, diet, exercise, risk summaries, etc.

- **Implementation boundary**: **doctor-agent** calls `contextBuilderService.buildAIContext(userId, { … })` before each conversation or scheduled task, then injects via `formatContextForSystemPrompt` or equivalent structured fragments into Hermes **session context** (e.g., gateway message preprocessing, context files, MCP tool returns), or via read-only **MCP** queries; **do not** output individualized clinical-style conclusions on paths where personal context was not successfully assembled.
- **General education only**: If a question is not individual-specific, answer with a minimal profile attached and note that individual differences require in-person confirmation.

### 1.3 Differentiation from a "Plain LLM Wrapper" (Aligned with Upstream Capabilities)

| Capability | Meaning | Placement in This Design |
|------|------|------------------|
| **Memory** | Cross-session continuity and compression | Upstream **Memory / Honcho / session retrieval**; **authoritative medical facts and PHI primary store remain in Node**; memory inside Hermes is **auxiliary narrative and preferences**; sensitive fields do not go to third-party clouds unless reviewed. |
| **Skills** | Reusable workflows and agentskills.io | Write **Skills** for "daily report template," "risk explanation phrasing," "lab result field extraction," etc., versioned and stored; clinical rules are still validated by Node. |
| **Tools and MCP** | Invoke external capabilities | **MCP** connects to read-only tools exposed by doctor-agent (profile summary, yesterday's vitals, active medications), or internal HTTP; avoid Agent direct connection to production DB. |
| **Scheduling** | cron + multi-channel delivery | Upstream **Cron** drives "daily report" natural-language tasks, delivered to Telegram/email, etc.; **WeChat** native template messages, if needed, may use **cron callback to Node** for Node to call the WeChat API (see §9.4). |
| **Self-evolution** | Skill and workflow iteration | Iterate **Skills / prompts / tool allowlists** with usage; no commitment to online model weight changes. |

### 1.4 Non-Goals

- Do not copy or fork the entire `hermes-agent` source in this repository as a "required submodule deliverable"; focus on **upstream install + configuration + integration documentation**.
- Do not replace medical device certification; all output is auxiliary explanation, retaining emergency referral and disclaimers (reuse `emergencyService`, etc.).
- v1 does not require training a full custom model; may use OpenRouter / self-hosted vLLM / Ollama, etc. (switch via `hermes model`).

---

## 2. Terminology

| Term | Description |
|------|------|
| **Hermes Agent (upstream)** | Nous Research open-source Agent: [github.com/NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent). Includes CLI, **Messaging Gateway** (Telegram, Discord, etc.), **MCP**, **Cron**, **Skills**, multi-terminal backends. |
| **doctor-agent backend** | `../ai-doctor-agent/backend`: Express, `aiServiceFactory`, `contextBuilderService`, `AIContextPayload`. |
| **Hermes LLM** | Any upstream-supported inference endpoint (OpenRouter, self-hosted OpenAI-compatible gateway, etc.), configured via `hermes model`. |
| **PHP** | Personal Health Payload: normalized personal health context; corresponds to `AIContextPayload` and extension fields. |
| **HermesClaw** | Community WeChat bridge: [github.com/AaronWong1999/hermesclaw](https://github.com/AaronWong1999/hermesclaw) (referenced in upstream README); read its security notes for OpenClaw/Hermes same-account scenarios. |

---

## 3. Current State Analysis (`ai-doctor-agent`)

Existing capabilities directly relevant to integration:

- **Adapter pattern**: `aiServiceFactory` routes to Gemini / OpenAI and other cloud providers; **not required** to add another HTTP microservice adapter named `hermes`; instead, at the **product layer**, connect "user conversations" to the **Hermes Agent gateway**, keeping the cloud provider path as fallback or parallel channel.
- **Context building**: `contextBuilderService.js` → `AIContextPayload`; single source of truth for **MCP tools** or **Node outbound webhooks**.
- **Domain services**: `healthAnalysisService`, `riskMonitoringService`, `reportService`, `conversationService`, etc.; scheduled reports may use **cron → Node → reportService + WeChat API**, with Agent side generating report body drafts.

**Conclusion:** Two main seams—**(A) Agent gateway ↔ user** (Telegram / HermesClaw WeChat / email, etc.); **(B) Agent ↔ doctor-agent** (MCP, HTTPS internal network, or "Node pulls Agent" reverse integration—choose one or combine per deployment).

---

## 4. Overall Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  User channels (one or more)                                     │
│  Telegram / Discord / … │ WeChat: HermesClaw or official callback → Node │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  Nous Hermes Agent (separate install/process)                    │
│  `hermes` CLI · `hermes gateway` · MCP · Cron · Skills · Memory  │
│  Model: `hermes model` (OpenRouter / self-hosted / …)            │
└────────────────────────────┬────────────────────────────────────┘
                             │ MCP / HTTPS (internal network)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  doctor-agent (Node, `ai-doctor-agent/backend`)           │
│  Users, profiles, reports, notifications, WeChat access_token, template messages │
│  `buildAIContext` / `formatContextForSystemPrompt` / repositories │
└─────────────────────────────────────────────────────────────────┘
```

**Deployment recommendation:** Hermes Agent and Node in the **same VPC or peer network with mTLS**; **only Node** (or API gateway) holds Firebase/DB credentials and WeChat AppSecret; Agent reads de-identified context fragments via **MCP or restricted internal API**.

---

## 5. Multi-Source Input and "Automatic Updates"

### 5.1 Input Types

Same as the previous version: medical records, medications, daily vitals, wearable streams, rehabilitation and nutrition, etc.; ingestion uses existing repos and aggregation pipelines.

### 5.2 Trigger Mechanisms

1. **Event-driven**: After new data is written, Node-side `riskMonitoringService`, etc.; optional **webhook** to notify Agent session or write context file.
2. **Schedule-driven**: Prefer Hermes **Cron** for "generate daily report at 07:00 daily"; **delivery** (currently **Telegram**; WeChat optional) if persistence and compliance control are needed, Cron calls **Node internal task URL** (with service account JWT or mTLS), Node calls `reportService` + corresponding channel API (Telegram Bot API / WeChat template messages, etc.).
3. **User-initiated**: Gateway injects **PHP** for that message (§1.2).

---

## 6. Memory Layering

- **Authoritative state**: Node + DB.
- **Within session**: `chatRecent`, etc., still injected into each request from `contextBuilderService`.
- **Cross-session (inside Agent)**: Use upstream Memory/summary capabilities as **non-authoritative** supplement; clinical and medication changes follow Node data.

---

## 7. Mapping to Upstream Hermes Agent Capabilities (No Self-Built `/v1/chat` Microservice)

| Product requirement in this design | Upstream capability (documentation entry) |
|----------------|----------------------|
| Multi-model and provider switching | [Configuration](https://hermes-agent.nousresearch.com/docs/user-guide/configuration), `hermes model` |
| External tools and read-only in-house data | [MCP Integration](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp) |
| Daily reports and scheduled reminders | [Cron Scheduling](https://hermes-agent.nousresearch.com/docs/user-guide/features/cron) |
| Persona and long-term preferences | [Memory](https://hermes-agent.nousresearch.com/docs/user-guide/features/memory), Context Files |
| Reusable extraction/daily report logic | [Skills](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills) |
| WeChat (community solution) | [HermesClaw](https://github.com/AaronWong1999/hermesclaw); or **WeChat → Node → forward text to logged-in Agent session** (custom small service, still not in the "Hermes FastAPI microservice" category) |

---

## 8. Security and Compliance Highlights

- **Secrets**: LLM API Key, Telegram Bot Token, etc. in Agent config; **WeChat and DB** secrets only in Node.
- **MCP exposure surface**: Tools should use **least privilege** (query by userId, audit logs, rate limiting).
- **Logging**: Do not log raw PHI by default; debugging follows upstream [Security](https://hermes-agent.nousresearch.com/docs/user-guide/security) guidelines.

---

## 9. WeChat: On-Demand Q&A + Daily Reports

### 9.1 Channel Options

- **A. HermesClaw**: Bridge Hermes/OpenClaw ecosystem on the same WeChat account; assess account ban and privacy risks.
- **B. Official callback**: WeChat server → **Node** signature verification → map OpenID→userId → `buildAIContext` → pass user message and system context to **Agent** (HTTP/MQ/local pipe, chosen during implementation); reply via customer service message API.

### 9.2 Personalization

Same as §1.2: PHP required before any individualized answer; fixed fallback copy on failure.

### 9.3 Interaction Scope

Health-focused; weakly related lifestyle questions may receive brief responses with guidance back to health management; no substitute for emergency care or illegal content.

### 9.4 Daily Reports

Agent or Node cron generates body → `reportRepo` → **Telegram** summary/link (or template/subscription messages if via WeChat); long content uses summary + short-link read-only page.

---

## 10. Phased Delivery (Revised)

| Phase | Content |
|------|------|
| **M0** | Review this document; select user channel (Telegram first / WeChat approach). |
| **M1** | Deploy upstream Hermes Agent; `hermes model` working; `hermes gateway` working (any one endpoint). |
| **M2** | doctor-agent provides **MCP or internal HTTP**: `getHealthContext(userId)` wrapping `buildAIContext`. |
| **M3** | Conversation path: **gateway message → inject PHP** (tool fetch or preprocessing script). |
| **M4** | **Skills**: daily report sections, lab field extraction, etc.; align with Node Joi validation (see repo `mcp-doctor-agent-bridge/hermes/skills/`). |
| **M5** | **Cron**: daily report generation; **current delivery is Telegram** (Node Bot API or Hermes gateway); WeChat if enabled still sent by Node (examples in `mcp-doctor-agent-bridge/hermes/M5_cron_and_node_webhook.md` and `scripts/`). |
| **M6** | Observability, circuit breaking, cloud provider fallback; penetration testing and MCP audit (checklist in `mcp-doctor-agent-bridge/hermes/M6_observability_circuit_mcp_audit.md`). |

---

## 11. Acceptance Criteria (Revised)

1. Upstream `hermes doctor` has no blocking errors; gateway can send and receive messages.  
2. From test user message to reply, **MCP/injection** in the chain proves context for the corresponding `userId` was carried (automated testable with mock).  
3. When MCP is disabled or deliberately fails, **no** fabricated individualized diagnosis appears.  
4. Daily report task completes at least once end-to-end (test environment may stub **Telegram** or record Bot API success response).  
5. PHI does not appear by default in Agent persistent plaintext config or error reporting.

---

## Appendix — Legacy Code Path Quick Reference

| Capability | Path |
|------|------|
| AI factory | `ai-doctor-agent/backend/src/services/aiServiceFactory.js` |
| Context | `ai-doctor-agent/backend/src/services/contextBuilderService.js` |
| Risk monitoring | `ai-doctor-agent/backend/src/services/riskMonitoringService.js` |

---

*This document replaces the original "self-built FastAPI Hermes Agent" approach; implementation details are in `hermes_implementation_guide.md`.*
