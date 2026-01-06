/**
 * Summary service
 * Generates document summaries using Gemini AI
 */
const { GoogleGenerativeAI } = require('@google/generative-ai');

let genAI = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getStatus(err) {
  return err && (err.status || err.statusCode);
}

let discoveredModelsCache = { expiresAt: 0, models: [] };

function stripModelsPrefix(name) {
  if (!name) return '';
  const s = String(name).trim();
  return s.startsWith('models/') ? s.slice('models/'.length) : s;
}

function rankModel(modelName) {
  const m = String(modelName || '').toLowerCase();
  // Higher is better
  let score = 0;
  // Prefer non-vision and non-embedding models for text summary
  if (m.includes('vision')) score -= 5;
  if (m.includes('embedding')) score -= 10;
  // Prefer flash for speed/cost
  if (m.includes('flash')) score += 5;
  // Prefer newer generations
  if (m.includes('gemini-3')) score += 6;
  if (m.includes('gemini-2')) score += 4;
  if (m.includes('gemini-1.5')) score += 2;
  // Avoid experimental/preview if possible (quota/instability)
  if (m.includes('preview') || m.includes('exp')) score -= 2;
  // Prefer "latest" aliases when available
  if (m.includes('latest')) score += 1;
  return score;
}

async function listModelsFromAPI(apiKey) {
  // Use REST ListModels so we only try models that actually exist for this API key.
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const e = new Error(`ListModels failed (${res.status})`);
    e.status = res.status;
    e.details = text;
    throw e;
  }
  const data = await res.json();
  const models = Array.isArray(data.models) ? data.models : [];
  return models
    .filter((m) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
    .map((m) => stripModelsPrefix(m.name))
    .filter((name) => name);
}

async function getModelCandidates(configuredModel, apiKey) {
  const configured = (configuredModel || '').trim();

  // Refresh cache every 10 minutes
  const now = Date.now();
  if (discoveredModelsCache.expiresAt <= now) {
    try {
      const discovered = await listModelsFromAPI(apiKey);
      discoveredModelsCache = {
        expiresAt: now + 10 * 60 * 1000,
        models: discovered
      };
    } catch (_) {
      // If discovery fails, keep old cache (or empty) and fall back to static guesses
      discoveredModelsCache = {
        expiresAt: now + 2 * 60 * 1000,
        models: discoveredModelsCache.models || []
      };
    }
  }

  const discovered = Array.isArray(discoveredModelsCache.models) ? discoveredModelsCache.models : [];

  // If we have discovered models, build candidates from them.
  if (discovered.length > 0) {
    const set = new Set(discovered);
    const candidates = [];

    // Prefer configured model if it exists
    if (configured && set.has(configured)) candidates.push(configured);

    // Prefer best-ranked discovered models next
    const ranked = discovered
      .slice()
      .sort((a, b) => rankModel(b) - rankModel(a));

    for (const m of ranked) {
      if (!candidates.includes(m)) candidates.push(m);
      if (candidates.length >= 8) break;
    }

    return candidates;
  }

  // Fallback static guesses (kept short)
  const fallback = [
    configured,
    'gemini-3-flash-preview',
    'gemini-3-flash',
    'gemini-2.0-flash',
    'gemini-1.5-flash-latest'
  ].filter((m) => m && String(m).trim());

  return Array.from(new Set(fallback.map((s) => String(s).trim())));
}

function parseRetryDelaySeconds(value) {
  if (!value) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.floor(value));
  const s = String(value).trim();
  // common formats: "2s", "2.4s"
  const m = s.match(/^(\d+(?:\.\d+)?)s$/i);
  if (m) return Math.max(0, Math.ceil(parseFloat(m[1])));
  return null;
}

function getRetryAfterSeconds(err) {
  // GoogleGenerativeAIFetchError often has errorDetails containing RetryInfo
  const details = err && err.errorDetails;
  if (Array.isArray(details)) {
    for (const d of details) {
      if (!d) continue;
      const t = d['@type'] || d.type || '';
      const retryDelay = d.retryDelay || d.retry_delay;
      if (String(t).includes('RetryInfo') && retryDelay) {
        const sec = parseRetryDelaySeconds(retryDelay);
        if (sec != null) return sec;
      }
    }
  }

  // fallback: try to parse "Please retry in Xs." from message
  const msg = (err && err.message) ? String(err.message) : '';
  const m = msg.match(/Please retry in\s+(\d+(?:\.\d+)?)s/i);
  if (m) return Math.max(0, Math.ceil(parseFloat(m[1])));
  return null;
}

