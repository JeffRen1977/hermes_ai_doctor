# Daily health report → Telegram（实操清单）

目标：每天自动调用 **`POST /internal/cron/daily-report`**，由 **doctor-agent（Node）** 拉个人档案、生成日报摘要，并通过 **Telegram Bot API** 发到已绑定用户的 **`chat_id`**。

## 前置条件

| 项 | 说明 |
|----|------|
| 绑定 Telegram | Firestore `userSettings`（文档 id = `userId`，一般为邮箱）里存在 **`integrations.telegramChatId`**（或代码兼容的 `telegramChatId` / `messaging.telegramChatId`）。通过 App 短码 + **`POST /internal/telegram/webhook`** 绑定流程写入。 |
| Node 可访问 Firebase | `buildAIContext` 能读到该用户基础档案；否则任务会 **`no_basic_profile`** 跳过。 |
| `TELEGRAM_BOT_TOKEN` | 后端进程环境变量；用于 **`sendMessage`**。需与存了用户 `chat_id` 的机器人一致（常为 **绑定/日报 Bot**，与 Hermes 聊天 Bot 可分离）。 |
| Bearer | 调用方与后端 **`INTERNAL_CRON_BEARER_TOKEN`**（或后端 **`DOCTOR_AGENT_DAILY_WEBHOOK_TOKEN`**）一致。 |

## 1. 配置 doctor-agent（后端：Railway 或本机）

这三个变量在 **跑 Node 服务的那一侧**（Railway 服务 / 你本机 `node src/index.js` 的进程）生效，不是 Hermes 里配。

### 1A. Railway

