/**
 * Hermes Agent adapter — drop into doctor-agent:
 *   backend/src/services/adapters/hermesService.js
 *
 * Register in aiServiceFactory.js:
 *   const hermesService = require('./adapters/hermesService');
 *   this.adapters = { ..., hermes: hermesService };
 * And add a hermes branch in checkAvailableServices() when isServiceAvailable() is true.
 *
 * Env: HERMES_AGENT_URL, HERMES_AGENT_TOKEN (same value as Hermes Agent INTERNAL_TOKEN)
 */

let _availabilityCache = { at: 0, ok: false };

function _baseUrl() {
  return (process.env.HERMES_AGENT_URL || '').replace(/\/$/, '');
}

function _headers() {
  const token = process.env.HERMES_AGENT_TOKEN || '';
  return {
    'Content-Type': 'application/json',
    'X-Internal-Token': token,
  };
}

/** Sync gate for aiServiceFactory: URL + token set. Optional async probe updates cache. */
function isServiceAvailable() {
  return Boolean(_baseUrl() && process.env.HERMES_AGENT_TOKEN);
}

async function _probeHealthAsync() {
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

/** Optional: call before listing providers to confirm Agent is up (async). */
async function refreshAvailabilityCache() {
  const ok = await _probeHealthAsync();
  _availabilityCache = { at: Date.now(), ok };
  return ok;
}

function getAvailableModels() {
  const m = process.env.HERMES_DEFAULT_MODEL || 'llama3.2';
  return { text: [m], all: [m] };
}

function _notImplemented(name) {
  return { success: false, error: `Hermes adapter: ${name} is not implemented yet; use another provider for this step.` };
}

async function healthChat(message, context = '', options = {}) {
  const base = _baseUrl();
  if (!base || !process.env.HERMES_AGENT_TOKEN) {
    return { success: false, error: 'HERMES_AGENT_URL or HERMES_AGENT_TOKEN not configured' };
  }
  const language = options.language || 'zh';
  const body = {
    message,
    context: context || '',
    language: language === 'en' ? 'en' : 'zh',
    options: {
      model: options.model || undefined,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      stream: false,
    },
  };
  const url = `${base}/v1/chat`;
  const ac = new AbortController();
  const timeoutMs = Number(process.env.HERMES_CHAT_TIMEOUT_MS || 120000);
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: _headers(),
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { success: false, error: data.detail || data.error || `HTTP ${res.status}` };
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
  } catch (e) {
    return { success: false, error: e.message || String(e) };
  } finally {
    clearTimeout(timer);
  }
}

async function analyzeHealthRecords(healthData, options = {}) {
  void healthData;
  void options;
  return _notImplemented('analyzeHealthRecords');
}

async function analyzePDFDocument(base64PDF, options = {}) {
  void base64PDF;
  void options;
  return _notImplemented('analyzePDFDocument');
}

async function extractTextFromImage(base64Image, options = {}) {
  void base64Image;
  void options;
  return _notImplemented('extractTextFromImage');
}

async function analyzeImageWithAI(base64Image, prompt, options = {}) {
  void base64Image;
  void prompt;
  void options;
  return _notImplemented('analyzeImageWithAI');
}

async function analyzeDiet(foodItems, userHealthData = {}, options = {}) {
  void foodItems;
  void userHealthData;
  void options;
  return _notImplemented('analyzeDiet');
}

async function analyzeSymptoms(symptoms, userProfile = {}, options = {}) {
  void symptoms;
  void userProfile;
  void options;
  return _notImplemented('analyzeSymptoms');
}

async function checkDrugInteractions(medications, options = {}) {
  void medications;
  void options;
  return _notImplemented('checkDrugInteractions');
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
