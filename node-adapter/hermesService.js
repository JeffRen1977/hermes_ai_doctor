/**
 * Hermes Agent（自托管）适配器 — 调用 FastAPI /v1/*。
 * 环境变量：HERMES_AGENT_URL、HERMES_AGENT_TOKEN（与 Agent INTERNAL_TOKEN 一致）
 */

const contextBuilderService = require('../contextBuilderService');

function _baseUrl() {
  return (process.env.HERMES_AGENT_URL || '').replace(/\/$/, '');
}

function _headers() {
  return {
    'Content-Type': 'application/json',
    'X-Internal-Token': process.env.HERMES_AGENT_TOKEN || '',
  };
}

function sanitizeUserId(userEmail) {
  return (userEmail || '').replace(/[^a-zA-Z0-9@._-]/g, '_');
}

function isServiceAvailable() {
  return Boolean(_baseUrl() && process.env.HERMES_AGENT_TOKEN);
}

async function refreshAvailabilityCache() {
  const base = _baseUrl();
  if (!base) return false;
  const u = new URL('/v1/health', `${base}/`);
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 2000);
  try {
    const res = await fetch(u, { method: 'GET', signal: ac.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

function getAvailableModels() {
  const m = process.env.HERMES_DEFAULT_MODEL || 'llama3.2';
  return { text: [m], all: [m] };
}

async function _postJson(path, body, timeoutMs) {
  const base = _baseUrl();
  if (!base || !process.env.HERMES_AGENT_TOKEN) {
    return { ok: false, status: 0, data: { error: 'HERMES_AGENT_URL or HERMES_AGENT_TOKEN not configured' } };
  }
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: _headers(),
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    return { ok: false, status: 0, data: { error: e.message || String(e) } };
  } finally {
    clearTimeout(timer);
  }
}

/** 与 chat 路由一致：全量扩展用于分析类调用 */
const DEFAULT_CONTEXT_FLAGS = {
  medications: true,
  vitalsRecent: true,
  chatRecent: true,
  exerciseRecent: true,
  wearableSummary: true,
  riskAlertsRecent: true,
  nutritionRecent: false,
};

async function _buildPersonalContext(userIdOrEmail, language) {
  const userId = sanitizeUserId(userIdOrEmail);
  const payload = await contextBuilderService.buildAIContext(userId, {
    ...DEFAULT_CONTEXT_FLAGS,
    language: language || 'zh',
  });
  const context = contextBuilderService.formatContextForSystemPrompt(payload);
  return { context, payload };
}

async function healthChat(message, context = '', options = {}) {
  const timeoutMs = Number(process.env.HERMES_CHAT_TIMEOUT_MS || 120000);
  const body = {
    message,
    context: context || '',
    language: options.language === 'en' ? 'en' : 'zh',
    options: {
      model: options.model || undefined,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      stream: false,
    },
  };
  const { ok, data } = await _postJson('/v1/chat', body, timeoutMs);
  if (!ok) {
    return { success: false, error: data.detail || data.error || 'Hermes chat request failed' };
  }
  if (data.success === false) {
    return { success: false, error: data.error || 'Hermes chat failed' };
  }
  return {
    success: true,
    message: data.message,
    model: data.model,
    provider: 'hermes',
  };
}

async function analyzeHealthRecords(healthData, options = {}) {
  const timeoutMs = Number(process.env.HERMES_ANALYZE_TIMEOUT_MS || 180000);
  let context = options.context || '';
  let payload = options.payload || null;
  const email = options.userEmail || options.userId || healthData?.userProfile?.email;
  if (email && !context) {
    try {
      const built = await _buildPersonalContext(email, options.language || 'zh');
      context = built.context;
      payload = built.payload;
    } catch (e) {
      console.warn('hermesService analyzeHealthRecords: buildAIContext failed', e.message);
    }
  }
  const body = {
    healthData,
    context,
    payload,
    userId: options.userId || null,
    language: options.language === 'en' ? 'en' : 'zh',
    options: {
      model: options.model,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
    },
    traceId: options.traceId,
  };
  const { ok, data } = await _postJson('/v1/analyze/records', body, timeoutMs);
  if (!ok) {
    return { success: false, error: data.detail || data.error || 'Hermes analyze failed', provider: 'hermes' };
  }
  if (data.success === false) {
    return { success: false, error: data.error || 'Hermes analyze failed', provider: 'hermes' };
  }
  return {
    success: true,
    analysis: data.analysis,
    model: data.model || 'default',
    provider: 'hermes',
    timestamp: new Date().toISOString(),
  };
}

async function analyzeDiet(foodItems, userHealthData = {}, options = {}) {
  const timeoutMs = Number(process.env.HERMES_ANALYZE_TIMEOUT_MS || 180000);
  let context = options.context || '';
  let payload = options.payload || null;
  if (options.userId && !context) {
    try {
      const built = await _buildPersonalContext(options.userId, options.language || 'zh');
      context = built.context;
      payload = built.payload;
    } catch (e) {
      console.warn('hermesService analyzeDiet: buildAIContext failed', e.message);
    }
  }
  const body = {
    foodItems: foodItems || [],
    userHealthData: userHealthData || {},
    context,
    payload,
    language: options.language === 'en' ? 'en' : 'zh',
    options: { model: options.model, temperature: options.temperature, maxTokens: options.maxTokens },
  };
  const { ok, data } = await _postJson('/v1/analyze/diet', body, timeoutMs);
  if (!ok || data.success === false) {
    return { success: false, error: data.error || data.detail || 'Hermes diet analyze failed' };
  }
  return { success: true, analysis: data.analysis };
}

async function analyzeSymptoms(symptoms, userProfile = {}, options = {}) {
  const timeoutMs = Number(process.env.HERMES_ANALYZE_TIMEOUT_MS || 180000);
  let context = options.context || '';
  let payload = options.payload || null;
  const uid = options.userId || userProfile.email || userProfile.userId;
  if (uid && !context) {
    try {
      const built = await _buildPersonalContext(uid, options.language || 'zh');
      context = built.context;
      payload = built.payload;
    } catch (e) {
      console.warn('hermesService analyzeSymptoms: buildAIContext failed', e.message);
    }
  }
  const body = {
    symptoms: typeof symptoms === 'string' ? symptoms : JSON.stringify(symptoms),
    userProfile,
    context,
    payload,
    language: options.language === 'en' ? 'en' : 'zh',
    options: { model: options.model, temperature: options.temperature, maxTokens: options.maxTokens },
  };
  const { ok, data } = await _postJson('/v1/analyze/symptoms', body, timeoutMs);
  if (!ok || data.success === false) {
    return { success: false, error: data.error || data.detail || 'Hermes symptoms analyze failed' };
  }
  return { success: true, analysis: data.analysis };
}

async function checkDrugInteractions(medications, options = {}) {
  const timeoutMs = Number(process.env.HERMES_ANALYZE_TIMEOUT_MS || 180000);
  let context = options.context || '';
  let payload = options.payload || null;
  if (options.userId && !context) {
    try {
      const built = await _buildPersonalContext(options.userId, options.language || 'zh');
      context = built.context;
      payload = built.payload;
    } catch (e) {
      console.warn('hermesService checkDrugInteractions: buildAIContext failed', e.message);
    }
  }
  const body = {
    medications: medications || [],
    context,
    payload,
    language: options.language === 'en' ? 'en' : 'zh',
    options: { model: options.model, temperature: options.temperature, maxTokens: options.maxTokens },
  };
  const { ok, data } = await _postJson('/v1/analyze/drug-interactions', body, timeoutMs);
  if (!ok || data.success === false) {
    return { success: false, error: data.error || data.detail || 'Hermes drug check failed' };
  }
  return { success: true, analysis: data.analysis };
}

async function analyzePDFDocument(base64PDF, options = {}) {
  void base64PDF;
  void options;
  return {
    success: false,
    error: 'Hermes adapter: use gemini/openai for PDF extraction; then analyzeHealthRecords with Hermes on text.',
  };
}

async function extractTextFromImage(base64Image, options = {}) {
  void base64Image;
  void options;
  return { success: false, error: 'Hermes adapter: use gemini/openai for image OCR in v1.' };
}

async function analyzeImageWithAI(base64Image, prompt, options = {}) {
  void base64Image;
  void prompt;
  void options;
  return { success: false, error: 'Hermes adapter: multimodal image+prompt not implemented in v1.' };
}

module.exports = {
  isServiceAvailable,
  refreshAvailabilityCache,
  getAvailableModels,
  healthChat,
  analyzeHealthRecords,
  analyzePDFDocument,
  extractTextFromImage,
  analyzeImageWithAI,
  analyzeDiet,
  analyzeSymptoms,
  checkDrugInteractions,
};
