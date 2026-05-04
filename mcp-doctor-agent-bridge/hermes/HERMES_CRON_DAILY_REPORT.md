# 用 Hermes Agent 内置 Cron 叫醒 doctor-agent 日报

Hermes 的 Cron **不会直接执行 shell**；它在 **Gateway** 里起一个**带工具的 Agent**，按你的 **prompt** 做事。这里用 **terminal** 跑已有的 **`trigger-node-daily-report.sh`**（脚本会自动 `source` **`mcp-doctor-agent-bridge/.env`**）。

官方说明：[Scheduled Tasks (Cron)](https://hermes-agent.nousresearch.com/docs/user-guide/features/cron)

## 前置条件

1. **Gateway 常驻**：`hermes gateway install` + `hermes gateway start`，或前台 `hermes gateway`。Cron 由 Gateway 每 **60 秒** tick；不跑 Gateway 则任务不会执行。可用 `hermes cron status` 检查。
2. **`mcp-doctor-agent-bridge/.env`** 已配置 **`DOCTOR_AGENT_DAILY_WEBHOOK_URL`**、**`DOCTOR_AGENT_DAILY_WEBHOOK_TOKEN`**（生产不要设 **`DOCTOR_AGENT_DAILY_DRY_RUN`**，或设为 `0`）。
3. **本机**能 `curl` 到你的 Railway（或隧道）HTTPS 地址。
4. **投递到 Telegram**：`~/.hermes/.env` 里建议已有 **`TELEGRAM_HOME_CHANNEL`**（与 [Cron 文档](https://hermes-agent.nousresearch.com/docs/user-guide/features/cron) 中 `deliver: telegram` 一致）；或用下面命令里的 **`telegram:<你的数字chat_id>`**。

## 方式 A：一条命令注册（推荐）

在**已安装 Hermes CLI** 的终端执行（把路径换成你机器上的**绝对路径**；整段 prompt 用单引号包起来）：

```bash
hermes cron create "0 7 * * *" \
'You are a scheduled job. Use the terminal tool exactly once.
Command: bash ./scripts/trigger-node-daily-report.sh
Rules: do not cd; cwd is already the project root. Do not ask the user questions.
Final reply: summarize success or paste truncated stdout/stderr (max 2000 chars).' \
  --name "Doctor daily report (Node webhook)" \
  --deliver telegram \
  --workdir "/Users/jeffren/Documents/hermes/mcp-doctor-agent-bridge"
```

- **`0 7 * * *`**：每天 **07:00**（**Gateway 所在机器的本地时区**）。可改成 `0 9 * * *` 等。
- **`--workdir`**：必须是**已存在**的目录；terminal 的 cwd 会设到这里，因此可以用 **`./scripts/...`**。
- **`--deliver telegram`**：把本轮 Agent 的**最终回复**发到 Telegram home；日报正文仍由 **Node** 经 Bot API 推送（若 webhook 成功）。

## 方式 B：仓库里的注册脚本

```bash
bash /Users/jeffren/Documents/hermes/mcp-doctor-agent-bridge/scripts/register-hermes-cron-daily-report.sh
```

默认 schedule 为 `0 7 * * *`。覆盖示例：

```bash
HERMES_CRON_SCHEDULE="0 9 * * *" \
BRIDGE_ROOT="/Users/jeffren/Documents/hermes/mcp-doctor-agent-bridge" \
bash .../register-hermes-cron-daily-report.sh
```

## 创建之后

```bash
hermes cron list
hermes cron run <job_id>    # 把 next_run 设为「现在」；Gateway 通常在 60 秒内 tick 执行
```

若要**立刻**在本机试跑一轮调度：另开终端执行 **`hermes cron tick`**（会执行所有到期任务）。输出目录：**`~/.hermes/cron/output/<job_id>/`**。

## 与 launchd / crontab 的取舍

| 方式 | 特点 |
|------|------|
| **Hermes Cron** | 依赖 Gateway + LLM 一轮；多一层失败点；适合「希望 Telegram 上还能看到 cron 执行摘要」 |
| **launchd / 系统 crontab 直接跑脚本** | 不经过模型，更稳；见 `DAILY_REPORT_RUNBOOK.md` §5 |

## Telegram 里用 `/cron`（可选）

在已连 Gateway 的 Telegram 对话中也可发（同样要设好 home / deliver），例如：

```text
/cron add 0 7 * * * Use terminal once: bash ./scripts/trigger-node-daily-report.sh from project /Users/.../mcp-doctor-agent-bridge --deliver telegram
```

具体子命令以你安装的 Hermes 版本 **`/cron help`** 为准。