1. 打开 [Railway Dashboard](https://railway.app/) → 选中 **doctor-agent** 对应的项目与服务（部署 `ai-doctor-agent_legacy/backend` 的那个）。
2. 进入 **Variables**（或 **Settings → Variables**）。
3. 点 **New Variable**，逐个添加（名称必须一致）：

| Variable name | 填什么 |
|---------------|--------|
| `INTERNAL_CRON_BEARER_TOKEN` | 本地生成一长串随机密钥（例如 `openssl rand -hex 32` 的输出）。**不要**和数据库密码或 Bot token 混用同一串，便于轮换。 |
| `CRON_DAILY_REPORT_USER_EMAILS` | 要跑日报的用户邮箱，逗号分隔无空格，例如 `jianfengren.sd@gmail.com`。与 Firestore `userSettings` 文档 id / `userId` 一致。 |
| `TELEGRAM_BOT_TOKEN` | 用来 **`sendMessage`** 的 Bot（@BotFather 的 API token）。用户必须曾对该 Bot 点过 Start / 有过对话；`chat_id` 来自绑定流程写入的 **`integrations.telegramChatId`**。可与 Hermes 聊天 Bot **不是**同一个 token。 |

4. **Save** 后 Railway 会 **重新部署**。等部署变绿。
5. 记下该服务的 **公网 HTTPS 根地址**，例如 `https://doctor-agent-production-xxxx.up.railway.app`（以你控制台为准）。日报地址为：

   `https://<你的根域名>/internal/cron/daily-report`

   在浏览器里直接打开会 **404**（因为是 POST）；用下面脚本或 `curl` 测即可。

### 1B. 本机 doctor-agent

1. 复制参考文件：仓库内 **`hermes/doctor-agent-backend.env.example`** → **`ai-doctor-agent_legacy/backend/.env`**（若已有 `.env` 则只追加/修改这三项）。
2. 填好 **`INTERNAL_CRON_BEARER_TOKEN`**、**`CRON_DAILY_REPORT_USER_EMAILS`**、**`TELEGRAM_BOT_TOKEN`**，以及你平时本地跑服务已有的 Firebase 等变量。
3. 启动后端（以你项目为准，例如 `npm run dev` 或 `node src/index.js`），确认本机端口例如 `http://127.0.0.1:8000`。
4. 本机测试时 **`DOCTOR_AGENT_DAILY_WEBHOOK_URL`** 应设为：

   `http://127.0.0.1:8000/internal/cron/daily-report`

   若用 **ngrok / Cloudflare Tunnel** 把本机暴露成 HTTPS，则把公网 URL 填到触发端（见 §2）。

---

## 2. 配置触发端（跑脚本的那台机器）

触发端 = 执行 **`scripts/trigger-node-daily-report.sh`** 的环境（你的 Mac、家里的树莓派、或 GitHub Actions 等）。这里的 **`DOCTOR_AGENT_DAILY_WEBHOOK_TOKEN`** 必须与后端 **`INTERNAL_CRON_BEARER_TOKEN`** **完全相同**。

### 方式 A：写在 `mcp-doctor-agent-bridge/.env`（推荐）

1. 在 **`mcp-doctor-agent-bridge/.env`**（与 **`.env.example`** 对齐）增加：

```bash
DOCTOR_AGENT_DAILY_WEBHOOK_URL=https://<你的-Railway-域名>/internal/cron/daily-report
DOCTOR_AGENT_DAILY_WEBHOOK_TOKEN=<与后端 INTERNAL_CRON_BEARER_TOKEN 相同>
# 可选：请求里显式带 userEmails（否则用后端 CRON_DAILY_REPORT_USER_EMAILS）
DOCTOR_AGENT_DAILY_USER_EMAILS=jianfengren.sd@gmail.com
```

2. **不要**把含 token 的 `.env` 提交到 git。
3. 脚本会**自动**尝试 `source` 同目录上一级的 **`mcp-doctor-agent-bridge/.env`**（与脚本相对路径固定）。若不想加载（例如在 CI 里全用 export），可设 **`DOCTOR_AGENT_SKIP_BRIDGE_ENV=1`**。

### 方式 B：只在当前终端 export

```bash
export DOCTOR_AGENT_DAILY_WEBHOOK_URL="https://<your-host>/internal/cron/daily-report"
export DOCTOR_AGENT_DAILY_WEBHOOK_TOKEN="<same-as-INTERNAL_CRON_BEARER_TOKEN>"
export DOCTOR_AGENT_DAILY_USER_EMAILS="jianfengren.sd@gmail.com"   # 可选
```

### 方式 C：launchd / crontab

把上述变量写在 **plist 的 `EnvironmentVariables`** 或 **crontab 行首**（见 §5），不要用相对路径省略脚本。

## 3. 演练（dry run）

不跑 LLM、不写库、不发 Telegram（服务端 `dryRun` 分支以当前代码为准）：

```bash
export DOCTOR_AGENT_DAILY_DRY_RUN=1
bash /Users/jeffren/Documents/hermes/mcp-doctor-agent-bridge/scripts/trigger-node-daily-report.sh
```

（请把路径改成你机器上仓库的**绝对路径**。若已把变量写进 **`mcp-doctor-agent-bridge/.env`**，只需 export `DOCTOR_AGENT_DAILY_DRY_RUN=1` 再跑脚本即可。）

期望 HTTP **200** 且 JSON 里 **`"dryRun": true`**。若 `curl` 报错 **Could not resolve host**，检查 URL；**401** 检查两端 token 是否一致。

## 4. 正式跑一遍

```bash
unset DOCTOR_AGENT_DAILY_DRY_RUN
bash /Users/jeffren/Documents/hermes/mcp-doctor-agent-bridge/scripts/trigger-node-daily-report.sh
```

检查 Telegram 是否收到摘要；后端日志中是否有 **`telegramError`**（token、chat_id、网络）。

## 5. 定时（每天 07:00 示例）

定时任务跑的是 **本机脚本绝对路径**；环境变量可在 **plist / crontab** 里写，也可依赖脚本自动 **`source`** 的 **`mcp-doctor-agent-bridge/.env`**（二选一即可，避免 plist 与 `.env` 重复维护时改漏）。

### A. macOS launchd

1. 复制 **`mcp-doctor-agent-bridge/scripts/launchd/io.hermes.doctor-daily-report.plist.example`** → **`~/Library/LaunchAgents/io.hermes.doctor-daily-report.plist`**。
2. 用文本编辑器改三处：
   - **`ProgramArguments`** 里 bash 后面的参数改成你的脚本绝对路径，例如  
     `/Users/jeffren/Documents/hermes/mcp-doctor-agent-bridge/scripts/trigger-node-daily-report.sh`
   - **`StandardOutPath` / `StandardErrorPath`** 里的 `CHANGE_ME` 改成你的用户名（或任意可写目录）。
   - **`EnvironmentVariables`**：`DOCTOR_AGENT_DAILY_WEBHOOK_URL`、`DOCTOR_AGENT_DAILY_WEBHOOK_TOKEN` 与可选 `DOCTOR_AGENT_DAILY_USER_EMAILS`。**若**你把这些已经写进 **`mcp-doctor-agent-bridge/.env`**，可从 plist 里删掉这三项，只保留脚本路径（脚本启动时会读 `.env`）。
3. 加载并启用：

```bash
launchctl load ~/Library/LaunchAgents/io.hermes.doctor-daily-report.plist
```

4. 立即试跑（不等 7:00）：

```bash
launchctl start io.hermes.doctor-daily-report
tail -20 ~/.hermes/logs/daily-report-launchd.err.log
```

### B. Linux crontab

```bash
crontab -e
```

增加一行（把 URL、TOKEN、路径换成你的；**一行内不要换行**）：

```cron
0 7 * * * DOCTOR_AGENT_DAILY_WEBHOOK_URL='https://YOUR-HOST/internal/cron/daily-report' DOCTOR_AGENT_DAILY_WEBHOOK_TOKEN='YOUR_TOKEN' /home/you/hermes/mcp-doctor-agent-bridge/scripts/trigger-node-daily-report.sh >>/home/you/.hermes/logs/daily-report-cron.log 2>&1
```

若 crontab 默认没有 `PATH`，且脚本依赖 `curl`/`python3`，可在行首加：`PATH=/usr/bin:/bin`

### C. Hermes Agent 内置 Cron

由 **Gateway** 调度：起一个带 **terminal** 的 Agent，按 prompt 执行 **`./scripts/trigger-node-daily-report.sh`**（依赖 **`mcp-doctor-agent-bridge/.env`**）。分步说明与一键命令见 **`HERMES_CRON_DAILY_REPORT.md`**；也可运行 **`scripts/register-hermes-cron-daily-report.sh`**。

若希望**不经过 LLM**、更可靠，仍推荐 **A/B**（launchd / 系统 crontab 直接 `curl` 或跑脚本）。

## 6. 单次 curl（等价于脚本）

Dry run：

```bash
curl -sS -X POST 'https://<host>/internal/cron/daily-report?dryRun=true' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <INTERNAL_CRON_BEARER_TOKEN>' \
  -d '{"userEmails":["jianfengren.sd@gmail.com"]}'
```

## 故障排查

| 现象 | 方向 |
|------|------|
| 401 | Bearer 与后端不一致。 |
| 503 Cron bearer not configured | 后端未设 `INTERNAL_CRON_BEARER_TOKEN` / `DOCTOR_AGENT_DAILY_WEBHOOK_TOKEN`。 |
| JSON：`No users to process` | 请求体无 `userEmails` 且后端 **`CRON_DAILY_REPORT_USER_EMAILS`** 为空。 |
| `no_telegram_chat_id_in_userSettings` | 未绑定；补 **`integrations.telegramChatId`**。 |
| `no_basic_profile` | 档案不全；先完善应用内基础信息。 |
| Telegram API 报错 | 检查 **`TELEGRAM_BOT_TOKEN`** 与用户是否对该 Bot 开过对话 / 未 block。 |

更多架构说明：`hermes/M5_cron_and_node_webhook.md`、`Telegram_only_personal_chat_and_daily_report.md`。