function countSentenceEndings(text) {
  if (!text) return 0;
  const m = String(text).match(/[.!?]/g);
  return m ? m.length : 0;
}

function isAcceptableSummary(text) {
  const s = (text || '').toString().trim();
  if (s.length < 140) return false; // too short for 3-4 explanatory sentences (TR)
  // Require at least ~2 sentence endings; some texts may end with a single '.' but still 3-4 sentences is expected.
  if (countSentenceEndings(s) < 2) return false;
  return true;
}

/**
 * Initialize Gemini client for summary generation
 */
function initializeGemini() {
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set in environment variables');
  }

  if (!genAI) {
    genAI = new GoogleGenerativeAI(apiKey);
  }

  return genAI;
}

/**
 * Generate summary for a document (3-4 sentences)
 * @param {{ docId: string, text: string, docName: string }} params
 * @returns {Promise<{ summary: string, model: string }>}
 */
async function generateSummary({ docId, text, docName }) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    const api = initializeGemini();
    const configuredModel = (process.env.GEMINI_MODEL || '').trim();
    const candidates = await getModelCandidates(configuredModel, apiKey);

    // Limit text length to reduce LLM cost
    const maxChars = 20000;
    const truncatedText = text.length > maxChars ? text.slice(0, maxChars) : text;

    async function runWithModel(modelName, { promptOverride } = {}) {
      const model = api.getGenerativeModel({
        model: modelName,
        systemInstruction:
          'Sen bir doküman özetleme asistanısın. Sadece verilen metne dayan. Metinde olmayan bilgileri uydurma. Çıktı olarak SADECE özet metnini yaz.',
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 700
        }
      });

      const prompt = promptOverride || `Aşağıdaki dokümanı Türkçe 3-4 cümle ile, açıklayıcı biçimde özetle.
- En az 3 cümle olmalı.
- Toplam 300-900 karakter aralığında hedefle.
- Her cümle tam olsun ve özet nokta ile bitsin.
- Sadece özet metnini yaz; JSON, markdown, başlık ya da madde işareti ekleme.

Doküman Adı: ${docName}

Metin:
${truncatedText}
`;

      const result = await model.generateContent(prompt);
      const response = result.response;
      const textResponse = (response && typeof response.text === 'function') ? response.text() : '';

      const summary = (textResponse || '').toString().trim();
      if (!summary) throw new Error('Empty response from LLM');

      // Soft limit to avoid extremely long outputs
      const maxSummaryChars = 1200;
      const clipped = summary.length > maxSummaryChars ? summary.slice(0, maxSummaryChars) : summary;

      return { summary: clipped, model: modelName };
    }

    let lastErr = null;
    for (const modelName of candidates) {
      try {
        let result = await runWithModel(modelName);

        if (!isAcceptableSummary(result.summary)) {
          // one stricter retry on the same model (cheap; avoids switching models too often)
          result = await runWithModel(modelName, {
            promptOverride: `Aşağıdaki dokümanı Türkçe 4 cümle ile, açıklayıcı biçimde özetle. Her cümle tamamlanmış olmalı ve nokta ile bitmeli. Sadece özet metnini yaz.

Doküman Adı: ${docName}

Metin:
${truncatedText}
`
          });
        }

        // If still too short, try next model
        if (!isAcceptableSummary(result.summary)) {
          lastErr = new Error('Summary too short');
          continue;
        }

        return result;
      } catch (err) {
        lastErr = err;
        const status = getStatus(err);

        // 404: model not found / not supported -> try next candidate
        if (status === 404) continue;

        // 429: rate limit / quota -> short wait+retry once on same model, then try next
        if (status === 429) {
          const retryAfterSec = getRetryAfterSeconds(err);
          if (retryAfterSec != null && retryAfterSec > 0 && retryAfterSec <= 5) {
            await sleep(retryAfterSec * 1000);
            try {
              return await runWithModel(modelName);
            } catch (e2) {
              lastErr = e2;
            }
          }
          continue;
        }

        // 5xx transient -> try next candidate
        if (status === 500 || status === 503) continue;

        // other errors: bail out
        throw err;
      }
    }

    // If we exhausted candidates, propagate last error
    throw lastErr || new Error('LLM failed');
  } catch (error) {
    if (error.message.includes('GEMINI_API_KEY')) {
      throw new Error('GEMINI_API_KEY is not set');
    }
    throw error;
  }
}

module.exports = { generateSummary };

