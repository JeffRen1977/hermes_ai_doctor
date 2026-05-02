# M6 — 观测（Observability）、熔断（Circuit breaker）、MCP 审计

本页为**检查清单与实施要点**，对齐 `hermes_design_document.md` **M6** 与 **§8 安全**。Hermes 与 doctor-agent 两侧都要覆盖。

---

## 1. 观测（Observability）

### 1.1 Hermes Agent（上游）

| 检查项 | 说明 |
|--------|------|
| 日志落盘与轮转 | 网关 / CLI / Cron 日志路径、大小上限、`logrotate` 或等价 |
| 结构化字段 | `trace_id` / `session_id` / `tool_name` / `provider` / `model`（不落 PHI 全文） |
| 健康检查 | `hermes doctor`；进程监控（systemd / Docker healthcheck） |
| 上游文档 | [Security](https://hermes-agent.nousresearch.com/docs/user-guide/security) |

### 1.2 doctor-agent（Node）

| 检查项 | 说明 |
|--------|------|
| HTTP 访问日志 | 对 `/internal/cron/*` 记录 **caller IP、route、status、duration**，不记录 Bearer |
| 业务指标 | 日报任务：`processed` / `skipped` / `errors`；MCP 若经 Node 代理则记 **tool 调用次数与延迟** |
| 错误追踪 | Sentry / OpenTelemetry 等（可选）；**采样**避免 PHI 进入事件 |

### 1.3 MCP Bridge（`mcp-doctor-agent-bridge`）

| 检查项 | 说明 |
|--------|------|
| stderr 日志 | stdio MCP 的日志应走 stderr，避免污染 MCP JSON-RPC stdout |
| 工具维度 | 每条工具调用打：`tool`、`userId` 长度或 hash、**成功/失败**、耗时（**禁止**完整 `systemPromptContext` 默认落日志） |

---

## 2. 熔断与降级（Circuit breaker & fallback）

### 2.1 LLM 提供商

| 检查项 | 说明 |
|--------|------|
| 主备模型 | Hermes `hermes model` 配置备用；Gemini/OpenRouter 429/5xx 时切换 |
| 超时 | doctor-agent `analyzeHealthRecords` 等已有超时策略的，保持与 M6 一致 |
| 降级文案 | MCP / `health_chat_guard` 失败时 **禁止**个体化结论（沿用 M3） |

### 2.2 MCP / 内部 Cron

| 检查项 | 说明 |
|--------|------|
| MCP 进程 | 工具连续失败 N 次 → 短暂熔断（进程内计数 + 冷却），避免拖垮 doctor-agent DB |
| Cron webhook | `POST /internal/cron/daily-report` 返回 5xx 时，调度器应 **指数退避** 重试；避免无限重试刷 LLM |
| 限流 | 对 cron IP / token 做 **QPS 上限**（如每实例每分钟 1 次全量任务） |

### 2.3 Telegram

| 检查项 | 说明 |
|--------|------|
| Bot API 429 | 遵守 `retry_after`；批量用户时间隔发送 |
| 失败队列 | 可选：失败消息入队重试，避免静默丢日报 |

---

## 3. MCP 审计（Audit）

### 3.1 工具与数据最小化

| 检查项 | 说明 |
|--------|------|
| 白名单 | 生产启用 `MCP_ALLOWED_USER_IDS`；禁止任意 `userId` 遍历 |
| 动作工具 | `risk_detect_anomalies`、`report_generate` 仅在 **显式策略** 下开启（Hermes tool policy） |
| 输出截断 | `MCP_MAX_CONTEXT_CHARS` 生产合理上限（如 8000–12000） |

### 3.2 审计记录（建议字段）

每条 MCP 工具调用（或经 Node 代理时）append-only 记录：

- `ts`（ISO）、`tool`、`user_id_hash`、`ok`、`duration_ms`、`error_class`（不含 PHI）

存储：专用审计集合 / 表，**TTL** 或定期归档。

### 3.3 渗透与权限

| 检查项 | 说明 |
|--------|------|
| 内网隔离 | `/internal/cron/*` 仅 VPC / mTLS；公网 **禁止** 直连 |
| Token | `INTERNAL_CRON_BEARER_TOKEN` 定期轮换；泄露即作废 |
| MCP stdio | 仅本机 Hermes 拉起；**勿**把 MCP 暴露到公网 SSE 除非有 TLS + 强鉴权 |

---

## 4. 验收清单（M6 完成定义）

- [ ] Hermes 与 Node 关键路径均有 **非 PHI** 结构化日志或指标  
- [ ] LLM 失败有 **可观测** 错误率与 **可配置** fallback  
- [ ] MCP 工具调用有 **审计摘要**（无全量上下文）  
- [ ] Cron / MCP 有 **限流或熔断**，避免雪崩  
- [ ] `/internal/cron/*` **不可从公网匿名访问**  
- [ ] 一次 **staging 渗透或脚本扫描**（含 MCP 与 internal 路由）无高危项，或已记录修复计划  

---

## 5. 参考链接

| 主题 | URL |
|------|-----|
| Hermes Security | https://hermes-agent.nousresearch.com/docs/user-guide/security |
| Hermes MCP | https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp |
