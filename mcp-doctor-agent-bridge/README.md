# MCP Doctor-Agent Bridge

This directory is a minimal runnable example: it exposes `contextBuilderService` from `ai-doctor-agent/backend` to Hermes Agent via MCP tools.

## 1) Install

```bash
cd mcp-doctor-agent-bridge
npm install
```

## 2) Environment variables

Copy `.env.example` and adjust paths for your machine:

- `LEGACY_BACKEND_ROOT`: absolute path to `ai-doctor-agent/backend` (sibling repo at `../ai-doctor-agent`)
- **`backend/.env`** in that directory is loaded automatically when MCP starts (must include Firebase `FIREBASE_API_KEY`, etc., same as running doctor-agent locally); `mcp-doctor-agent-bridge/.env` can override those variables.
- `MCP_ALLOWED_USER_IDS`: optional comma-separated allowlist of userId values
- `MCP_MAX_CONTEXT_CHARS`: truncation length for `formatContextForSystemPrompt`

## 3) Start MCP server

```bash
npm start
```

This service uses **stdio transport** and is normally started by the Hermes Agent process; it does not need a separate public port.

## 4) Tools provided

- `health_context_get`
  - Input: `{ userId, options }`
  - Output: `{ userId, payload, systemPromptContext }`
- `health_context_prompt`
  - Input: `{ userId, options }`
  - Output: `{ userId, systemPromptContext }`
- `health_chat_guard`
  - Input: `{ userId, options }`
  - Output: `{ canAnswerHealthQuestion, fallbackMessage, contextResult? }`
  - Purpose: M3 mandatory personalization guard; unified fallback when context load fails
- `health_chat_guard_for_telegram`
  - Input: `{ telegramChatId, options }` (`chat_id` must match `integrations.telegramChatId` written by the binding webhook)
  - Output: same as `health_chat_guard`, plus `resolvedUserId`, `telegramChatId`; when unbound, `canAnswerHealthQuestion=false`, `reason=telegram_not_linked`
  - Purpose: Hermes Telegram multi-user (scheme B); uses legacy `findUserIdByTelegramChatId` and binding flow
- `health_analyze_text`
  - Input: `{ userId, text, options }`
  - Output: `aiServiceFactory.analyzeHealthRecords` result
- `risk_detect_anomalies`
  - Input: `{ userEmail, dataStream, options }`
  - Output: `riskMonitoringService.detectAnomalies` result
- `report_generate`
  - Input: `{ userEmail, reportType, options }`
  - Output: `reportService` generation result (includes persisted report object)

`options` map to `buildAIContext`:

```json
{
  "medications": true,
  "vitalsRecent": true,
  "chatRecent": true,
  "language": "zh"
}
```

## 5) Hermes registration example

Register this command per Hermes MCP docs (illustrative):

```json
{
  "mcpServers": {
    "doctor-context": {
      "command": "node",
      "args": ["/Users/jeffren/Documents/hermes/mcp-doctor-agent-bridge/src/index.js"],
      "env": {
        "LEGACY_BACKEND_ROOT": "/Users/jeffren/Documents/ai-doctor-agent/backend",
        "MCP_ALLOWED_USER_IDS": "",
        "MCP_MAX_CONTEXT_CHARS": "8000"
      }
    }
  }
}
```

> Note: actual Hermes config file location and field names follow upstream documentation.

## 6) Recommended call order (conversation)

1. Call `health_chat_guard` (when `userId` is known) or `health_chat_guard_for_telegram` (Telegram `chat_id` only, scheme B)
2. If `canAnswerHealthQuestion=false`, return `fallbackMessage` only
3. If `canAnswerHealthQuestion=true`, generate the health answer
4. Call `health_analyze_text` for deeper analysis when needed
5. Call `risk_detect_anomalies` for risk-related questions

## 7) Recommended call order (daily report)

1. Call `health_context_get` for base profile
2. Call `risk_detect_anomalies` when trend analysis is needed
3. Call `report_generate` to generate and persist the report

## 8) M3 template files

- `../docs/hermes/M3_system_prompt_template.md`
- `../docs/hermes/M3_tool_call_strategy.md`

Copy these into Hermes system prompts or team instructions so the model calls `health_chat_guard` first.

## 9) M4 Skills drafts

See `../docs/hermes/skills/` (`daily-health-report`, `lab-result-extraction`), aligned with `reportModels.js` Joi `sections` shape.

## 10) M5 Cron → Node webhook (daily report → Telegram)

- **Step-by-step runbook:** `../docs/hermes/DAILY_REPORT_RUNBOOK.md`
- Architecture: `../docs/hermes/M5_cron_and_node_webhook.md`
- Trigger script: `scripts/trigger-node-daily-report.sh` (`DOCTOR_AGENT_DAILY_DRY_RUN`, `DOCTOR_AGENT_DAILY_USER_EMAILS`, etc.)
- launchd example: `scripts/launchd/io.hermes.doctor-daily-report.plist.example`
- Hermes built-in Cron (Agent + terminal runs script): `../docs/hermes/HERMES_CRON_DAILY_REPORT.md`, `scripts/register-hermes-cron-daily-report.sh`
- Backend env example: `../docs/hermes/doctor-agent-backend.env.example` (copy to `../ai-doctor-agent/backend/.env`)
- Script index: `scripts/README.md`

## 11) M6 Observability / circuit breaker / MCP audit

- Checklist: `../docs/hermes/M6_observability_circuit_mcp_audit.md`
- Implementation guide: `../docs/hermes_implementation_guide.md` §15

## 12) Hermes Telegram only: personalized chat + daily report

- Operations: `../docs/hermes/Telegram_only_personal_chat_and_daily_report.md`

## Documentation index

Full doc map: [`../docs/README.md`](../docs/README.md)
