# 仅使用 Hermes Telegram：个人化对话 + 每日报告

目标：**聊天走 Hermes Telegram**；**个人健康上下文**来自 doctor-agent（MCP）；**每日报告**走已有 M5 链路（Node cron → `reportService` → Telegram `sendMessage`）。

---

## 一、你需要事先搞清楚的两件事

### 1. doctor-agent 里的 `userId` 是什么

与 `contextBuilderService` / `buildAIContext` 一致，一般是 **邮箱经 sanitize 后的字符串**（仅字母数字 `@._-`，其余变 `_`），与你在 legacy 里存的 `userSettings` 文档 id 一致。

### 2. Telegram 的 `chat_id`

私聊机器人时，每个用户有一个 **数字 `chat_id`**。M5 日报推送已在 Node 侧读 **`userSettings.integrations.telegramChatId`**（见 `hermes_implementation_guide.md` §14）。

---

## 二、个人化对话（Hermes + MCP）

Hermes **不会**自动知道「这条 Telegram 消息 = 哪个 doctor-agent 用户」。必须二选一（或组合）：

### 方案 A — 单人 / 家庭内测（最快）

1. 按 `mcp-doctor-agent-bridge/README.md` 配好 MCP（`LEGACY_BACKEND_ROOT`、`MCP_ALLOWED_USER_IDS` **只写你的** `userId`）。  
2. 把 `hermes/M3_system_prompt_template.md` 拷进 Hermes 系统提示词，并把其中的占位改成你的真实 `userId`（或写死一句：「凡调用 `health_chat_guard` 时 `userId` 必须为 `xxx`」）。  
3. 确保 Hermes 已启用 MCP server `doctor-context`，且模型会 **先调 `health_chat_guard`** 再答健康题。

这样：**每条健康相关回答前**都会拉你在 doctor-agent 里的档案/用药/体征等；拉不到则降级，不瞎编。

### 方案 B — 多用户（生产向）

需要 **「Telegram `chat_id` → `userId`」** 的绑定表（存在 doctor-agent 即可），典型流程：

1. 用户在 **doctor-agent App** 里点「绑定 Telegram」，生成一次性短码。  
2. 用户在 Telegram 里把短码发给机器人；**Node webhook** `POST /internal/telegram/webhook` 写入 `userSettings.integrations.telegramChatId`（见 legacy：`telegramIntegrationService`、`internalTelegram`）。可选请求头 **`X-Telegram-Bot-Api-Secret-Token`** ↔ **`TELEGRAM_WEBHOOK_SECRET`**。  
3. Hermes 侧只做对话时：使用 MCP 工具 **`health_chat_guard_for_telegram`**，入参 **`telegramChatId`**；bridge 内调用 legacy **`userSettingsRepo.findUserIdByTelegramChatId`** 再复用与 `health_chat_guard` 相同的守卫逻辑。若配置了 **`MCP_ALLOWED_USER_IDS`**，解析出的 **`userId` 仍须在白名单内**。备选：**Telegram 先打到 Node**，Node 调 `buildAIContext` + LLM，再 `sendMessage`（Hermes 不参与医疗）。

> 结论：多用户时 **「chat_id → userId」** 由 App 短码绑定 + `integrations.telegramChatId` + MCP 反查完成；单人可继续用方案 A。

---

## 三、每日定时报告（Telegram）

与「用 Hermes 聊天」是 **两条线**，推荐这样接：

1. **doctor-agent** 已实现：`POST /internal/cron/daily-report`（Bearer + 用户列表或 `CRON_DAILY_REPORT_USER_EMAILS`）。  
2. 你的 **`userSettings`** 里已为该用户写入 **`integrations.telegramChatId`**。  
3. 配置 **`TELEGRAM_BOT_TOKEN`**（与日报发送用同一 bot 或单独 bot，按产品定）。  
4. 用 **`mcp-doctor-agent-bridge/scripts/trigger-node-daily-report.sh`** + Hermes Cron（或云 Scheduler）每天叫醒该 URL。

流程：**Cron → Node 生成报告入库 → 同一 bot 给该 `chat_id` 发摘要**。不要求 Hermes 参与生成，但若希望 Hermes 写正文，可再在 Node 里接 MCP/LLM，属于扩展。

---

## 四、最小环境变量清单（备忘）

| 位置 | 变量 / 配置 |
|------|-------------|
| Hermes | MCP server `doctor-context`；模型 provider；Telegram gateway |
| MCP bridge | `LEGACY_BACKEND_ROOT`、`MCP_ALLOWED_USER_IDS`（生产务必限制；方案 B 下须包含各用户 sanitize 后的 `userId`） |
| doctor-agent | `INTERNAL_CRON_BEARER_TOKEN`、`CRON_DAILY_REPORT_USER_EMAILS` 或请求体 `userEmails`、`TELEGRAM_BOT_TOKEN`、用户 `integrations.telegramChatId`；方案 B 另需 **`TELEGRAM_WEBHOOK_SECRET`**（与 `setWebhook` 的 `secret_token` 一致）、已登录用户调 **`POST /api/integrations/telegram/bind-code`**、Webhook **`POST /internal/telegram/webhook`** |

---

## 五、验收自测

- [ ] Telegram 发一句健康问，日志或工具链中能看出 **调用了 `health_chat_guard` 或 `health_chat_guard_for_telegram`** 且上下文与用户一致。  
- [ ] 故意改错 `userId` / 关 MCP，应 **降级**而非个体化胡编。  
- [ ] 手动 `curl` 一次 `daily-report`（或 dryRun），Telegram 能收到摘要或 dry-run 日志正确。

更多安全与审计见 **`M6_observability_circuit_mcp_audit.md`**。
