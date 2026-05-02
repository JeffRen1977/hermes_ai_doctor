# M5 — Hermes Cron + Node webhook（日报 → **Telegram**）

设计目标：**定时触发**在 **Node（doctor-agent）** 内完成「取数 → 生成 → 入库 → **Telegram 推送摘要/链接**」；Hermes Cron 只负责**可靠唤醒**与可选的自然语言提醒。

> 若日后改为微信模板消息，只需把 Node 内「发送」实现从 **Telegram Bot API** 换成 **微信公众平台接口**；webhook 与 Cron 触发方式不变。

## 架构 A（推荐）：Hermes Cron → shell → Node

1. 在 doctor-agent 已实现 **`POST /internal/cron/daily-report`**（Bearer；详见 `hermes_implementation_guide.md` §14）。生产环境请加 **mTLS / 内网隔离**。
2. 本仓库脚本：`mcp-doctor-agent-bridge/scripts/trigger-node-daily-report.sh`  
   配置 `DOCTOR_AGENT_DAILY_WEBHOOK_URL` 与 `DOCTOR_AGENT_DAILY_WEBHOOK_TOKEN`。
3. 在 Hermes 里按 [Cron 文档](https://hermes-agent.nousresearch.com/docs/user-guide/features/cron) 创建定时任务，执行该脚本（或等价 `curl` 一行）。

**Cron 表达式示例（每天 07:00，服务器本地时区）：** `0 7 * * *`

**自然语言任务示例（示意，以你本机 Hermes 版本 UI 为准）：**

> Every day at 07:00, run `/path/to/mcp-doctor-agent-bridge/scripts/trigger-node-daily-report.sh` and log success or HTTP status.

## 架构 B：Node cron only

用 `node-cron` / 云 Scheduler 直接调同一 webhook，**不经过** Hermes；Hermes 只负责对话与 MCP。适合日报与 **Telegram（或自有推送）** 强耦合、不想依赖 Hermes 进程常驻的场景。

## 请求体约定（示例）

Node 可接受最小 JSON（你可扩展为批量 userId 列表）：

```json
{
  "action": "daily-report",
  "source": "hermes-cron",
  "runId": "optional-uuid"
}
```

## Telegram 送达（当前默认）

任选其一（团队定一种即可）：

1. **Node 发 Telegram（常见）**  
   - Node 在完成 `reportRepo` 后，用 **BotFather 的 bot token** 调 [Telegram Bot API](https://core.telegram.org/bots/api)（如 `sendMessage`），把日报摘要发给用户已绑定的 `chat_id`。  
   - 用户绑定：`chat_id` 存 doctor-agent 用户设置或独立映射表（实施时自建）。

2. **Hermes gateway 发 Telegram**  
   - 若日报正文已由 Hermes 生成且你希望少写 Node 发送代码，可由 Hermes Cron 在生成后通过已登录的 **Messaging Gateway** 投递到 Telegram；**持久化仍建议在 Node**（避免「只在聊天里有一份」）。

## 微信（可选）

- 模板消息 / 订阅消息仍在 **Node** 完成（`access_token` 等）；与 Telegram **并行渠道**，按需切换或并存。

## 安全

- Webhook URL **仅内网**；Token **轮换**；日志不落 PHI 全文。
- 可选：`DOCTOR_AGENT_DAILY_PAYLOAD` 覆盖默认 JSON（脚本已支持）。
