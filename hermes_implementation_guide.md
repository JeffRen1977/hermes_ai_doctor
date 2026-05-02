# Hermes 智能医生代理 — 详细实现文档

**版本：** 1.2  
**关联设计：** `hermes_design_document.md`（§1.2、§5、§9 随时问答与每日报告推微信）  
**遗留后端：** `ai-doctor-agent_legacy/backend`  
**最后更新：** 2026-05-01  

本文档面向**实施工程师**：按里程碑给出目录结构、接口契约、Node 侧改动清单、环境变量、测试与验收步骤。假定读者已能独立运行 `ai-doctor-agent_legacy` 后端（含 Firebase/环境变量等既有依赖）。

---

## 1. 文档作用与阅读顺序

| 顺序 | 章节 | 内容 |
|------|------|------|
| 1 | §2 前置条件 | 技能、硬件、与现有仓库的边界 |
| 2 | §3 总体实施顺序 | M1→M6 依赖关系 |
| 3 | §4–§6 | Hermes LLM、Hermes Agent（Python）落地 |
| 4 | §7–§8 | Node：`hermesService`、`aiServiceFactory`、用户设置 |
| 5 | §9–§11 | PHP 扩展、`hermesAgentService`、领域服务挂钩 |
| 6 | §12–§14 | **每日报告推微信（12.2）**、微信入站（12.4）、安全与观测 |
| 7 | §15–§16 | 测试、验收、排错 |

---

## 2. 前置条件

### 2.1 技能与工具

- Docker / Docker Compose；内网服务发现与健康检查。
- Python 3.11+（FastAPI、httpx、Pydantic v2）；可选 LangGraph。
- Node.js（与 `ai-doctor-agent_legacy/backend/package.json` 一致）；Express、Joi、现有测试框架（Jest）。
- 至少一种 LLM 运行时：**Ollama**（开发）或 **vLLM**（生产 OpenAI 兼容 `/v1/chat/completions`）。

### 2.2 硬件参考

| 环境 | 建议 | 说明 |
|------|------|------|
| 本地开发 | Apple Silicon / CPU + Ollama，Hermes-3 8B Q4 | 延迟可放宽 |
| 小规模生产 | 单卡 24GB GPU + vLLM，8B bf16 或量化 | 与设计文档 P95 目标对齐 |

### 2.3 代码边界

- **不改**现有对外 REST 契约（除非单独评审新增 `/internal/*` 或微信回调路由）。
- **增量**：新文件 + 工厂注册 + 可选 feature flag；默认关闭 Hermes 时行为与当前一致。

### 2.4 产品强制需求（与设计文档 §1.2、§9 一致）

1. **微信随时问答**：用户在微信中**随时**发起多轮消息（以医疗与健康为核心，弱相关生活问题见设计 §9.3）；Node 微信回调将 **OpenID → userId** 后，走与 `routes/chat.js` 等价的链路（落库用户消息 → 组装上下文 → `healthChat` → 客服消息等回写）。
2. **必须基于个人信息推理**：每次调用 LLM 前**必须**执行 `contextBuilderService.buildAIContext(sanitizedUserId, { medications: true, chatRecent: true, vitalsRecent: true, language })`（具体布尔开关可按数据可用性微调，但**不得**在「零个人上下文」下输出个体化医学建议）。`formatContextForSystemPrompt` 的结果作为 `context` 传入 `hermesService.healthChat` → Hermes `/v1/chat`。
3. **每日个人报告推微信**：定时任务（如每日 07:00）为开启开关的用户组装**全量维度**上下文，调用 `hermesAgentService` → `/v1/report/daily`，持久化后向用户微信发模板/订阅消息（摘要 + 可选链接）；详见 §12.2、§12.5。
4. **失败降级**：若 `buildAIContext` 抛错或仅返回空档案，**不**调用 Hermes 编造用户情况；返回固定中文提示（如请完善档案或稍后重试），并打日志（不含 PHI）。
5. **Hermes Agent**：生产环境建议 `REQUIRE_NON_EMPTY_CONTEXT=true`：`context` 与可选 `payload` 均为空时直接 `400`，防止误配置导致「泛泛回答」上线。

---

## 3. 总体实施顺序（里程碑依赖）

