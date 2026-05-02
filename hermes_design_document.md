# Hermes 智能医生代理 — 后端设计文档（基于开源 Hermes Agent）

**状态：** v1.0（中文版，与 NousResearch/hermes-agent 对齐）  
**维护者：** 待定  
**最后更新：** 2026-05-01  
**范围：** 以**后端与数据流**为主；用户主入口可为**微信**（随时对话 + 每日报告）。**编排与 Agent 运行时**采用开源 **[NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent)**（MIT），**不再**在本仓库内维护自研 FastAPI「Hermes 微服务」。业务事实来源仍为 **`ai-doctor-agent_legacy/`**（Node + Firebase 等）。

**官方文档：** [hermes-agent.nousresearch.com/docs](https://hermes-agent.nousresearch.com/docs/)

---

## 1. 目标与非目标

### 1.1 要解决的问题

在保护隐私与合规前提下，用 **Nous Hermes Agent** 作为统一 Agent 运行时（多模型、工具、记忆、定时任务、多通道网关），对个人健康相关多源数据做推理与编排；与现有 **Node 后端**协同：后者仍是**系统事实来源**（用户、档案、用药、体征、预警、报告持久化、微信 OAuth 与模板消息），Hermes Agent 侧重**对话体验、技能、MCP 扩展、跨会话记忆与定时产出**。

用户侧**微信**可作为主渠道：医疗与健康问答、弱相关闲聊边界见 §9.3；**每日**基于个人数据生成报告并推送（§5、§9.4）。微信侧合规与产品形态在实施阶段单独评审。

### 1.2 强制个人化（硬性产品要求）

所有面向用户的**健康相关回答**（含微信对话、主动报告）在调用模型前，**必须**携带该用户本人的 **PHP（Personal Health Payload）**：与现有 `AIContextPayload` 一致的基础档案、用药、近期体征、最近对话等；后续可扩展可穿戴、饮食、运动、风险摘要等。

- **实现边界**：由 **doctor-agent** 在每次对话或定时任务前调用 `contextBuilderService.buildAIContext(userId, { … })`，经 `formatContextForSystemPrompt` 或等价结构化片段，注入 Hermes 的**会话上下文**（如 gateway 消息预处理、context files、MCP 工具返回），或经 **MCP** 只读查询；**禁止**在未成功组装个人上下文的路径上输出个体化诊疗式结论。
- **纯科普**：若问题与个体无关，可在携带最简档案的前提下回答，并注明个体差异需面诊确认。

### 1.3 与「普通 LLM 套壳」的差异化（对齐上游能力）

| 能力 | 含义 | 在本设计中的落点 |
|------|------|------------------|
| **记忆** | 跨会话连贯与压缩 | 上游 **Memory / Honcho / 会话检索**；**权威医学事实与 PHI 主库仍在 Node**，Hermes 内记忆为**辅助叙事与偏好**，敏感字段不落第三方云 unless 已评审。 |
| **技能** | 可复用流程与 agentskills.io | 为「日报模板」「风险说明话术」「化验单字段抽取」等编写 **Skills**，版本化存放；与临床规则仍由 Node 校验。 |
| **工具与 MCP** | 调用外部能力 | **MCP** 连接 doctor-agent 暴露的只读工具（查档案摘要、昨日体征、活跃用药），或内部 HTTP；避免 Agent 直连生产 DB。 |
| **定时** | cron + 多通道投递 | 上游 **Cron** 驱动「每日报告」自然语言任务，投递到 Telegram/邮件等；**微信**若需原生模板消息，可由 **cron 回调 Node** 由 Node 调用微信 API（见 §9.4）。 |
| **自我进化** | 技能与流程迭代 | 随使用迭代 **Skills / 提示词 / 工具白名单**；不承诺在线改模型权重。 |

### 1.4 非目标

- 不在本仓库复制或 fork 整套 `hermes-agent` 源码作为「子模块必交物」；以**上游安装 + 配置 + 集成说明**为主。
- 不替代医疗器械认证；输出均为辅助说明，保留急诊转介与免责声明（沿用 `emergencyService` 等）。
- v1 不要求自训全量模型；可选用 OpenRouter / 自托管 vLLM / Ollama 等（`hermes model` 切换）。

---

## 2. 术语

| 术语 | 说明 |
|------|------|
| **Hermes Agent（上游）** | Nous Research 开源 Agent：[github.com/NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent)。含 CLI、**Messaging Gateway**（Telegram、Discord 等）、**MCP**、**Cron**、**Skills**、多终端后端。 |
| **doctor-agent / 遗留后端** | `ai-doctor-agent_legacy/backend`：Express、`aiServiceFactory`、`contextBuilderService`、`AIContextPayload`。 |
| **Hermes LLM** | 任意上游支持的推理端点（OpenRouter、自托管 OpenAI 兼容网关等），由 `hermes model` 配置。 |
| **PHP** | Personal Health Payload：归一化个人健康上下文；与 `AIContextPayload` 及扩展字段对应。 |
| **HermesClaw** | 社区微信桥：[github.com/AaronWong1999/hermesclaw](https://github.com/AaronWong1999/hermesclaw)（上游 README 引用）；与 OpenClaw/Hermes 同账号场景需阅读其安全说明。 |

---

## 3. 现状分析（`ai-doctor-agent_legacy`）

与集成直接相关的已有能力：

- **适配器模式**：`aiServiceFactory` 调度 Gemini / OpenAI 等云厂商；**不强制**再增加名为 `hermes` 的 HTTP 微服务适配器；改为在**产品层**把「用户对话」接到 **Hermes Agent 网关**，云厂商路径保留为 fallback 或并行通道。
- **上下文构建**：`contextBuilderService.js` → `AIContextPayload`；为 **MCP 工具**或 **Node 出站 webhook** 提供单一真源。
- **领域服务**：`healthAnalysisService`、`riskMonitoringService`、`reportService`、`conversationService` 等；定时报告可 **cron → Node → reportService + 微信 API**，Agent 侧生成正文草稿。

**结论：** 两条主接缝——**(A) Agent 网关 ↔ 用户**（Telegram / HermesClaw 微信 / 邮件等）；(**B) Agent ↔ doctor-agent**（MCP、HTTPS 内网、或「Node 拉 Agent」反向集成，按部署二选一或组合）。

---

## 4. 总体架构

```
┌─────────────────────────────────────────────────────────────────┐
│  用户通道（任选其一或多）                                          │
│  Telegram / Discord / … │ 微信：HermesClaw 或 官方回调 → Node      │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  Nous Hermes Agent（独立安装/进程）                               │
│  `hermes` CLI · `hermes gateway` · MCP · Cron · Skills · Memory   │
│  模型：`hermes model`（OpenRouter / 自托管 / …）                    │
└────────────────────────────┬────────────────────────────────────┘
                             │ MCP / HTTPS（内网）
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  doctor-agent（Node，`ai-doctor-agent_legacy/backend`）           │
│  用户、档案、报告、通知、微信 access_token、模板消息                 │
│  `buildAIContext` / `formatContextForSystemPrompt` / repositories │
└─────────────────────────────────────────────────────────────────┘
```

**部署建议：** Hermes Agent 与 Node **同 VPC 或可 mTLS 的对等网络**；**仅 Node**（或 API 网关）持有 Firebase/DB 凭证与微信 AppSecret；Agent 通过 **MCP 或受限内网 API** 读取脱敏后的上下文片段。

---

## 5. 多源输入与「自动更新」

### 5.1 输入类型

与前一版一致：医疗记录、用药、日维体征、可穿戴流、康复与营养等；进入方式沿用现有 repo 与聚合管道。

### 5.2 触发方式

1. **事件驱动**：新数据写入后，Node 侧 `riskMonitoringService` 等；可选 **webhook** 通知 Agent 会话或写入 context file。
2. **定时驱动**：优先用 Hermes **Cron** 表达「每日 07:00 生成日报」；**推送**（当前为 **Telegram**；微信为可选）若需落库与合规控制，由 Cron 调 **Node 内部任务 URL**（带服务账号 JWT 或 mTLS），由 Node 调用 `reportService` + 对应渠道接口（Telegram Bot API / 微信模板消息等）。
3. **用户主动**：网关注入当次消息的 **PHP**（§1.2）。

---

## 6. 记忆分层

- **权威状态**：Node + DB。
- **会话内**：`chatRecent` 等仍从 `contextBuilderService` 注入每次请求。
- **跨会话（Agent 内）**：使用上游 Memory/摘要能力作**非权威**补充；临床与用药变更以 Node 数据为准。

---

## 7. 与上游 Hermes Agent 的能力映射（无自建 `/v1/chat` 微服务）

| 本产品设计需求 | 上游能力（文档入口） |
|----------------|----------------------|
| 多模型与供应商切换 | [Configuration](https://hermes-agent.nousresearch.com/docs/user-guide/configuration)、`hermes model` |
| 外部工具与院内数据只读 | [MCP Integration](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp) |
| 每日报告与定时提醒 | [Cron Scheduling](https://hermes-agent.nousresearch.com/docs/user-guide/features/cron) |
| 人格与长期偏好 | [Memory](https://hermes-agent.nousresearch.com/docs/user-guide/features/memory)、Context Files |
| 可复用抽取/日报逻辑 | [Skills](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills) |
| 微信（社区方案） | [HermesClaw](https://github.com/AaronWong1999/hermesclaw)；或 **微信 → Node → 转发文本到已登录的 Agent 会话**（自定义小服务，仍不属于「Hermes FastAPI 微服务」范畴） |

---

## 8. 安全与合规要点

- **密钥**：LLM API Key、Telegram Bot Token 等放在 Agent 配置；**微信与 DB** 密钥仅在 Node。
- **MCP 暴露面**：工具应 **最小权限**（按 userId 查询、审计日志、速率限制）。
- **日志**：默认不落原始 PHI；调试遵循上游 [Security](https://hermes-agent.nousresearch.com/docs/user-guide/security) 指南。

---

## 9. 微信：随时问答 + 每日报告

### 9.1 通道选项

- **A. HermesClaw**：在同一微信账号上桥接 Hermes/OpenClaw 生态；评估封号与隐私风险。
- **B. 官方回调**：微信服务器 → **Node** 验签 → 映射 OpenID→userId → `buildAIContext` → 将用户消息与系统上下文交给 **Agent**（HTTP/MQ/本地 pipe，由实施选定）；回复再走客服消息接口。

### 9.2 个人化

与 §1.2 相同：任何个体化回答前必须有 PHP；失败则固定降级文案。

### 9.3 交互范围

健康为主、弱相关生活问题可简短回应并引导回健康管理；禁止替代急诊与违法内容。

### 9.4 每日报告

Agent 或 Node cron 生成正文 → `reportRepo` → **Telegram** 摘要/链接（或模板/订阅消息若走微信）；超长用摘要 + 短链只读页。

---

## 10. 分阶段交付（修订）

| 阶段 | 内容 |
|------|------|
| **M0** | 本文档评审；选定用户通道（Telegram 先 / 微信方案）。 |
| **M1** | 部署上游 Hermes Agent；`hermes model` 通；`hermes gateway` 通（任选一端）。 |
| **M2** | doctor-agent 提供 **MCP 或内网 HTTP**：`getHealthContext(userId)` 封装 `buildAIContext`。 |
| **M3** | 对话路径：**网关消息 → 注入 PHP**（工具拉取或预处理脚本）。 |
| **M4** | **Skills**：日报章节、化验字段抽取等；与 Node Joi 校验对齐（见仓库 `mcp-doctor-agent-bridge/hermes/skills/`）。 |
| **M5** | **Cron**：日报生成；**当前推送为 Telegram**（Node Bot API 或 Hermes gateway）；微信若启用仍由 Node 发送（示例见 `mcp-doctor-agent-bridge/hermes/M5_cron_and_node_webhook.md` 与 `scripts/`）。 |
| **M6** | 观测、熔断、fallback 云厂商；渗透测试与 MCP 审计（清单见 `mcp-doctor-agent-bridge/hermes/M6_observability_circuit_mcp_audit.md`）。 |

---

## 11. 验收标准（修订）

1. 上游 `hermes doctor` 无阻塞性错误；网关可收发信息。  
2. 从测试用户发消息到回复，链路中 **MCP/注入** 能证明携带了 `userId` 对应上下文（自动化可测 mock）。  
3. 关闭 MCP 或故意失败时，**不出现**伪造个体化诊断。  
4. 每日报告任务至少一次端到端（测试环境可 stub **Telegram** 或记录 Bot API 成功响应）。  
5. PHI 默认不出现在 Agent 持久化明文配置与错误上报中。

---

## 附录 — 遗留代码路径速查

| 能力 | 路径 |
|------|------|
| AI 工厂 | `ai-doctor-agent_legacy/backend/src/services/aiServiceFactory.js` |
| 上下文 | `ai-doctor-agent_legacy/backend/src/services/contextBuilderService.js` |
| 风险监控 | `ai-doctor-agent_legacy/backend/src/services/riskMonitoringService.js` |

---

*本文档替代原「自建 FastAPI Hermes Agent」方案；实施细节见 `hermes_implementation_guide.md`。*
