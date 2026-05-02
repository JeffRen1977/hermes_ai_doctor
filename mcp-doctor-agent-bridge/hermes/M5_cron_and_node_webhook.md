# M5 — Hermes Cron + Node webhook (daily report → WeChat)

设计目标：**定时触发**在 **Node（doctor-agent）** 内完成「取数 → 生成 → 入库 → 微信模板/订阅消息」；Hermes Cron 只负责**可靠唤醒**与可选的自然语言提醒。

## 架构 A（推荐）：Hermes Cron → shell → Node

1. 在 doctor-agent 实现 `POST /internal/cron/daily-report`（仅内网 + Bearer 或 mTLS）。
2. 本仓库脚本：`mcp-doctor-agent-bridge/scripts/trigger-node-daily-report.sh`  
   配置 `DOCTOR_AGENT_DAILY_WEBHOOK_URL` 与 `DOCTOR_AGENT_DAILY_WEBHOOK_TOKEN`。
3. 在 Hermes 里按 [Cron 文档](https://hermes-agent.nousresearch.com/docs/user-guide/features/cron) 创建定时任务，执行该脚本（或等价 `curl` 一行）。

**Cron 表达式示例（每天 07:00，服务器本地时区）：** `0 7 * * *`

**自然语言任务示例（示意，以你本机 Hermes 版本 UI 为准）：**

> Every day at 07:00, run `/path/to/mcp-doctor-agent-bridge/scripts/trigger-node-daily-report.sh` and log success or HTTP status.

## 架构 B：Node cron only

用 `node-cron` / 云 Scheduler 直接调同一 webhook，**不经过** Hermes；Hermes 只负责对话与 MCP。适合日报与微信强耦合、不想依赖 Hermes 进程常驻的场景。

## 请求体约定（示例）

Node 可接受最小 JSON（你可扩展为批量 userId 列表）：

```json
{
  "action": "daily-report",
  "source": "hermes-cron",
  "runId": "optional-uuid"
}
```

## 微信送达

- 模板消息 / 订阅消息 **必须在 Node** 完成（持有 `access_token` 与合规字段）。
- Hermes 若走 Telegram/邮件，与微信是**并行渠道**，不要假设 Hermes 能直接发微信模板消息。

## 安全

- Webhook URL **仅内网**；Token **轮换**；日志不落 PHI 全文。
- 可选：`DOCTOR_AGENT_DAILY_PAYLOAD` 覆盖默认 JSON（脚本已支持）。