```
M1 Hermes Agent 骨架 + LLM 运行时（可独立 curl 通）
        ↓
M2 hermesService.js + aiServiceFactory + checkAvailableServices + 用户可选 provider=hermes
        ↓
M3 contextBuilderService 扩展 PHP + Hermes /v1/analyze/* 与 Pydantic 对齐
        ↓
M4 hermesAgentService.js + USE_HERMES_AGENT + 先接 rehabilitationAssistantService
        ↓
M5 Node internal/context/*（可选）+ Hermes 缓存失效 webhook（可选）
        ↓
M6 /v1/report/* + cron + 微信模板消息 + Prometheus/Grafana + 熔断
```

---

## 4. Hermes LLM 运行时实现要点

### 4.1 Ollama（推荐用于 M1）

1. 使用官方镜像或本机安装 Ollama。
2. 拉取 Nous Hermes 系列中与你硬件匹配的 tag（以 Ollama Library 为准，例如 `hermes-3` 等；名称随社区更新，**以实际 `ollama list` 为准**）。
3. 确认 OpenAI 兼容地址：通常为 `http://<host>:11434/v1`，与 OpenAI SDK 的 `base_url` 一致。

### 4.2 vLLM（生产）

1. 使用 `vllm/vllm-openai` 或团队镜像；挂载模型权重路径。
2. 默认 OpenAI 兼容端口常为 `8000`；在 Hermes Agent 的 `HERMES_LLM_BASE_URL` 指向 `http://hermes-llm:8000/v1`（注意是否带 `/v1` 与客户端拼接方式一致）。

### 4.3 验证命令（与 Agent 解耦）

在 Hermes Agent 未就绪前，可直接对 LLM 网关发 `curl`：

```bash
curl -s "${HERMES_LLM_BASE_URL}/chat/completions" \
  -H "Content-Type: application/json" \
  -d '{"model":"'"${HERMES_MODEL}"'","messages":[{"role":"user","content":"ping"}],"max_tokens":16}'
```

（若使用 Ollama OpenAI 兼容层，路径以官方文档为准。）

---

## 5. Hermes Agent（Python / FastAPI）实现结构

### 5.1 建议仓库位置

在 Hermes 仓库根目录创建 **`hermes-agent/`**（与设计文档一致），与 `ai-doctor-agent_legacy` 并列，便于根目录单一 `docker-compose.yml` 编排。

### 5.2 最小 `pyproject.toml` 依赖（示例）

- `fastapi`, `uvicorn[standard]`
- `httpx`
- `pydantic-settings`
- `openai`（官方 SDK，仅作兼容客户端指向自托管 base_url）

可选：`langgraph`, `prometheus-client`, `structlog`。

### 5.3 `app/config.py`（环境变量）

| 变量 | 必填 | 说明 |
|------|------|------|
| `HERMES_LLM_BASE_URL` | 是 | 如 `http://hermes-llm:11434/v1` |
| `HERMES_MODEL` | 是 | 与运行时模型名一致 |
| `INTERNAL_TOKEN` | 是 | 与 Node 的 `HERMES_AGENT_TOKEN` 一致 |
| `DOCTOR_AGENT_BASE_URL` | 否 | M5 Pull 模式再启用 |
| `DEBUG_PROMPTS` | 否 | `1` 时允许打全量 prompt（仅开发） |

### 5.4 全局中间件：鉴权

对所有 `/v1/*`（除 `/v1/health` 外按策略决定）校验：

```http
X-Internal-Token: <与 Node 约定的一致密钥>
```

未匹配返回 `401`，body JSON `{ "detail": "unauthorized" }`。

### 5.5 `GET /v1/health`

- 不调用 LLM；返回 `200` + `{ "status": "ok" }`。
- 供 Compose `healthcheck` 与 Node `isServiceAvailable` 探测。

### 5.6 `GET /v1/ready`

- 可选：对 LLM 发极小 `max_tokens` 请求或 TCP 探测；失败返回 `503`。
- 避免每次轻量 health 都打满推理。

### 5.7 `POST /v1/chat`（M1 核心）

