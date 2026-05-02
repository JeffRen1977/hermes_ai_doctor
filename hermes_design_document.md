# Hermes 智能医生代理 — 后端设计文档

**状态：** 草案 v0.4（中文版，架构与集成设计）  
**维护者：** 待定  
**最后更新：** 2026-05-01  
**范围：** 以**后端与数据流**为主；**用户主入口为微信**——**平时随时可打开对话**（医疗与健康为主，见 §9.3），并**每日自动**基于个人全量健康数据生成**一份报告推送到同一微信**（见 §9.4、§5）。实现上**优先复用**本仓库内已有逻辑：`ai-doctor-agent_legacy/`。新增 **Hermes Agent**（建议 Python/FastAPI）作为自托管 Nous Hermes 模型的编排与推理层。

---

## 1. 目标与非目标

### 1.1 要解决的问题

构建一个以 **Hermes 系列开源权重模型**（如 Hermes-3 / Hermes-4，经 vLLM / Ollama 等提供 OpenAI 兼容接口）为核心的**智能医生代理后端**，在保护隐私的前提下，对个人健康相关的多源数据进行统一推理与编排，并与现有 **Node 后端**协同：后者仍是**系统事实来源**（用户、档案、预警、通知、报告持久化），Hermes 侧侧重**长上下文推理、工具调用与结构化输出**。

用户侧交互**不强制**自研 SPA；**微信**作为用户**每天随时使用**的主渠道：有**医疗或健康方面的疑问**、或希望与「自己的健康代理」**闲聊式互动**时，均可发消息；后端在 §1.2 前提下返回回答。另由定时任务**每天**汇总用户各类健康数据，生成**个人日报**并**发到微信**（模板/订阅消息或合规能力，见 §9.4）。微信只做收发与轻展示，**业务与 AI 编排全部在 Node + Hermes 后端**。

### 1.2 强制个人化（硬性产品要求）

所有面向用户的**健康相关回答**（含微信对话、App 内聊天若保留、主动报告正文）在调用 Hermes（或任意 LLM）时，**必须**在请求链路中携带并消费该用户本人的 **PHP / AIContextPayload**（基础档案、用药、近期体征、最近对话等；M3 起含可穿戴/饮食/运动等扩展），使模型推理建立在**个人事实数据**之上，而不是仅对问题做泛泛科普。

- **实现边界**：由 Node 在每次对话前调用 `contextBuilderService.buildAIContext(userId, { … })`，将结果格式化后作为 `context`（及后续结构化 `payload`）传入 Hermes Agent；**禁止**在未成功组装个人上下文的路径上对用户输出「个体化诊疗式」结论（若档案暂不可用，应返回明确提示：请先完善档案 / 系统暂无法加载您的健康摘要，并避免编造个人情况）。
- **Hermes Agent**：`/v1/chat` 等端点应将个人上下文置于 system 或等价高优先级位置，并在 Prompt 策略中要求模型**显式结合**用户档案中的事实作答（在保护隐私前提下，回答中可适当概括引用，如「结合您当前用药…」）。
- **纯科普边界**：若用户问题与个体无关（如「什么是高血压」），仍可在携带基础档案的前提下回答，并注明个体差异需以档案与医生面诊为准。

### 1.3 相对「普通 LLM 套壳」的差异化（体现 Hermes 与架构优势）

| 能力 | 含义 | 在本设计中的落点 |
|------|------|------------------|
| **记忆** | 跨会话、跨天的连贯理解，而非单次 prompt  Stateless | **短期**：最近对话轮次、当日/近日 PHP（Personal Health Payload）由 `contextBuilderService` 与扩展字段组装。**长期**：用户偏好、禁忌、稳定目标、医生总结等写入 **doctor-agent 侧仓库**（如 user profile、digital twin、结构化摘要表）；Hermes Agent 通过 **Push**（请求内带全量 PHP）或 **Pull**（只读内部 API）读取，不在 Hermes 内另建「主库」。可选：Hermes 侧 **向量 RAG** 仅作检索加速，权威结论仍以结构化上下文为准。 |
| **自动更新** | 随新数据到达或按日程刷新结论与风险视图 | **可穿戴流**、**日维体征**、新化验/病历写入后，触发 **聚合管道**（已有 `wearableAggregationPipeline` 等）→ **风险监控**（`riskMonitoringService`）→ 可调 Hermes `/v1/monitor/risk` 生成叙事与分级建议 → 写回 `riskAlertRepo` / `notificationRepo`。**定时任务**（cron / queue）拉取前一日数据，生成 **日报/周报**（对接 `reportService` + Hermes `/v1/report/*` 草案）。**数字孪生**（`digitalTwinService`）按策略刷新投影。 |
| **自我进化** | 系统随使用与反馈改进策略与话术质量 | **闭环**：用户对回答的显式反馈（有用/有害/事实错误）写入审计表；**离线**对提示词版本、阈值、采样策略做 A/B 或小型评测集回归。**提示词与 Persona** 在 Hermes Agent 内 **版本化**（Git + 配置版本号），与模型版本、上下文 schema 一并记录，便于回滚。v1 **不**承诺在线自动改权重；进化主要指 **流程、规则、Prompt、路由策略** 的可迭代。 |

