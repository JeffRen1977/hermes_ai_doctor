# Hermes Telegram only: personalized chat + daily report

**Goal:** chat via **Hermes Telegram**; **personal health context** from doctor-agent (MCP); **daily report** via existing M5 path (Node cron → `reportService` → Telegram `sendMessage`).

---

## 1. Two things to clarify first

### 1. What is `userId` in doctor-agent?

Same as `contextBuilderService` / `buildAIContext`: usually a **sanitized email string** (only alphanumeric `@._-`, other chars become `_`), matching the `userSettings` document id in legacy.

### 2. Telegram `chat_id`

In a private chat with the bot, each user has a numeric **`chat_id`**. M5 daily push reads **`userSettings.integrations.telegramChatId`** on the Node side (see [`../hermes_implementation_guide.md`](../hermes_implementation_guide.md) §14).

---

## 2. Personalized conversation (Hermes + MCP)

Hermes **does not** automatically know “this Telegram message = which doctor-agent user.” Pick one approach (or combine):

### Scheme A — single user / family testing (fastest)

1. Configure MCP per `mcp-doctor-agent-bridge/README.md` (`LEGACY_BACKEND_ROOT`, `MCP_ALLOWED_USER_IDS` **only your** `userId`).  
2. Copy `docs/hermes/M3_system_prompt_template.md` into Hermes instructions and set your real `userId` (or hard-code: “when calling `health_chat_guard`, `userId` must be `xxx`”).  
3. Ensure Hermes enables MCP server `doctor_context` and the model **calls `health_chat_guard` first** for health questions.

Then: **before every health answer**, profile/meds/vitals are loaded from doctor-agent; on failure, degrade — do not invent data.

### Scheme B — multi-user (production-oriented)

You need a **Telegram `chat_id` → `userId`** binding (stored in doctor-agent). Typical flow:

1. User taps “Bind Telegram” in the **doctor-agent app** and gets a one-time short code.  
2. User sends the code to the bot; **Node webhook** `POST /internal/telegram/webhook` writes `userSettings.integrations.telegramChatId` (see legacy: `telegramIntegrationService`, `internalTelegram`). Optional header **`X-Telegram-Bot-Api-Secret-Token`** ↔ **`TELEGRAM_WEBHOOK_SECRET`**.  
3. Hermes conversation only: use MCP **`health_chat_guard_for_telegram`** with **`telegramChatId`**; bridge calls legacy **`userSettingsRepo.findUserIdByTelegramChatId`** then the same guard as `health_chat_guard`. If **`MCP_ALLOWED_USER_IDS`** is set, resolved **`userId` must still be on the allowlist**. Alternative: **Telegram hits Node first**, Node runs `buildAIContext` + LLM, then `sendMessage` (Hermes not involved in medical path).

> Multi-user **`chat_id → userId`** = app short-code binding + `integrations.telegramChatId` + MCP lookup; single user can stay on scheme A.

---

## 3. Daily scheduled report (Telegram)

Separate from “chat with Hermes”; recommended wiring:

1. **doctor-agent** implements `POST /internal/cron/daily-report` (Bearer + user list or `CRON_DAILY_REPORT_USER_EMAILS`).  
2. **`userSettings`** includes **`integrations.telegramChatId`** for that user.  
3. Configure **`TELEGRAM_BOT_TOKEN`** (same bot as reports or separate — product choice).  
4. Use **`mcp-doctor-agent-bridge/scripts/trigger-node-daily-report.sh`** + Hermes Cron (or cloud Scheduler) daily.

Flow: **Cron → Node generates report → same bot sends summary to `chat_id`**. Hermes need not generate the report; optional extension: Node calls MCP/LLM for body text.

---

## 4. Minimal environment variable checklist

| Location | Variables / config |
|----------|-------------------|
| Hermes | MCP server `doctor_context`; model provider; Telegram gateway |
| MCP bridge | `LEGACY_BACKEND_ROOT`, `MCP_ALLOWED_USER_IDS` (restrict in prod; scheme B must include each user’s sanitized `userId`) |
| doctor-agent | `INTERNAL_CRON_BEARER_TOKEN`, `CRON_DAILY_REPORT_USER_EMAILS` or body `userEmails`, `TELEGRAM_BOT_TOKEN`, user `integrations.telegramChatId`; scheme B also **`TELEGRAM_WEBHOOK_SECRET`** (matches `setWebhook` `secret_token`), logged-in user calls **`POST /api/integrations/telegram/bind-code`**, webhook **`POST /internal/telegram/webhook`** |

---

## 5. Self-test acceptance

- [ ] Send a health question on Telegram; logs/tool chain show **`health_chat_guard` or `health_chat_guard_for_telegram`** with context matching the user.  
- [ ] Wrong `userId` / MCP disabled → **degraded** response, not fabricated personalization.  
- [ ] Manual `curl` to `daily-report` (or dryRun); Telegram receives summary or dry-run log is correct.

See **`M6_observability_circuit_mcp_audit.md`** for security and audit.