**请求体（JSON）**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `userId` | string | 建议 | 日志关联；禁止在 info 级日志打印 PHI |
| `message` | string | 是 | 用户本轮问题 |
| `language` | `"zh"` \| `"en"` | 否 | 默认 `zh` |
| `context` | string | 否（生产视为是） | **必须由 Node 注入**：`formatContextForSystemPrompt` 输出；置于 system 或等价高优先级；见 §2.4。若开启 `REQUIRE_NON_EMPTY_CONTEXT`，空字符串拒绝请求 |
| `payload` | object | 否 | 可选：结构化 PHP（M3），便于引用与引用校验 |
| `options` | object | 否 | `model`, `temperature`, `maxTokens`, `stream` |
| `traceId` | string | 否 | 透传 OpenTelemetry / 日志 |

**非流式响应（与 Node 适配器对齐）**

遗留代码中 `healthChat` 消费字段主要为 **`aiResult.message`**（见 `routes/chat.js`、`rehabilitationAssistantService.js`；部分路径使用 `aiResult.message ?? aiResult.text ?? aiResult.analysis`）。

Hermes Agent 建议统一返回：

```json
{
  "success": true,
  "message": "……模型回复正文……",
  "model": "hermes-3-8b",
  "processingTimeMs": 842,
  "traceId": "uuid",
  "citations": []
}
```

失败：

```json
{ "success": false, "error": "readable message", "code": "optional" }
```

**流式（SSE，可选 M2+）**

- `text/event-stream`；首条可发 `event: meta`，`data: {"model":"..."}`。
- 末条或独立 `event: done` 携带 `citations`、`usedContext`。
- Node 侧 `chat.js` 当前为**非流式** JSON；若要保持不改路由，流式可作为后续优化，适配器先实现 `stream: false`。

### 5.8 其它 `/v1/*` 端点（按设计文档分期实现）

实现顺序建议：

1. M3：`POST /v1/analyze/records`、`/diet`、`/symptoms`、`/drug-interactions`（请求体携带 `healthData` 或与现有 adapter 一致的字段映射）。
2. M4：`POST /v1/coach/rehab`、`/plan/intervention`、`/monitor/risk`、`/twin/update`（输入输出用 Pydantic 模型 + JSON Schema 导出供 Node 校验）。
3. M6：`POST /v1/report/daily`、`/v1/report/weekly`。

每个端点在实现文档中应维护**与 `aiServiceFactory` 方法**的映射表（见 §13）。

---

## 6. Docker Compose（根目录）实施说明

### 6.1 服务列表

| 服务名 | 说明 |
|--------|------|
| `hermes-llm` | Ollama 或 vLLM；不对外网暴露推理端口（仅内网） |
| `hermes-agent` | 本仓库构建的 FastAPI 镜像 |
| `doctor-agent` | 可选：引用现有 legacy 的 Dockerfile；或本地 `npm run dev` 仅连 Agent |

### 6.2 网络

- 自定义 bridge：`hermes_net`。
- `hermes-llm`、`hermes-agent`、Node 应用在同一网络，通过服务名 DNS 互访。

### 6.3 密钥

- 使用 `.env` 或 Docker secrets 注入 `INTERNAL_TOKEN` / `HERMES_AGENT_TOKEN`，**勿**提交到 Git。

---

## 7. Node：`hermesService.js` 实现细则

### 7.1 文件路径

`ai-doctor-agent_legacy/backend/src/services/adapters/hermesService.js`

### 7.2 可用性：`isServiceAvailable()`

推荐逻辑：

1. 若未设置 `process.env.HERMES_AGENT_URL`，返回 `false`。
2. 对 `${HERMES_AGENT_URL}/v1/health` 发 `GET`，超时 2s；`200` 则 `true`。
3. 结果**缓存 30s**（内存模块级变量），避免每次请求都打 Agent。

### 7.3 `getAvailableModels()`

返回与设计一致的模型列表，例如：

```js
{ text: [process.env.HERMES_DEFAULT_MODEL || 'hermes-3-8b'], all: [...] }
```

### 7.4 HTTP 客户端

- 使用 `axios` 或 `fetch`（Node 18+）；统一 `timeout`（如 chat 60s，analyze 120s）。
- 统一设置 header：`X-Internal-Token: process.env.HERMES_AGENT_TOKEN`。

### 7.5 `healthChat(message, context, options)`

1. `POST ${HERMES_AGENT_URL}/v1/chat`，body 含 `message`, `context`, `language: options.language`, `options.model` 等。
2. 将 Agent 返回映射为：

```js
return { success: true, message: data.message, model: data.model, provider: 'hermes' };
```

3. 若 Agent 返回 `success: false`，原样 `{ success: false, error: data.error }`。