### 1.4 非目标

- 不替代现有 **Repository / 路由契约**；默认在适配器层增量接入。
- 不提供医疗器械级认证；输出均为**辅助性**说明，需保留免责声明与急诊转介逻辑（沿用 `emergencyService` 等）。
- v1 不要求从零训练或全量微调；后续可选 LoRA/适配层。
- 不承诺亚 200ms 级实时语音；支持 **SSE 流式文本** 即可。

---

## 2. 术语

| 术语 | 说明 |
|------|------|
| **doctor-agent / 遗留后端** | 本仓库 `ai-doctor-agent_legacy/backend`：Express 应用，`aiServiceFactory` → `gemini` / `openai` / `ernie` / `qwen` 等适配器；`contextBuilderService` 组装 `AIContextPayload`。 |
| **Hermes LLM** | 自托管 Nous Hermes 权重，OpenAI 兼容 HTTP（vLLM / Ollama / TGI）。 |
| **Hermes Agent** | 新建微服务：封装模型调用、编排（如 LangGraph）、工具、护栏、**主动任务**（监控/报告）的 REST API，供 Node 调用。 |
| **PHP** | Personal Health Payload：归一化的个人健康上下文 JSON，在英文版设计中为 `PersonalHealthPayload`；在 `AIContextPayload` 之上扩展可穿戴、饮食、运动、风险标记等。 |

---

## 3. 现状分析（`ai-doctor-agent_legacy`）

与集成直接相关的已有能力：

- **适配器模式**：`backend/src/services/aiServiceFactory.js` 统一调度各云厂商适配器；可 **增加 `hermes` 适配器**（`hermesService.js`），实现与 `adapters/README.md` 一致的接口（如 `healthChat`、`analyzeHealthRecords`、`analyzeDiet`、`analyzeSymptoms`、`checkDrugInteractions` 等）。
- **上下文构建**：`contextBuilderService.js` 从 `userBasicInfoRepo`、`medicationRepo`、`vitalsDailyRepo`、`chatSessionRepo` 等拉取数据并校验为 `AIContextPayload`。
- **领域服务**：`digitalTwinService`、`healthAnalysisService`、`interventionEngineService`、`rehabilitationAssistantService`、`riskMonitoringService`、`conversationService`、`pdfCaseExtractionService`、`reportService` 等已具备业务入口。
- **数据与可穿戴**：`userWearablesRepo`、`wearableStreamDataRepo`、`vitalsDailyRepo`、`riskAlertRepo`、`notificationRepo` 等；`riskMonitoringService` 已包含流数据质量、规则阈值、送 LLM 点数上限等工程化细节。

**结论：** 存在两条清晰接缝——**适配器接缝**（把 Hermes 当作又一 provider）与 **Agent 接缝**（新增 `hermesAgentService.js` 调用 Hermes Agent 的高阶端点，用于多步推理与定时报告）。

---

## 4. 总体架构（后端 + 微信通道）

