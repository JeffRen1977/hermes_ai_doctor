import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function parseAllowedUsers(raw) {
  return new Set(
    String(raw || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

function ensureUserAllowed(userId, allowedUsers) {
  if (!userId || typeof userId !== "string") {
    throw new Error("userId is required");
  }
  if (allowedUsers.size > 0 && !allowedUsers.has(userId)) {
    throw new Error(`userId is not allowed: ${userId}`);
  }
}

function loadContextBuilder(legacyBackendRoot) {
  const servicePath = path.join(
    legacyBackendRoot,
    "src",
    "services",
    "contextBuilderService.js"
  );
  return require(servicePath);
}

function createContextTools(config) {
  const contextBuilder = loadContextBuilder(config.legacyBackendRoot);
  const allowedUsers = parseAllowedUsers(config.allowedUserIds);
  const maxChars = Number(config.maxContextChars || 8000);

  async function healthContextGet(args = {}) {
    const userId = args.userId;
    const options = args.options || {};
    ensureUserAllowed(userId, allowedUsers);

    const payload = await contextBuilder.buildAIContext(userId, options);
    const systemPromptContext = contextBuilder.formatContextForSystemPrompt(payload, {
      maxChars
    });

    return {
      userId,
      payload,
      systemPromptContext
    };
  }

  async function healthContextPrompt(args = {}) {
    const userId = args.userId;
    const options = args.options || {};
    ensureUserAllowed(userId, allowedUsers);

    const payload = await contextBuilder.buildAIContext(userId, options);
    const systemPromptContext = contextBuilder.formatContextForSystemPrompt(payload, {
      maxChars
    });

    return {
      userId,
      systemPromptContext
    };
  }

  return {
    healthContextGet,
    healthContextPrompt
  };
}

export { createContextTools };