**注意：** `openaiService.healthChat` 成功时字段名为 `message`；`hermesService` 必须与之一致，否则 `chat.js` 中 `aiResult.message` 为 `undefined`。

### 7.6 `analyzeHealthRecords(healthData, options)`

- 将现有 `healthData`（含 `documents` 数组等）序列化为 Agent 期望的 body。
- Agent 返回的文本分析放入 `analysis` 键，以匹配 `reportService`、`digitalTwinService` 等。

### 7.7 PDF / 图像类方法

设计原则：**解析与 OCR 仍在 Node / 现有 Gemini 路径完成也可**；M2 可让 Hermes 仅承接「纯文本已抽出后的 `analyzeHealthRecords`」。

若要在 Hermes 上实现 `analyzePDFDocument` / `extractTextFromImage`：

- 要么 Agent 内嵌多模态（依赖 Hermes 权重是否多模态与运行时支持）；
- 要么先调用云适配器抽文本，再送 Hermes 分析（混合 pipeline，需在代码注释中写清）。

**最小策略（推荐）：** `hermesService.analyzePDFDocument` 返回 `{ success: false, error: 'Use gemini for PDF extraction in v1' }`，或在 factory 层对 hermes 自动 fallback（增加复杂度，需单独评审）。

### 7.8 可选方法

与 `aiServiceFactory` 一致实现：`analyzeDiet`、`analyzeSymptoms`、`checkDrugInteractions`、`analyzeImageWithAI`（能力取决于 Agent 是否实现对应路由）。

---

## 8. 修改 `aiServiceFactory.js`

### 8.1 注册适配器

```js
const hermesService = require('./adapters/hermesService');
// ...
this.adapters = {
  gemini: geminiService,
  openai: openaiService,
  ernie: ernieService,
  qwen: qwenService,
  hermes: hermesService
};
```

### 8.2 `checkAvailableServices()` 增加 hermes 分支

仿照 Gemini：若 `hermesService.isServiceAvailable()` 为 true，则 `available.hermes = { name: 'Hermes (自托管)', models: [...], provider: 'hermes' }`。

### 8.3 `DEFAULT_MODEL_BY_PROVIDER`（可选）

在 `ai-doctor-agent_legacy/backend/src/config/aiProviderConfig.js` 中增加：

```js
hermes: process.env.HERMES_DEFAULT_MODEL || 'hermes-3-8b'
```

便于 `getDefaultModel('hermes')` 有返回值。

### 8.4 用户设置 UI / API

- `userSettingsService` 已支持 `aiProvider` 字符串；前端或管理接口需允许选择 `hermes`（若当前 Joi 校验限制 provider 列表，需**扩展白名单**）。
- `routes/chat.js` 已从 `getUserAISettings` 读取 `userProvider` 并传入 `healthChat`，**无需改调用方式**，只要 factory 识别 `hermes` 即可。

---

## 9. PHP / `AIContextPayload` 扩展（M3）

### 9.1 Node：`models/aiContextPayload.js`

1. 用 Joi 增加可选字段，例如：

   - `wearableSnapshot`（object，含日期范围、摘要字符串）
   - `dietRecent`（string 或结构化子 schema）
   - `exerciseRecent`（string 或 object）
   - `riskFlags`（array of `{ code, severity, summary }`）

2. 保持 `stripUnknown: true` 以便旧客户端兼容。

### 9.2 Node：`contextBuilderService.js`

1. 新增并行查询：`userWearablesRepo`、`vitalsDailyRepo`（多日窗口）、`nutritionAnalysisRepo`、`exercisePlanRepo`、`riskAlertRepo` 等（按产品优先级取舍）。
2. 在 `formatContextForSystemPrompt` 中为每块增加与现有风格一致的中文标题（如 `[可穿戴摘要]`）。

### 9.3 Hermes Agent：`app/context/schemas.py`

- 用 Pydantic 定义与 Joi **字段语义一致**的模型；接收 Node 发来的 JSON `payload`（整包 PHP），避免重复实现拉数逻辑（Push 模式）。

---

## 10. `hermesAgentService.js`（M4）

### 10.1 文件路径

`ai-doctor-agent_legacy/backend/src/services/hermesAgentService.js`

### 10.2 职责