```
                    ┌─────────────────────────────────────────────┐
                    │  微信开放平台（服务号 / 小程序 / 企微）        │
                    │  用户消息 / 模板消息 / 订阅通知               │
                    └────────────────────┬────────────────────────┘
                                         │ HTTPS 回调（验签）
                                         ▼
┌────────────────────────────────────────────────────────────────────────┐
│  doctor-agent（Node，`ai-doctor-agent_legacy/backend`）                 │
│  • 微信适配路由：验签、OAuth、消息 XML/JSON 解析                         │
│  • 用户绑定 userId、会话与通知落库                                       │
│  routes → services → repositories                                       │
│  aiServiceFactory ──► hermesService（新）                               │
│  定时任务 / 队列 ──► hermesAgentService（新）── 监控·孪生·报告            │
└───────────────────────────────┬────────────────────────────────────────┘
                                │ REST（内网 JSON + X-Internal-Token）
                                ▼
┌────────────────────────────────────────────────────────────────────────┐
│  Hermes Agent（建议 FastAPI）                                            │
│  /v1/chat · /v1/analyze/* · /v1/plan · /v1/coach · /v1/monitor ·        │
│  /v1/twin · /v1/report（日报周报）· /v1/memory/summarize（可选）          │
│  编排器、Persona、工具（RAG、单位换算、药典查询等）、护栏与可观测性        │
└───────────────────────────────┬────────────────────────────────────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │  Hermes LLM（vLLM 等）  │
                    └───────────────────────┘
```

**部署建议：** 与英文版设计一致，`hermes-llm` + `hermes-agent` 与 Node 应用同主机 **Docker Compose** 私网互通；仅 Node（或网关）对外暴露 HTTPS，供微信服务器回调。

---

## 5. 多源每日输入与「自动更新」数据流

### 5.1 输入类型（可逐日变化）

| 类型 | 来源示例 | 进入系统的方式 |
|------|----------|----------------|
| 医疗相关 | 就诊记录、化验、用药、PDF 报告 | 已有 health records / PDF 流程；摘要进 PHP |
| 可穿戴 | 心率、HRV、步数、睡眠、血糖、血压 | `wearableStreamDataRepo` 写入流；聚合进 `vitalsDailyRepo` |
| 行为与康复 | 运动计划、康复反馈、营养分析 | `exercisePlanRepo`、`nutritionAnalysisRepo`、`rehabilitationRecordRepository` 等 |

### 5.2 自动更新触发方式

1. **事件驱动**：新流数据批量写入、新报告上传后，发布内部事件或调用 `riskMonitoringService` 既有自动检测路径；必要时再异步调用 Hermes `/v1/monitor/risk` 丰富说明与建议等级。
2. **定时驱动（每日报告，核心产品能力）**：每日固定时刻（如 **07:00**，可配置）为每个已订阅且已绑定微信的用户：拉取 **前一日至近 7 日**（可配置）内**全部已接入维度**（档案、用药、体征、可穿戴聚合、风险告警摘要、对话要点等），调用 Hermes **`/v1/report/daily`** 生成**个人健康日报**正文 → 写入 `reportRepo` → **推送至用户微信**（首条为摘要 + 引导「回复关键词查看全文」或 H5/小程序链接，受微信字数与类目限制，见 §9.4）。
3. **用户主动**：微信内随时发文字/图片 → Node 解析 → 与 `routes/chat.js` 等价链路走 `healthChat`（或文件分析），**仍须带个人 PHP**（§1.2）。

### 5.3 主动输出形态

- **警告**：对接 `riskAlertRepo`、急诊标记与 `emergencyService`；Hermes 输出结构化 `severity`、`rationale`、`citations`。
- **提醒**：用药、复测、复诊、运动目标；落 `notificationRepo`，经微信或短信网关发送。
- **每日个人报告（推微信）**：**必选能力**（与 M6 对齐）：Hermes 生成章节化正文，`reportService` / `reportRepo` 持久化；**同一渠道推送到用户微信**，与即时对话互补（对话 = 即时问，日报 = 当日汇总）。

---

## 6. 记忆设计（分层，与「单一请求 Stateless」兼容）

### 6.1 原则

- **权威状态在 Node + DB**；Hermes Agent **默认无用户主库**，避免双写与合规风险。
- **会话内记忆**：最近 N 轮来自 `chatSessionRepo`，已在 `contextBuilderService` 中支持。
- **跨会话长期记忆**：以**结构化字段 + 短摘要**形式存在于 doctor-agent（如用户设置、数字孪生 JSON、慢性病标签）；每次请求通过 PHP **推送**或 Hermes **拉取只读 internal API**。

### 6.2 可选增强（v1.5+）

- **用户级记忆摘要表**：异步任务调用 Hermes「压缩」长历史为 500～1000 token 摘要，按版本写入；主对话只带最新摘要 ID。
- **Hermes 侧向量库**：仅索引用户上传文档片段，检索结果必须带 `source_id`，便于审计与引用。

