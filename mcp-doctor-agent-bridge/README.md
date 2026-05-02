# MCP Doctor-Agent Bridge

这个目录是一个最小可运行示例：把 `ai-doctor-agent_legacy/backend` 里的 `contextBuilderService` 通过 MCP tools 暴露给 Hermes Agent。

## 1) 安装

```bash
cd mcp-doctor-agent-bridge
npm install
```

## 2) 环境变量

复制 `.env.example` 并按机器路径修改：

- `LEGACY_BACKEND_ROOT`：`ai-doctor-agent_legacy/backend` 的绝对路径
- `MCP_ALLOWED_USER_IDS`：可选，逗号分隔白名单 userId
- `MCP_MAX_CONTEXT_CHARS`：`formatContextForSystemPrompt` 截断长度

## 3) 启动 MCP Server

```bash
npm start
```

该服务使用 **stdio transport**，通常由 Hermes Agent 进程拉起，不需要单独暴露端口。

## 4) 提供的工具

- `health_context_get`
  - 入参：`{ userId, options }`
  - 出参：`{ userId, payload, systemPromptContext }`
- `health_context_prompt`
  - 入参：`{ userId, options }`
  - 出参：`{ userId, systemPromptContext }`
- `health_chat_guard`
  - 入参：`{ userId, options }`
  - 出参：`{ canAnswerHealthQuestion, fallbackMessage, contextResult? }`
  - 用途：M3 强制个体化守卫；上下文加载失败时统一降级文案
- `health_analyze_text`
  - 入参：`{ userId, text, options }`
  - 出参：`aiServiceFactory.analyzeHealthRecords` 结果
- `risk_detect_anomalies`
  - 入参：`{ userEmail, dataStream, options }`
  - 出参：`riskMonitoringService.detectAnomalies` 结果
- `report_generate`
  - 入参：`{ userEmail, reportType, options }`
  - 出参：`reportService` 生成结果（包含持久化后的报告对象）

`options` 对应 `buildAIContext`：

```json
{
  "medications": true,
  "vitalsRecent": true,
  "chatRecent": true,
  "language": "zh"
}
```

## 5) Hermes 侧注册示例

按 Hermes 文档的 MCP 配置方式注册该命令（示意）：

```json
{
  "mcpServers": {
    "doctor-context": {
      "command": "node",
      "args": ["/Users/jeffren/Documents/hermes/mcp-doctor-agent-bridge/src/index.js"],
      "env": {
        "LEGACY_BACKEND_ROOT": "/Users/jeffren/Documents/hermes/ai-doctor-agent_legacy/backend",
        "MCP_ALLOWED_USER_IDS": "",
        "MCP_MAX_CONTEXT_CHARS": "8000"
      }
    }
  }
}
```

> 注意：Hermes 实际配置文件位置和字段请以官方文档为准。

## 6) 建议调用顺序（对话场景）

1. 先调 `health_chat_guard`（M3 守卫）
2. 若 `canAnswerHealthQuestion=false`，直接返回 `fallbackMessage`
3. 若 `canAnswerHealthQuestion=true`，再生成健康回答
4. 需要深分析时调 `health_analyze_text`
5. 风险相关问题可调 `risk_detect_anomalies`

## 7) 建议调用顺序（每日报告）

1. 调 `health_context_get` 获取基础档案
2. 需要趋势判断时调 `risk_detect_anomalies`
3. 调 `report_generate` 生成并入库报告

## 8) M3 模板文件

- `hermes/M3_system_prompt_template.md`
- `hermes/M3_tool_call_strategy.md`

可直接拷贝到 Hermes 的系统提示词/团队指令中，确保模型先调用 `health_chat_guard`。