封装对 Hermes Agent **高阶端点**的 HTTP 调用，返回**已解析的 JSON** 或抛出可捕获错误；**不**经过 `aiServiceFactory.getService`，避免与单轮 adapter 混淆。

### 10.3 建议导出方法

| 方法 | HTTP | 调用方（示例） |
|------|------|----------------|
| `planIntervention(userId, body)` | `POST /v1/plan/intervention` | `interventionEngineService` |
| `coachRehab(userId, body)` | `POST /v1/coach/rehab` | `rehabilitationAssistantService` |
| `monitorRisk(userId, body)` | `POST /v1/monitor/risk` | `riskMonitoringService` |
| `updateTwin(userId, body)` | `POST /v1/twin/update` | `digitalTwinService` |

### 10.4 Feature flag

```js
const useHermesAgent = process.env.USE_HERMES_AGENT === 'true';
```

在每个领域服务**函数开头**：若 `useHermesAgent` 且 `hermesService.isServiceAvailable()`，走 `hermesAgentService`；否则保持现有 `aiServiceFactory.*` 路径。

### 10.5 首推改造点：`rehabilitationAssistantService.explainClinicalMetrics`

- 将 `buildMetricsExplanationPrompt` 的输出作为 Agent body 的 `instruction` 或 `messages` 之一；`metrics` 原样 JSON 传入。
- 成功后仍写入 `rehabilitationRecordRepo`，`aiProvider` 记为 `hermes`，`aiModel` 取响应中的 model。

---

## 11. `riskMonitoringService` 与 Hermes（设计级挂钩）

现有服务已包含规则阈值、采样点数（`MAX_DATA_POINTS_FOR_PROMPT`）、节流（`AUTO_DETECT_THROTTLE_MS`）等。集成时建议：

1. **仅在**规则引擎或初筛已标记「需叙事」或置信度边界案例时调用 Hermes `/v1/monitor/risk`，控制成本。
2. 请求体包含：时间范围、`dataPoints` 摘要（非全量原始点若可）、用户用药与基础病来自 PHP。
3. 将 Hermes 返回的 `severity`、`rationale` 映射写入 `riskAlertRepo` 的扩展字段或 `analysis` 子文档（需与现有 schema 对齐，必要时 migration 在 Firebase 层由团队流程处理）。

---

## 12. 定时报告与主动推送（M6）

### 12.1 Cron 位置

任选其一：

- Node 进程内 `node-cron`（简单）；
- 系统 crud + `curl` 调内部脚本；
- 独立 worker 容器调用 Node 的**内部**路由（需鉴权）。

### 12.2 每日报告生成与推微信（核心流程）

1. **Cron**（如 `0 7 * * *` 北京时间，可配置 `DAILY_REPORT_CRON`）触发 `dailyReportJob`（新建模块，例如 `jobs/dailyWechatReport.js`）。
2. **用户筛选**：已绑定微信 OpenID、且 `userSettings` 中 **`dailyWechatReport: true`**（或等价字段，默认 true 需在 PR 中说明）的用户列表；注意分页与并发上限。
3. **上下文（须不少于聊天核心维度）**：对每个用户 `buildAIContext` 打开 M3 后全部扩展位，或实现 `buildDailyReportContext(userId)` 显式拉取：基础档案、用药、多日 `vitalsDaily`、可穿戴聚合摘要、`riskAlertRepo` 未关闭条目、`chatSessionRepo` 昨日摘要（可选）等。
4. **调用 Hermes**：`POST /v1/report/daily`，body 含 `userId`、`language`、`period`、`payload`（PHP JSON）、`traceId`。
5. **持久化**：`reportService` 或直连 `reportRepo` 保存，`reportType: 'daily-wechat'`（与设计文档一致），`sections` 与 Hermes 返回对齐。
6. **推送微信**：取该用户 `wechatBinding.openId` → 调模板/订阅消息 API，**keyword 数据**填日报标题 + 1～2 句摘要；若需全文，第二条发短链或拆条（遵守微信长度与频次）。
7. **失败**：Hermes 失败写 `notificationRepo` 或日志告警，**不**静默跳过；可对单用户重试 1 次。

### 12.3 微信模板消息（概要）

1. 在 Node 增加配置：`WECHAT_APP_ID`、`WECHAT_APP_SECRET`、模板 ID 等。
2. 实现 `access_token` 内存缓存与过期刷新。
3. 报告完成后异步发模板消息；失败重试队列（可选 Redis / 云任务）。