---

## 7. Hermes Agent 服务设计（后端要点）

### 7.1 技术栈

**Python 3.11 + FastAPI**（与英文版 rationale 一致）：便于 LangGraph、结构化输出、异步 httpx 调用 Node 内部 API。

### 7.2 建议目录（与原版对齐，可按实现微调）

```
hermes-agent/
├── app/main.py, config.py
├── app/api/v1_chat.py, v1_analyze.py, v1_plan.py, v1_coach.py, v1_monitor.py, v1_twin.py, v1_report.py
├── app/orchestrator/   # graph, personas, tools
├── app/llm/client.py, guards.py
├── app/context/loader.py, schemas.py, summarize.py
├── app/rag/（可选）
└── Dockerfile, pyproject.toml
```

### 7.3 端点一览（在英文版基础上增加报告与就绪细节）

| 方法 | 路径 | 用途 | Node 侧消费者（示例） |
|------|------|------|------------------------|
| POST | `/v1/chat` | 健康对话，支持 SSE | `conversationService` |
| POST | `/v1/analyze/records` | 病历/报告结构化分析 | `healthAnalysisService` |
| POST | `/v1/analyze/diet` | 饮食分析 | `healthAnalysisService` |
| POST | `/v1/analyze/symptoms` | 症状分诊与下一步建议 | `interventionEngineService`、聊天路由 |
| POST | `/v1/analyze/drug-interactions` | 药物相互作用 | `interventionEngineService` |
| POST | `/v1/plan/intervention` | 多日干预计划 | `interventionEngineService` |
| POST | `/v1/coach/rehab` | 康复教练回合 | `rehabilitationAssistantService` |
| POST | `/v1/monitor/risk` | 基于时间序列与规则的异常叙事 | `riskMonitoringService` |
| POST | `/v1/twin/update` | 数字孪生投影刷新 | `digitalTwinService` |
| POST | `/v1/report/daily` 或 `/v1/report/weekly` | 日报/周报正文生成 | `reportService` + 定时任务 |
| GET | `/v1/health`、`/v1/ready` | 健康检查 | Compose / 负载均衡 |

请求体中的 `userId`、`language`、`context` 开关、`traceId` 等与英文版附录一致；**PHP 优先由 Node 组装后内联**，降低 Hermes 对外依赖与延迟。

### 7.4 编排与护栏

- 节点流：`load_context` → `plan` →（可选）`tool_call*` → `generate` → `validate` → `respond`。
- **结构化输出**与 Node 端 Joi schema 在 **适配器边界** 做校验，失败时一次自动修复重试。
- **日志脱敏**：默认只记录字段名与长度；`DEBUG_PROMPTS` 仅开发环境。

---

## 8. 与 `ai-doctor-agent_legacy` 的集成（增量）

### 8.1 `hermesService.js`

实现与现有适配器相同的方法集合，内部 HTTP 调用 Hermes Agent `/v1/*`，把响应映射为 `{ success, analysis | response | message, ... }`。

在 `aiServiceFactory.js` 中注册：

```js
this.adapters = { gemini, openai, ernie, qwen, hermes: hermesService };
```

可用性：`HERMES_AGENT_URL` 可访问且 `/v1/health` 为 200（可 30s 缓存）。

### 8.2 `hermesAgentService.js`

封装 `/v1/plan`、`/v1/coach`、`/v1/monitor`、`/v1/twin`、`/v1/report` 等；由 `USE_HERMES_AGENT=true` 控制，关闭时行为与当前完全一致。

### 8.3 环境变量（示例）

| 变量 | 含义 |
|------|------|
| `HERMES_AGENT_URL` | 如 `http://hermes-agent:8100` |
| `HERMES_AGENT_TOKEN` | `X-Internal-Token` 共享密钥 |
| `HERMES_DEFAULT_MODEL` | 如 `hermes-3-8b` |
| `USE_HERMES_AGENT` | `true` / `false` |

### 8.4 扩展 `contextBuilderService`

在 M3 一类里程碑中，将 **可穿戴快照、饮食、运动、活跃风险标记** 并入 PHP，供 Hermes 单次推理使用；字段与单位在 Pydantic schema 中写明，便于中英文提示。

---

## 9. 微信作为「前端」：随时问答 + 每日报告

