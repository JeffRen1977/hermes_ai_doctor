# M6 — Observability, circuit breaker, MCP audit

This page is a **checklist and implementation notes** aligned with `hermes_design_document.md` **M6** and **§8 Security**. Cover both Hermes and doctor-agent sides.

---

## 1. Observability

### 1.1 Hermes Agent (upstream)

| Check | Notes |
|-------|-------|
| Log rotation | Gateway / CLI / Cron log paths, size limits, `logrotate` or equivalent |
| Structured fields | `trace_id` / `session_id` / `tool_name` / `provider` / `model` (no full PHI) |
| Health checks | `hermes doctor`; process monitoring (systemd / Docker healthcheck) |
| Upstream docs | [Security](https://hermes-agent.nousresearch.com/docs/user-guide/security) |

### 1.2 doctor-agent (Node)

| Check | Notes |
|-------|-------|
| HTTP access logs | For `/internal/cron/*` log **caller IP, route, status, duration** — not Bearer token |
| Business metrics | Daily job: `processed` / `skipped` / `errors`; if MCP proxied through Node, log **tool call count and latency** |
| Error tracking | Sentry / OpenTelemetry (optional); **sample** to avoid PHI in events |

### 1.3 MCP Bridge (`mcp-doctor-agent-bridge`)

| Check | Notes |
|-------|-------|
| stderr logging | stdio MCP logs must go to stderr, not MCP JSON-RPC stdout |
| Per-tool metrics | Each call: `tool`, userId length or hash, **success/fail**, duration (**do not** log full `systemPromptContext` by default) |

---

## 2. Circuit breaker and fallback

### 2.1 LLM providers

| Check | Notes |
|-------|-------|
| Primary/backup models | Hermes `hermes model` fallback; switch on Gemini/OpenRouter 429/5xx |
| Timeouts | Keep doctor-agent `analyzeHealthRecords` timeouts aligned with M6 |
| Degraded copy | On MCP / `health_chat_guard` failure **forbid** individualized conclusions (M3) |

### 2.2 MCP / internal Cron

| Check | Notes |
|-------|-------|
| MCP process | After N consecutive failures → short circuit (in-process counter + cooldown) to protect doctor-agent DB |
| Cron webhook | On `POST /internal/cron/daily-report` 5xx, scheduler should **exponential backoff**; avoid infinite LLM retries |
| Rate limits | Cap cron IP/token QPS (e.g. one full batch per instance per minute) |

### 2.3 Telegram

| Check | Notes |
|-------|-------|
| Bot API 429 | Respect `retry_after`; stagger multi-user sends |
| Failure queue | Optional: retry failed messages so daily reports are not silently dropped |

---

## 3. MCP audit

### 3.1 Tool and data minimization

| Check | Notes |
|-------|-------|
| Allowlist | Production: enable `MCP_ALLOWED_USER_IDS`; block arbitrary userId enumeration |
| Action tools | Enable `risk_detect_anomalies`, `report_generate` only under **explicit** Hermes tool policy |
| Output truncation | Reasonable production cap for `MCP_MAX_CONTEXT_CHARS` (e.g. 8000–12000) |

### 3.2 Audit record (recommended fields)

Append-only per MCP tool call (or when proxied via Node):

- `ts` (ISO), `tool`, `user_id_hash`, `ok`, `duration_ms`, `error_class` (no PHI)

Storage: dedicated audit collection/table with **TTL** or periodic archive.

### 3.3 Penetration and access

| Check | Notes |
|-------|-------|
| Network isolation | `/internal/cron/*` VPC / mTLS only; **no** anonymous public access |
| Token rotation | Rotate `INTERNAL_CRON_BEARER_TOKEN` on leak |
| MCP stdio | Local Hermes only; do not expose MCP to public SSE without TLS + strong auth |

---

## 4. Acceptance checklist (M6 definition of done)

- [ ] Hermes and Node critical paths have **non-PHI** structured logs or metrics  
- [ ] LLM failures have **observable** error rates and **configurable** fallback  
- [ ] MCP tool calls have **audit summaries** (no full context dumps)  
- [ ] Cron / MCP have **rate limits or circuit breaking** to prevent cascades  
- [ ] `/internal/cron/*` **not anonymously reachable from the public internet**  
- [ ] One **staging penetration or scripted scan** (MCP + internal routes) with no critical findings, or documented remediation plan  

---

## 5. Reference links

| Topic | URL |
|-------|-----|
| Hermes Security | https://hermes-agent.nousresearch.com/docs/user-guide/security |
| Hermes MCP | https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp |
