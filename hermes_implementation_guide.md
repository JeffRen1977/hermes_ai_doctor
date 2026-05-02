# Hermes 智能医生代理 — 详细实现文档（基于开源 Hermes Agent）

**版本：** 2.0  
**关联设计：** `hermes_design_document.md`  
**遗留后端：** `ai-doctor-agent_legacy/backend`（路径以本仓库为准；该目录可能被根 `.gitignore` 忽略，变更需在对应仓库提交）  
**最后更新：** 2026-05-01  

本文档面向**实施工程师**：基于 **[NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent)** 的安装与配置，说明如何与 `ai-doctor-agent_legacy` 对接（MCP / 内网 HTTP / Cron / **Telegram** / 微信可选），**不包含**本仓库已移除的自定义 `hermes-agent/` FastAPI 服务。

**必读上游文档：** [hermes-agent.nousresearch.com/docs](https://hermes-agent.nousresearch.com/docs/)

---

## 1. 阅读顺序

| 顺序 | 章节 | 内容 |
|------|------|------|
| 1 | §2 | 前置条件与边界 |
| 2 | §3 | 安装 Hermes Agent |
| 3 | §4–§5 | 模型、网关、安全基线 |
| 4 | §6 | 与 doctor-agent 对接（MCP 优先） |
| 5 | §13 | M4：Skills 草案与 Joi 对齐 |
| 6 | §14 | M5：Cron + Node webhook（日报 / **Telegram**） |
| 7 | §15 | M6：观测、熔断、MCP 审计 |
| 8 | §7–§8 | PHP 注入、微信选项 |
| 9 | §9 | Cron 日报与 Node 回调（摘要） |
| 10 | §10 | 测试与验收 |

---

## 2. 前置条件

### 2.1 技能与工具

- 能运行上游安装脚本的环境（Linux / macOS / WSL2；**原生 Windows 不支持**，用 WSL2）。参考：[Quickstart](https://hermes-agent.nousresearch.com/docs/getting-started/quickstart)。
- Node.js 与现有 `ai-doctor-agent_legacy/backend` 运行方式不变。
- 内网连通：Agent 所在主机可访问 **doctor-agent** 的 MCP 或 HTTPS（防火墙白名单）。

### 2.2 代码边界

- **本仓库 `hermes/` 根目录**：仅存**设计与集成说明**；**不**再包含 `hermes-agent/` Python 微服务或根级 `docker-compose.yml` 编排该微服务。
- **doctor-agent**：增量添加 **MCP Server** 或 **内部路由**（如 `/internal/mcp/*` 仅绑定 localhost + 服务 token）；避免破坏现有对外 REST 契约。

### 2.3 产品强制需求（与设计 §1.2 一致）

1. 每次健康相关推理前执行 `buildAIContext(sanitizedUserId, { medications: true, chatRecent: true, vitalsRecent: true, language })`（布尔可按数据可用性微调）。  
2. 将 `formatContextForSystemPrompt` 结果或结构化 JSON 注入 Agent（工具返回、context file、或会话 system 片段）。  
3. 失败时**不**调用模型编造用户情况；返回固定中文提示并打非 PHI 日志。

---

## 3. 安装 Nous Hermes Agent

### 3.1 官方一键安装

```bash
curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash
```

安装后重载 shell，验证：

```bash
hermes doctor
```

### 3.2 贡献者/源码路径（可选）

```bash
git clone https://github.com/NousResearch/hermes-agent.git
cd hermes-agent
./setup-hermes.sh
```

详见上游 [Contributing](https://hermes-agent.nousresearch.com/docs/developer-guide/contributing)。

### 3.3 首次配置向导

```bash
hermes setup
```

按需完成 **模型供应商**、**工具**、**网关**（若使用 Telegram 等）配置。环境变量全集见上游 [Environment Variables](https://hermes-agent.nousresearch.com/docs/reference/environment-variables)。

---

## 4. 模型与推理端点

使用 TUI：

```bash
hermes model
```

在自动化环境可结合上游配置文档设置 API Key 与默认模型。自托管 OpenAI 兼容网关（vLLM/Ollama）按上游说明填入 base URL。

---

## 5. Messaging Gateway（可选第一步）

若先用 **Telegram** 验证全链路，再扩展到微信：

```bash
hermes gateway setup
hermes gateway start
```

完整说明：[Messaging Gateway](https://hermes-agent.nousresearch.com/docs/user-guide/messaging)。

---

## 6. 与 doctor-agent 对接：推荐 MCP（含可运行示例）

本仓库已提供示例目录：`mcp-doctor-agent-bridge/`。它不是新 AI 服务，而是一个 **MCP 工具桥**，直接复用 doctor-agent 现有：

- `buildAIContext`
- `formatContextForSystemPrompt`

这样 Hermes Agent 在回答前可调用工具拿到用户个体上下文，不需要维护一套重复的 `/v1/chat` 微服务协议。

### 6.1 目录与核心文件

| 文件 | 作用 |
|------|------|
| `mcp-doctor-agent-bridge/src/index.js` | MCP Server 入口（stdio transport） |
| `mcp-doctor-agent-bridge/src/doctorContextTools.js` | 封装 `health_context_get`、`health_context_prompt` |
| `mcp-doctor-agent-bridge/.env.example` | 路径、白名单、上下文截断配置 |
| `mcp-doctor-agent-bridge/README.md` | 快速启动与 Hermes 注册示例 |

### 6.2 运行步骤（本地）

1. 安装依赖：

```bash
cd mcp-doctor-agent-bridge
npm install
```

2. 复制并修改环境变量（至少改 `LEGACY_BACKEND_ROOT`）：

```bash
cp .env.example .env
```

3. 启动：

```bash
npm start
```

> 该服务是 stdio MCP，正常情况下由 Hermes 进程托管拉起，不需要对外端口。

### 6.3 MCP tools 设计（已实现）

#### Tool A: `health_context_get`

- **输入**：`{ userId, options }`
- **内部逻辑**：
  1) 校验 `userId`（可选白名单 `MCP_ALLOWED_USER_IDS`）  
  2) 调 `buildAIContext(userId, options)`  
  3) 调 `formatContextForSystemPrompt(payload, { maxChars })`
- **输出**：`{ userId, payload, systemPromptContext }`

#### Tool B: `health_context_prompt`

- **输入**：`{ userId, options }`
- **输出**：`{ userId, systemPromptContext }`
- **用途**：只需要拼 system prompt 时，减少 token 与工具返回体积。

#### Tool C: `health_analyze_text`

- **输入**：`{ userId, text, options }`
- **内部逻辑**：`aiServiceFactory.analyzeHealthRecords({ documents:[{text}] }, { provider, model })`
- **用途**：把 doctor-agent 现有「文本健康分析」能力直接作为 MCP 工具暴露给 Hermes。

#### Tool C-0: `health_chat_guard`（M3 必选）

- **输入**：`{ userId, options }`
- **输出**：`{ canAnswerHealthQuestion, fallbackMessage, contextResult? }`
- **内部逻辑**：
  1) 调 `buildAIContext` + `formatContextForSystemPrompt`  
  2) 若上下文为空或仅占位（例如 `暂无基础档案信息。`），返回 `canAnswerHealthQuestion=false`  
  3) 上下文可用时返回 `contextResult`