**不做**独立健康 SPA 的前提下，微信同时承担：**（A）7×24 式对话入口**——用户平时有任何**医疗 / 健康**问题、或想与代理做**与自身健康相关的交流**（在 §9.3 边界内），都可像聊天一样多轮提问；**（B）每日主动推送**——系统每天基于该用户**已接入的全部信息**生成一份报告并**发到微信**。

### 9.1 对话与现有聊天逻辑对齐

- 微信服务器将用户文本（及可选媒体）**POST** 到 Node 的微信回调路由；Node 将 **OpenID / UnionID** 映射到内部 `userId`（与 `sanitizeUserId(email)` 等现有约定一致）。
- 每条用户消息的处理路径应与 `routes/chat.js` 语义等价：**先持久化用户消息**（可复用 `chatSessionRepo` 或微信专用会话集合，但须能续写「最近对话」供 `contextBuilderService` 使用）→ **`buildAIContext`**（至少 `medications: true`, `chatRecent: true`；建议 `vitalsRecent: true`）→ **`formatContextForSystemPrompt`** → **`aiServiceFactory.healthChat`**（`provider` 为用户所选或默认 `hermes`）→ 将 `message` 经微信 **客服消息**（48 小时内）或合规能力回复用户。
- 长回复需按微信单条字数拆条发送；流式若微信不支持，则在 Node 侧收齐非流式结果再下发。

### 9.2 与个人化硬要求的衔接

微信通道**不得**绕过 §1.2：未绑定用户或 `buildAIContext` 失败时，不调用 LLM 作个体化结论，而是引导绑定或重试加载档案。

| 模块 | 后端职责 |
|------|----------|
| 接入 | 「微信控制器」：校验 signature、处理 access_token、OAuth 绑定 **OpenID → userId**。 |
| 对话下行 | 用户文本 → **必带个人 PHP** → `healthChat` /（高阶场景）`hermesAgentService` → 组装微信回复。 |
| 上行通知 | **每日日报** + 其它提醒/告警 → 模板消息或订阅消息；频率与合规遵循微信平台规则；日报与即时客服消息配额分别评估。 |
| 富媒体 | 图片 → 存储 + `extractTextFromImage` 等 → 同样带 PHP 再分析。 |

### 9.3 交互范围与角色边界（「医疗 / 任何问题」的产品定义）

- **核心范围（必支持）**：症状、用药、化验与影像解读（辅助）、慢病与生活方式、运动睡眠饮食、报告指标趋势、复诊与就医建议（非替代面诊）、心理健康科普与支持（在现有 `rehabilitationAssistantService` 等能力边界内）等；一律 **§1.2 带个人 PHP**。
- **扩展范围（同一微信窗口）**：用户偶尔提出与健康弱相关的生活问题（如作息安排、简单压力疏导），代理可在**不编造医疗事实**的前提下简短回应，并适时**引导回健康管理**；对明显超出助理能力或与合规冲突的请求（如诊断替代、处方指令、违法内容），应拒绝并说明边界。
- **非目标**：不宣称「全科万能问答」；不替代执业医师、不替代急诊。

### 9.4 每日健康报告 → 微信

| 项 | 说明 |
|------|------|
| **内容来源** | 与 §5.1 一致：医疗记录、可穿戴与日维体征、用药、风险与告警摘要、前日对话可选摘要等，由 `contextBuilderService` **扩展选项全开** 或专用 `buildDailyReportContext` 组装后送 Hermes。 |
| **生成** | `POST /v1/report/daily`：输入 `userId`、`period`、`payload`（PHP）、`language`；输出结构化章节（今日总结、指标亮点/异常、用药依从提示、明日行动建议、免责声明）。 |
| **持久化** | `reportService` 写入 `reportRepo`，类型标记 `daily-wechat`，便于用户历史查阅。 |
| **触达** | 定时任务按用户时区或统一北京时间触发 → 查 **OpenID 映射** → 调用微信「订阅消息」或「模板消息」（依资质与字段）发送**摘要**；全文过长时用**多条消息**、**小程序订阅**或**带 token 的 HTTPS 短链**（Node 托管只读页，仍不强制自研 SPA）。 |
| **退订** | 保留用户关闭「每日推送」开关（写入 `userSettingsRepo`），任务跳过该用户。 |

**注意：** 微信侧有消息加解密、频次与行业资质要求，需在实施阶段单独列清单；本设计固定 **「微信 ↔ Node（强制个人上下文）↔ Hermes」** 边界。

---

## 10. 模型、安全、可观测性与性能

与英文版 **§7–§10** 思想一致：模型分级（8B 开发 / 更大 GPU 生产）、私网隔离、共享密钥、mTLS 可选、Prometheus 指标、`traceId` 透传、P95 目标等。中文实施时保持 **默认不外联**（Hermes 推理与 RAG 均在可控网络内）。

---

## 11. 分阶段交付（在英文里程碑上微调）

| 阶段 | 内容 |
|------|------|
| **M0** | 本文档评审定稿。 |
| **M1** | Hermes Agent 骨架：`/v1/health`、`/v1/chat` + Ollama Hermes Q4；根目录 Compose。 |
| **M2** | `hermesService.js` + Factory 注册；可选 provider=hermes E2E。 |
| **M3** | PHP 扩展 + `/v1/analyze/*` 全量。 |
| **M4** | Agent 端点 + `USE_HERMES_AGENT`；先接 `rehabilitationAssistantService` 再扩展风险与孪生。 |
| **M5** | Node 只读 `internal/context/*` + 缓存失效 webhook；可选 RAG。 |
| **M6** | **`/v1/report/daily` 必达** + 全量 PHP 组装 + **每日定时推微信**（§9.4）+ 用户侧开关；Prometheus/Grafana；熔断与回退。 |

---

## 12. 风险与开放问题

| 编号 | 内容 | 缓解 |
|------|------|------|
| R1 | 8B 中文医学表述弱于商业大模型 | 保留云厂商 fallback；小评测集对比。 |
| R2 | GPU 不确定 | 文档化 CPU/Ollama 与 GPU/vLLM 两档。 |
| R3 | 微信政策与资质 | 产品/合规单独评估；后端接口保持渠道无关。 |
| Q1 | 日报全文超出微信单条限制 | 摘要首条 + 拆条 / 短链只读页 / 小程序；产品侧定稿一种默认策略。 |

---

## 13. v1 验收标准（与英文版对齐并加微信）

1. Compose 拉起 `hermes-llm` + `hermes-agent`，健康检查通过。  
2. `POST /v1/chat` 带最小 PHP 可返回 zh/en 回答且满足延迟目标。  
3. Node 侧 `provider: 'hermes'` 可走通健康聊天。  
4. `USE_HERMES_AGENT` 打开时，至少一条康复相关调用走 `/v1/coach/rehab` 且响应可校验。  
5. 关闭 Hermes 后行为与改造前一致。  
6. 默认日志无原始 PHI。  
7. **每日报告推微信（M6）**：定时任务成功生成日报并**至少一次**触达微信（测试号或沙箱等价）；用户关闭「每日推送」后任务不再发送。  
8. **微信对话**：已绑定用户随时发送消息（健康为主，§9.3）后，请求 Hermes 时 **payload 含个人上下文**；未绑定用户不得输出伪造个体化结论。  
9. **个人化**：关闭个人上下文注入时，系统拒绝或降级为「无法加载您的健康档案」（可用 feature 开关测）。  
10. **日报个人化**：日报生成路径使用的上下文**不少于**即时聊天路径的核心维度（档案、用药、近期体征；M3 起含可穿戴等）。

---

## 附录 A — 英文版 API 示例与 Compose 草稿

原 **§5.3 请求体示例、§14 Compose 示例、§13 端点映射表** 与实现细节可直接参考同仓库历史版本或保留双语附录；实施时以 **OpenAPI / Pydantic** 为准。

---

## 附录 B — 遗留代码路径速查

| 能力 | 路径 |
|------|------|
| AI 工厂 | `ai-doctor-agent_legacy/backend/src/services/aiServiceFactory.js` |
| 上下文 | `ai-doctor-agent_legacy/backend/src/services/contextBuilderService.js` |
| 风险监控 | `ai-doctor-agent_legacy/backend/src/services/riskMonitoringService.js` |
| 适配器说明 | `ai-doctor-agent_legacy/backend/src/services/adapters/README.md` |

---

*本文档在 v0.1 英文设计基础上，按「中文、后端优先、**微信随时问答（健康为主）**、**每日个人报告推送微信**、**强制基于个人健康信息推理**、记忆/自动更新/进化、多源输入、复用 `ai-doctor-agent_legacy`」做了重组与增补。*

**关联实现步骤：** `hermes_implementation_guide.md`（含微信入站、日报定时任务与推送）。
