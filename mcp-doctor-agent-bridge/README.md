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