- **用途**：确保健康问答链路先做个人化上下文检查；失败统一降级文案。

#### Tool D: `risk_detect_anomalies`

- **输入**：`{ userEmail, dataStream, options }`
- **内部逻辑**：`riskMonitoringService.detectAnomalies(userEmail, dataStream, options)`
- **用途**：对接可穿戴/流式数据风险检测，不重复实现规则 + LLM 混合逻辑。

#### Tool E: `report_generate`

- **输入**：`{ userEmail, reportType, options }`
- **内部逻辑**：`reportService.generateHealthAssessmentReport` 或 `generateComprehensiveReport`
- **用途**：把每日报告/综合报告生成与持久化能力作为 MCP 动作工具。

### 6.4 Hermes Agent 侧接入方式

通过上游 MCP 配置把该 server 注册为本地 command（示例见 `mcp-doctor-agent-bridge/README.md`）。核心是：

- command: `node`
- args: `mcp-doctor-agent-bridge/src/index.js`
- env: 注入 `LEGACY_BACKEND_ROOT` 等变量

然后在 Persona / 指令中明确约束：

- 回答健康问题前，必须先调用 `health_chat_guard`
- 若 `canAnswerHealthQuestion=false`，直接返回 `fallbackMessage`
- 若 `canAnswerHealthQuestion=true`，优先使用 `contextResult.systemPromptContext`
- 示例模板见：`mcp-doctor-agent-bridge/hermes/M3_system_prompt_template.md` 与 `mcp-doctor-agent-bridge/hermes/M3_tool_call_strategy.md`

### 6.5 安全要求（MCP 版本）

- **本机优先**：先用 `stdio + 本机`，避免暴露网络接口。  
- **最小权限**：`MCP_ALLOWED_USER_IDS` 在测试阶段强制白名单。  
- **审计日志**：记录 `traceId/userId/toolName`，不记录完整 PHI 文本。  
- **失败降级**：工具报错时禁止生成个体化医学建议。
- **动作工具隔离**：`risk_detect_anomalies`、`report_generate` 属于有副作用工具，建议在 Hermes 工具策略里设为“显式允许后调用”（避免误触发写入/推送链路）。

### 6.6 备选：内网 HTTPS（与 MCP 并存）

若团队需给 cron 或其他后端复用，可在 Node 增加 `POST /internal/agent/context`（返回 `{ payload, systemPrompt }`）。建议：

- 对话链路优先 MCP（更贴近 Agent tooling）
- 批处理链路可用 HTTPS（更易与现有 job 系统集成）

---

## 7. PHP 注入到会话

任选一种或组合：

1. **工具调用**：模型在回答前拉取 `health_chat_guard` / `health_context_get`。在 Persona 或 AGENTS.md 中要求：回答健康问题时**必须先**拉取上下文工具。  
2. **Context Files**：对长期稳定偏好使用上游 [Context Files](https://hermes-agent.nousresearch.com/docs/user-guide/features/context-files)；**每日变化的体征**仍应以工具为准。  
3. **预处理 Webhook**：微信 → Node 已在 §8 组装好 user message + system 前缀，再转发到 Agent（取决于所选微信方案）。

---

## 8. 微信实现路径

### 8.1 HermesClaw（社区）

参考：[HermesClaw](https://github.com/AaronWong1999/hermesclaw) 与上游 README「Community」一节。部署前评估账号与合规风险。

### 8.2 官方回调 + Node 中介

1. 微信公众平台配置服务器 URL → Node。  
2. Node：`OpenID` → `userId`，`buildAIContext`，拼用户消息。  
3. 将消息送入 Agent：若 Agent 与 Node 同机，可用 **本地 HTTP** 或上游支持的 **API**（以当时版本为准）；否则用 **消息队列** 解耦。  
4. 将 Agent 回复拆条调用**客服消息接口**返回用户。

**注意：** 具体「Node → Hermes」的 HTTP API 以上游版本为准；本指南不绑定已删除的 `/v1/chat` 自定义契约。

### 8.3 仅使用 Hermes Telegram（个人化 + 日报）

若主入口是 **Telegram + Hermes**，个人化依赖 **MCP + `userId` 绑定**；日报依赖 **M5 Node cron + `integrations.telegramChatId`**。分步说明见：

- `mcp-doctor-agent-bridge/hermes/Telegram_only_personal_chat_and_daily_report.md`

---

## 9. Cron：每日报告（设计摘要）

1. 使用上游 [Cron](https://hermes-agent.nousresearch.com/docs/user-guide/features/cron) 或 **Node 自带调度** 触发每日任务。  
2. **个体化数据**仍由 Node：`buildAIContext` / `reportService`；Hermes 侧可选只负责叙事草稿（经 MCP）或完全不参与。  
3. **推送送达**：当前以 **Telegram** 为主（Node 调 Bot API 或 Hermes gateway 投递）；若上微信，模板/订阅消息仍在 Node（`access_token`）。  

**M5 落地文件（本仓库）：** 见 §14。

若希望**完全在 Node 内**跑 cron，可不用 Hermes Cron，仅用 **node-cron + 云厂商或自托管 LLM**；与「采用 Hermes Agent」不冲突——Agent 负责对话与个人助理，日报可由 Node 调度。

---

## 10. 测试与验收

### 10.1 上游自检

```bash
hermes doctor
```

### 10.2 集成测试建议

- **MCP**：Mock `buildAIContext`，断言工具返回包含 `medications` / `vitalsRecent` 字段。  
- **E2E（staging）**：测试用户发 Telegram 消息，日志中 `traceId` 与 `userId` 关联，且无完整 PHI 明文落盘。  
- **M6**：按 §15 与 `hermes/M6_observability_circuit_mcp_audit.md` 第四节验收勾选项过一遍。

### 10.3 doctor-agent 现有单测

继续运行 `ai-doctor-agent_legacy/backend` 内 Jest；`contextBuilderService` 等与 Hermes 解耦，应在不启动 Agent 时全部通过。

---

## 11. 排错清单

| 现象 | 检查 |
|------|------|
| gateway 无响应 | `hermes gateway` 日志、Token、防火墙 |
| MCP 连不上 | Node MCP 监听地址、Bearer、TLS |
| 上下文为空 | `buildAIContext` 选项、Firebase 规则、userId 映射 |
| 微信收不到 | access_token 刷新、模板字段、用户是否订阅 |

---

## 12. 参考链接汇总

| 主题 | URL |
|------|-----|
| 仓库 | https://github.com/NousResearch/hermes-agent |
| 文档首页 | https://hermes-agent.nousresearch.com/docs/ |
| MCP | https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp |
| Cron | https://hermes-agent.nousresearch.com/docs/user-guide/features/cron |
| Security | https://hermes-agent.nousresearch.com/docs/user-guide/security |
| HermesClaw | https://github.com/AaronWong1999/hermesclaw |

---

## 13. M4：Skills 草案（与 `reportModels` Joi 对齐）

本仓库在 `mcp-doctor-agent-bridge/hermes/skills/` 提供 **可拷贝** 的 Hermes Skill 草案：

| 路径 | 作用 |
|------|------|
| `hermes/skills/README.md` | 安装说明与和 doctor-agent 的对齐关系 |
| `hermes/skills/daily-health-report/SKILL.md` | 日报 / 评估报告：先 `health_chat_guard`，输出 `sections` JSON，再可选 `report_generate` |
| `hermes/skills/lab-result-extraction/SKILL.md` | 化验文本 → 严格 JSON，禁止编造数值；个体化前仍须过 `health_chat_guard` |

**Joi 对齐要点：** `sections` 的键名与 `ai-doctor-agent_legacy/backend/src/models/reportModels.js` 中 `reportSchema` 一致（`executiveSummary`、`healthMetrics`、`riskAssessment`、`recommendations`、`actionItems`、`charts`、`attachments`）。持久化前 **Node 仍须** `reportSchema.validate`。

**上游文档：** [Skills](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills)

---

## 14. M5：Cron + Node webhook（日报 → **Telegram**）

### 14.1 目标

- **定时**：每天固定时刻触发（如 `0 7 * * *`）。  
- **生成与持久化**：在 **doctor-agent** 内调用 `reportService` / `reportRepo`（与现有 Joi 一致）。  
- **Telegram**：日报摘要/链接由 **Node 调 Telegram Bot API**（`sendMessage` + 用户绑定 `chat_id`）或 **Hermes gateway** 投递；与微信二选一或并存时，以你当前产品为准（本文按 **Telegram 为主**）。  
- **微信（可选）**：若启用，Node 调用公众平台接口发模板/订阅消息；**不要**假设 Hermes 能直接代发微信模板消息。

### 14.2 推荐集成：Hermes Cron → `curl` → Node

1. **已实现（`ai-doctor-agent_legacy`）**：`POST /internal/cron/daily-report`  
   - 鉴权：`Authorization: Bearer <token>`，token 取 **`INTERNAL_CRON_BEARER_TOKEN`** 或 **`DOCTOR_AGENT_DAILY_WEBHOOK_TOKEN`**（与叫醒脚本一致）。未配置 token 时返回 **503**。  
   - 用户列表：请求体 **`{ "userEmails": ["a@b.com"] }`**，或环境变量 **`CRON_DAILY_REPORT_USER_EMAILS`**（逗号分隔）。无用户时返回 200 与说明，不抛错。  
   - 流程：`buildAIContext`（全开）→ 无基础档案则跳过 → **`reportService.generateHealthAssessmentReport`**（已含 `reportRepo` 持久化）→ **`TELEGRAM_BOT_TOKEN` + `userSettings.integrations.telegramChatId`** 发摘要；`?dryRun=true` 或 body `dryRun:true` 只演练不写库、不调 Telegram。  
   - 微信：`WECHAT_DAILY_REPORT_ENABLED=true` 时仅占位返回未实现；正式微信请另接模板消息 SDK。  
2. 本仓库叫醒脚本：`mcp-doctor-agent-bridge/scripts/trigger-node-daily-report.sh`  
   - `DOCTOR_AGENT_DAILY_WEBHOOK_URL` 指向例如 `http://127.0.0.1:8000/internal/cron/daily-report`（以 doctor-agent 实际端口为准）。  
3. Hermes Cron：按上游文档执行该脚本；说明见 `mcp-doctor-agent-bridge/hermes/M5_cron_and_node_webhook.md`。

### 14.3 备选：仅 Node cron

云 Scheduler / `node-cron` 直接 `POST` 同一 webhook，**不依赖** Hermes 进程；Hermes 只做对话与 MCP。

### 14.4 与 MCP 的关系

- 日报可在 **Node 内**直接调用 `report_generate` 等价逻辑（已是现有 service）。  
- 若希望由 Hermes 生成章节草稿，再由 Node 校验入库，可在 Node 路由内调用 MCP 工具（需自行封装进程间调用）；本仓库不强制该路径。

### 14.5 验收（M5）

- Staging：手动执行脚本一次，Node 返回 200，报告入库（或 dry-run 日志）。  
- Telegram：测试用户 `chat_id` 收到至少一条日报摘要（或记录 Bot API `message_id`）。若同时上微信，再测模板消息一条。

---

## 15. M6：观测、熔断、MCP 审计

### 15.1 文档与清单

完整检查清单见：**`mcp-doctor-agent-bridge/hermes/M6_observability_circuit_mcp_audit.md`**（Hermes + Node + MCP bridge 三侧；含验收勾选项）。

### 15.2 与本仓库组件的对应关系

| 组件 | M6 要点 |
|------|---------|
| **Hermes（上游）** | 日志/健康检查/工具策略；遵循 [Security](https://hermes-agent.nousresearch.com/docs/user-guide/security) |
| **`mcp-doctor-agent-bridge`** | stderr 日志、`MCP_ALLOWED_USER_IDS`、上下文长度截断；避免 stdout 打调试 PHI |
| **doctor-agent** | `/internal/cron/*` 仅内网；Bearer 轮换；LLM 超时与已有重试；可选 Sentry/OTel |
| **Cron 脚本** | 失败退避；勿高频触发全量日报 |

### 15.3 熔断（建议策略）

- **LLM**：主模型连续失败 → Hermes 切换备用 provider/model；doctor-agent 侧保持现有 `analyzeHealthRecordsWithRetry` 等行为。  
- **MCP**：对 `buildAIContext` 连续超时 → 短期拒绝新工具调用或返回降级（与 `health_chat_guard` 一致）。  
- **Telegram**：Bot API 429 时尊重 `retry_after`，批量发送加间隔。

### 15.4 MCP 审计（最低要求）

- 每条工具调用记录：`timestamp`、`tool_name`、**userId 哈希或长度**、`success`、`latency_ms`、错误类型；**不**默认记录 `payload` / `systemPromptContext` 全文。  
- 生产环境 **强制** `MCP_ALLOWED_USER_IDS`，直至有更强的按会话绑定 `userId` 机制。

### 15.5 渗透与安全测试

- 自测：`/internal/cron/daily-report` 无 Bearer → 401；错误 Bearer → 401；无配置 token → 503。  
- 外网扫描：确认 internal 路由不可从公网访问。  
- MCP：确认无法通过篡改参数访问未授权 `userId`（白名单开启时）。

---

*版本 2.0 删除所有针对自建 `hermes-agent/` FastAPI、`hermesService.js`、`HERMES_AGENT_URL` 微服务契约的里程碑描述；集成以开源 Hermes Agent + doctor-agent 增量为主。*