具体加解密、域名备案、类目资质按微信官方文档执行，**不在此重复**。

### 12.4 微信入站：对话式询问与个人上下文（实施清单）

与 `hermes_design_document.md` §9 对齐，建议新增路由模块（示例：`routes/wechat.js` + `services/wechatInboundService.js`），职责如下。

| 步骤 | 实现要点 |
|------|----------|
| 1. 验签 | 按微信公众平台文档校验 `signature`、`timestamp`、`nonce`；加密模式则解密消息体。 |
| 2. 解析消息 | `text` 取 `Content`；`image` 可先下载媒体再转已有图像分析流程，**分析前仍须**绑定 userId 并带 PHP。 |
| 3. 身份 | 从消息中的 `FromUserName`（OpenID）查映射表得到内部 `userEmail` / `userId`；未绑定则回复引导关注/OAuth 绑定链接，**不调 LLM**。 |
| 4. 个人上下文 | `sanitizeUserId` 后与 `chat.js` 一致：`buildAIContext(..., { medications: true, chatRecent: true, vitalsRecent: true, language: 'zh' })` → `formatContextForSystemPrompt`。 |
| 5. 推理 | `aiServiceFactory.healthChat(text, chatContext, { provider, model, language })`；`provider` 来自用户设置或环境默认 `hermes`。 |
| 6. 出站 | 将 `aiResult.message` 截断为微信允许长度，必要时拆多条 **客服消息**（注意 48 小时窗口与频次限制）。 |
| 7. 会话续写 | 用户消息与助手回复写入 `chatSessionRepo`（或与微信 `session` 对齐的键），保证下一轮 `chatRecent` 可用。 |

**集成测试建议**：Mock 微信 XML/JSON 请求体，固定 OpenID 映射到测试用户，断言发往 Hermes Agent 的 HTTP body 中 `context` 字段非空且包含 `[基础档案]` 等格式塔片段（与 `formatContextForSystemPrompt` 一致）。

### 12.5 用户设置与数据模型（建议）

- 在 `userSettingsRepo` 增加字段：`notifications.dailyWechatReport`（boolean）、可选 `notifications.dailyReportHour`（0–23）。
- 新增 **`wechatUserBinding`**（集合或表）：`openId`、`unionId`、`userId`、`boundAt`，供 12.4 入站与 12.2 日报推送共用。

---

## 13. 端点 ↔ `aiServiceFactory` 方法 ↔ 领域服务 映射

| Hermes Agent 端点 | Factory 方法 | 主要调用文件（遗留） |
|-------------------|--------------|----------------------|
| `/v1/chat` | `healthChat` | `routes/chat.js`, `rehabilitationAssistantService.js`, `interventionEngineService.js` |
| `/v1/analyze/records` | `analyzeHealthRecords` | `healthAnalysisService.js`, `digitalTwinService.js`, `riskMonitoringService.js`, `reportService.js` |
| `/v1/analyze/diet` | `analyzeDiet` | `healthAnalysisService.js`（若存在） |
| `/v1/analyze/symptoms` | `analyzeSymptoms` | `interventionEngineService.js` |
| `/v1/analyze/drug-interactions` | `checkDrugInteractions` | `interventionEngineService.js` |
| `/v1/coach/rehab` | （不经 factory，经 `hermesAgentService`） | `rehabilitationAssistantService.js` |
| `/v1/plan/intervention` | `hermesAgentService` | `interventionEngineService.js` |
| `/v1/monitor/risk` | `hermesAgentService` | `riskMonitoringService.js` |
| `/v1/twin/update` | `hermesAgentService` | `digitalTwinService.js` |
| `/v1/report/*` | `hermesAgentService` 或 `analyzeHealthRecords` | `reportService.js` |

---

## 14. 安全与合规实现清单

| 项 | 实现要点 |
|----|----------|
| 服务间认证 | 仅内网 + `X-Internal-Token`；生产轮换密钥 |
| 日志 | 默认不记录 `context` / `payload` 全文；仅长度、userId hash、traceId |
| 急诊话术 | Agent system prompt 要求遇急症提示就医；Node 侧保留 `emergencyService` 触发条件 |
| 出站流量 | Hermes Agent 默认禁止任意公网回调；工具仅限内网白名单 |
| RAG（若做） | 按 userId 命名空间隔离；删除用户时同步删索引 |
| 个人化强制 | 微信与 API 聊天共用「先 buildAIContext 再 healthChat」；代码审查禁止绕过 |

