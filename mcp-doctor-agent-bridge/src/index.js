import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import { createContextTools } from "./doctorContextTools.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const config = {
  legacyBackendRoot:
    process.env.LEGACY_BACKEND_ROOT ||
    path.resolve(projectRoot, "..", "ai-doctor-agent_legacy", "backend"),
  allowedUserIds: process.env.MCP_ALLOWED_USER_IDS || "",
  maxContextChars: process.env.MCP_MAX_CONTEXT_CHARS || "8000",
  healthFallbackMessage:
    process.env.MCP_HEALTH_FALLBACK_MESSAGE ||
    "抱歉，我暂时无法加载您的个人健康档案。请稍后重试，或先完善基础档案后再咨询。"
};

const tools = createContextTools(config);

const server = new Server(
  {
    name: "doctor-agent-context-mcp",
    version: "0.1.0"
  },
  {
    capabilities: {
      tools: {}
    }
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "health_context_get",
      description:
        "Load personal health context from doctor-agent, including payload and system prompt text.",
      inputSchema: {
        type: "object",
        properties: {
          userId: {
            type: "string",
            description: "Internal user id (usually sanitized email)."
          },
          options: {
            type: "object",
            properties: {
              medications: { type: "boolean" },
              vitalsRecent: { type: "boolean" },
              chatRecent: { type: "boolean" },
              language: { type: "string", enum: ["zh", "en"] }
            },
            additionalProperties: false
          }
        },
        required: ["userId"],
        additionalProperties: false
      }
    },
    {
      name: "health_context_prompt",
      description:
        "Load personal health context and return only the formatted system prompt block.",
      inputSchema: {
        type: "object",
        properties: {
          userId: {
            type: "string",
            description: "Internal user id (usually sanitized email)."
          },
          options: {
            type: "object",
            properties: {
              medications: { type: "boolean" },
              vitalsRecent: { type: "boolean" },
              chatRecent: { type: "boolean" },
              language: { type: "string", enum: ["zh", "en"] }
            },
            additionalProperties: false
          }
        },
        required: ["userId"],
        additionalProperties: false
      }
    },
    {
      name: "health_chat_guard",
      description:
        "Guardrail tool for health chat. Ensures personal context exists, otherwise returns fallback response.",
      inputSchema: {
        type: "object",
        properties: {
          userId: {
            type: "string",
            description: "Internal user id (usually sanitized email)."
          },
          options: {
            type: "object",
            properties: {
              medications: { type: "boolean" },
              vitalsRecent: { type: "boolean" },
              chatRecent: { type: "boolean" },
              language: { type: "string", enum: ["zh", "en"] }
            },
            additionalProperties: false
          }
        },
        required: ["userId"],
        additionalProperties: false
      }
    },
    {
      name: "health_analyze_text",
      description:
        "Analyze health-related text content using doctor-agent AI service factory.",
      inputSchema: {
        type: "object",
        properties: {
          userId: {
            type: "string",
            description: "Internal user id for allowlist and tracing."
          },
          text: {
            type: "string",
            description: "Health content to analyze."
          },
          options: {
            type: "object",
            properties: {
              provider: { type: "string" },
              model: { type: "string" }
            },
            additionalProperties: false
          }
        },
        required: ["userId", "text"],
        additionalProperties: false
      }
    },
    {
      name: "risk_detect_anomalies",
      description:
        "Run doctor-agent risk anomaly detection for wearable/stream data.",
      inputSchema: {
        type: "object",
        properties: {
          userEmail: {
            type: "string",
            description: "User email expected by riskMonitoringService."
          },
          dataStream: {
            type: "array",
            items: { type: "object" }
          },
          options: {
            type: "object",
            properties: {
              timeRange: { type: "string", enum: ["1h", "6h", "24h"] },
              deviceType: { type: "string" }
            },
            additionalProperties: false
          }
        },
        required: ["userEmail"],
        additionalProperties: false
      }
    },
    {
      name: "report_generate",
      description:
        "Generate and persist a report through doctor-agent reportService.",
      inputSchema: {
        type: "object",
        properties: {
          userEmail: {
            type: "string",
            description: "User email used by reportService."
          },
          reportType: {
            type: "string",
            enum: ["health-assessment", "comprehensive-report"]
          },
          options: {
            type: "object",
            additionalProperties: true
          }
        },
        required: ["userEmail"],
        additionalProperties: false
      }
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    if (name === "health_context_get") {
      const result = await tools.healthContextGet(args);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
      };
    }

    if (name === "health_context_prompt") {
      const result = await tools.healthContextPrompt(args);
      return {
        content: [{ type: "text", text: result.systemPromptContext }]
      };
    }
    if (name === "health_analyze_text") {
      const result = await tools.healthAnalyzeText(args);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
      };
    }
    if (name === "health_chat_guard") {
      const result = await tools.healthChatGuard(args);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
      };
    }
    if (name === "risk_detect_anomalies") {
      const result = await tools.riskDetectAnomalies(args);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
      };
    }
    if (name === "report_generate") {
      const result = await tools.reportGenerate(args);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
      };
    }

    return {
      isError: true,
      content: [{ type: "text", text: `Unknown tool: ${name}` }]
    };
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Tool execution failed: ${error.message}`
        }
      ]
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
