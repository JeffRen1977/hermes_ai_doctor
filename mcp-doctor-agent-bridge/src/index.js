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
  maxContextChars: process.env.MCP_MAX_CONTEXT_CHARS || "8000"
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
