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

function loadLegacyService(legacyBackendRoot, fileName) {
  const servicePath = path.join(
    legacyBackendRoot,
    "src",
    "services",
    fileName
  );
  return require(servicePath);
}

function createContextTools(config) {
  const contextBuilder = loadContextBuilder(config.legacyBackendRoot);
  const aiServiceFactory = loadLegacyService(
    config.legacyBackendRoot,
    "aiServiceFactory.js"
  );
  const riskMonitoringService = loadLegacyService(
    config.legacyBackendRoot,
    "riskMonitoringService.js"
  );
  const reportService = loadLegacyService(
    config.legacyBackendRoot,
    "reportService.js"
  );
  const allowedUsers = parseAllowedUsers(config.allowedUserIds);
  const maxChars = Number(config.maxContextChars || 8000);
  const fallbackMessage =
    config.healthFallbackMessage ||
    "抱歉，我暂时无法加载您的个人健康档案。请稍后重试，或先完善基础档案后再咨询。";

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

  async function healthChatGuard(args = {}) {
    const userId = args.userId;
    const options = args.options || {};
    ensureUserAllowed(userId, allowedUsers);

    try {
      const payload = await contextBuilder.buildAIContext(userId, options);
      const systemPromptContext = contextBuilder.formatContextForSystemPrompt(payload, {
        maxChars
      });
      const hasUsableContext =
        Boolean(systemPromptContext && systemPromptContext.trim()) &&
        payload.basicInfo !== "暂无基础档案信息。";

      if (!hasUsableContext) {
        return {
          canAnswerHealthQuestion: false,
          fallbackMessage,
          reason: "empty_or_placeholder_context"
        };
      }

      return {
        canAnswerHealthQuestion: true,
        fallbackMessage,
        contextResult: {
          userId,
          payload,
          systemPromptContext
        }
      };
    } catch (error) {
      return {
        canAnswerHealthQuestion: false,
        fallbackMessage,
        reason: `context_load_failed: ${error.message}`
      };
    }
  }

  async function healthAnalyzeText(args = {}) {
    const userId = args.userId;
    const text = args.text;
    ensureUserAllowed(userId, allowedUsers);
    if (!text || typeof text !== "string") {
      throw new Error("text is required");
    }

    const options = args.options || {};
    const provider = options.provider;
    const model = options.model;
    const result = await aiServiceFactory.analyzeHealthRecords(
      { documents: [{ text }] },
      { provider, model }
    );

    return result;
  }

  async function riskDetectAnomalies(args = {}) {
    const userEmail = args.userEmail;
    if (!userEmail || typeof userEmail !== "string") {
      throw new Error("userEmail is required");
    }
    const dataStream = Array.isArray(args.dataStream) ? args.dataStream : [];
    const options = args.options || {};
    return riskMonitoringService.detectAnomalies(userEmail, dataStream, options);
  }

  async function reportGenerate(args = {}) {
    const userEmail = args.userEmail;
    const reportType = args.reportType || "health-assessment";
    const options = args.options || {};
    if (!userEmail || typeof userEmail !== "string") {
      throw new Error("userEmail is required");
    }

    if (reportType === "health-assessment") {
      return reportService.generateHealthAssessmentReport(userEmail, options);
    }
    if (reportType === "comprehensive-report") {
      return reportService.generateComprehensiveReport(userEmail, options);
    }
    throw new Error(
      "reportType must be 'health-assessment' or 'comprehensive-report'"
    );
  }

  return {
    healthContextGet,
    healthContextPrompt,
    healthChatGuard,
    healthAnalyzeText,
    riskDetectAnomalies,
    reportGenerate
  };
}

export { createContextTools };