---

## 15. 测试计划

### 15.1 单元测试

- `hermesService.js`：mock `axios`，断言 URL、header、`message` 映射。
- `aiServiceFactory.test.js`：增加 `hermes` adapter 存在性用例（与现有 gemini mock 模式一致）。

### 15.2 集成测试（需运行 Agent + LLM）

1. Compose 启动 `hermes-llm` + `hermes-agent`。
2. Node 设置 `HERMES_AGENT_URL`、`HERMES_AGENT_TOKEN`。
3. 调用 `POST /api/chat/send`（或等价路由），用户设置 `aiProvider: hermes`，断言 200 与非空 `message`。
4. **个人上下文**：对 Hermes Agent 使用 mock 时，断言请求体中 `context` 长度大于阈值（例如 ≥ 50）且含 `基础档案` 或英文等价片段；`buildAIContext` 失败时应 **不** 出现正常 `message` 体（应为错误提示）。

### 15.3 微信入站（可选）

在 12.4 路由就绪后，用沙箱或 fixture 模拟一条文本消息，断言全链路调用一次 `healthChat` 且 `context` 非空。

### 15.4 回归

- `provider: gemini`（或当前默认）路径与改造前完全一致。

---

## 16. 验收检查表（对齐设计文档 §13）

- [ ] Compose 健康检查：`hermes-llm`、`hermes-agent` 均为 healthy。
- [ ] `POST /v1/chat` 最小请求成功，`message` 非空。
- [ ] Node 用户 `aiProvider=hermes` 时聊天成功。
- [ ] `USE_HERMES_AGENT=true` 时康复指标解读走 Agent 且落库字段正确。
- [ ] 关闭 Hermes URL 或 token 错误时，服务降级或清晰错误，不崩溃。
- [ ] 生产日志级别下无完整 PHI。
- [ ] **个人化**：`healthChat` 调用前始终执行 `buildAIContext`；故意使上下文失败时不返回虚构个体化建议。
- [ ] **微信**（若已实施 12.4）：文本消息经 OpenID 映射后走上述同一链路，且助手回复写回 `chatSessionRepo`（或等价存储）。
- [ ] **每日日报**：Cron 触发后，对测试用户生成 `daily-wechat` 报告记录并成功调用一次微信发送接口（或 mock）。

---

## 17. 故障排查

| 现象 | 排查 |
|------|------|
| `hermes` 不在 available 列表 | `HERMES_AGENT_URL`、防火墙、Agent `/v1/health` |
| chat 返回空 | Agent 返回字段是否为 `message`；Node 映射错误 |
| 超时 | 增大 timeout；检查 GPU OOM；减少 `maxTokens` |
| 中文质量差 | 换更大模型或临时 fallback `gemini`；检查 `language` 是否传入 |

---

## 18. 附录：环境变量汇总

### Node（`ai-doctor-agent_legacy/backend`）

| 变量 | 说明 |
|------|------|
| `HERMES_AGENT_URL` | 如 `http://127.0.0.1:8100` 或 `http://hermes-agent:8100` |
| `HERMES_AGENT_TOKEN` | 与 Agent `INTERNAL_TOKEN` 一致 |
| `HERMES_DEFAULT_MODEL` | 可选；默认模型名 |
| `USE_HERMES_AGENT` | `true` / `false` |
| `DAILY_REPORT_CRON` | 可选；默认 `0 7 * * *` |
| `WECHAT_DAILY_TEMPLATE_ID` | 日报模板 ID（与公众平台配置一致） |

### Hermes Agent

| 变量 | 说明 |
|------|------|
| `HERMES_LLM_BASE_URL` | OpenAI 兼容 API 根 |
| `HERMES_MODEL` | 模型 id |
| `INTERNAL_TOKEN` | 与 Node 一致 |
| `REQUIRE_NON_EMPTY_CONTEXT` | 可选 `true`：`/v1/chat` 在 `context` 与 `payload` 皆空时返回 `400` |

---

*实施过程中若与设计文档冲突，以本实现文档的「接口契约 + 遗留代码实际字段」为准，并回写修订到 `hermes_design_document.md`。*
