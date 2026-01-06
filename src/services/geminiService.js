/**
 * Gemini AI service
 * Handles communication with Google Gemini API
 */
const { GoogleGenerativeAI } = require('@google/generative-ai');

let genAI = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getStatus(err) {
  return err && (err.status || err.statusCode);
}

function parseRetryDelaySeconds(value) {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const s = String(value).trim();
  // Gemini sometimes returns "1s"
  const m = s.match(/^(\d+(?:\.\d+)?)s$/i);
  if (m) return Number(m[1]);
  const n = Number(s);
  if (Number.isFinite(n)) return n;
  return null;
}

function getRetryAfterSeconds(err) {
  try {
    // @google/generative-ai: errorDetails may include RetryInfo.retryDelay
    const details = err && err.errorDetails;
    if (Array.isArray(details)) {
      for (const d of details) {
        if (d && d['@type'] && String(d['@type']).includes('google.rpc.RetryInfo')) {
          const sec = parseRetryDelaySeconds(d.retryDelay);
          if (sec != null) return sec;
        }
      }
    }
  } catch (_) {}

  // Some fetch errors include headers / retry-after
  const retryAfter = err && (err.retryAfter || (err.response && err.response.headers && err.response.headers['retry-after']));
  const parsed = parseRetryDelaySeconds(retryAfter);
  return parsed != null ? parsed : null;
}

let discoveredModelsCache = { expiresAt: 0, models: [] };

function stripModelsPrefix(name) {
  if (!name) return '';
  const s = String(name).trim();
  return s.startsWith('models/') ? s.slice('models/'.length) : s;
}

function rankModel(modelName) {
  const m = String(modelName || '').toLowerCase();
  let score = 0;
  if (m.includes('vision')) score -= 5;
  if (m.includes('embedding')) score -= 10;
  if (m.includes('flash')) score += 5;
  if (m.includes('gemini-3')) score += 6;
  if (m.includes('gemini-2')) score += 4;
  if (m.includes('gemini-1.5')) score += 2;
  if (m.includes('preview') || m.includes('exp')) score -= 2;
  if (m.includes('latest')) score += 1;
  return score;
}

async function listModelsFromAPI(apiKey) {
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
  const now = Date.now();

  // Refresh cache every 10 minutes
  if (discoveredModelsCache.expiresAt <= now) {
    try {
      const discovered = await listModelsFromAPI(apiKey);
      discoveredModelsCache = { expiresAt: now + 10 * 60 * 1000, models: discovered };
    } catch (_) {
      discoveredModelsCache = { expiresAt: now + 2 * 60 * 1000, models: discoveredModelsCache.models || [] };
    }
  }

  const discovered = Array.isArray(discoveredModelsCache.models) ? discoveredModelsCache.models : [];
  if (discovered.length > 0) {
    const set = new Set(discovered);
    const candidates = [];
    if (configured && set.has(configured)) candidates.push(configured);
    const ranked = discovered.slice().sort((a, b) => rankModel(b) - rankModel(a));
    for (const m of ranked) {
      if (!candidates.includes(m)) candidates.push(m);
      if (candidates.length >= 8) break;
    }
    return candidates;
  }

  const fallback = [
    configured,
    'gemini-3-flash',
    'gemini-2.0-flash',
    'gemini-1.5-flash-latest',
    'gemini-1.5-flash'
  ].filter((m) => m && String(m).trim());

  return Array.from(new Set(fallback.map((s) => String(s).trim())));
}

function stripCodeFences(text) {
  const t = (text || '').toString();
  return t.replace(/```json\n?/gi, '').replace(/```\n?/g, '').trim();
}

function tryParseJsonFromText(text) {
  const cleaned = stripCodeFences(text);
  if (!cleaned) return null;

  // 1) Direct parse
  try {
    return JSON.parse(cleaned);
  } catch (_) {}

  // 2) Try to locate JSON object inside the text (e.g., extra prose before/after)
  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) {
    const maybe = cleaned.slice(first, last + 1);
    try {
      return JSON.parse(maybe);
    } catch (_) {}
  }

  return null;
}

function normalizeAnswerText(text) {
  const cleaned = stripCodeFences(text);
  // If model returned JSON but we failed to parse, try best-effort extract answer field
  if (cleaned.includes('"answer"') && cleaned.includes('{')) {
    const obj = tryParseJsonFromText(cleaned);
    if (obj && typeof obj.answer === 'string') return obj.answer.trim();

    // If JSON is incomplete/truncated, attempt regex-based extraction of the "answer" string.
    // Matches: "answer": "...." (handles escaped quotes/newlines via JSON string escaping)
    const m = cleaned.match(/"answer"\s*:\s*"((?:\\.|[^"\\])*)"/s);
    if (m && typeof m[1] === 'string') {
      try {
        // Unescape JSON string safely
        return JSON.parse(`"${m[1]}"`).trim();
      } catch (_) {
        return m[1].trim();
      }
    }
  }

  // Fallback: return cleaned plain text
  return cleaned;
}

/**
 * Initialize Gemini client
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
 * Generate answer from context and question
 * @param {string} question - User question
 * @param {Array<Object>} chunks - Context chunks with metadata
 * @returns {Promise<Object>} - Generated answer with citations
 */
async function generateAnswer(question, chunks) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    const api = initializeGemini();

    const systemInstruction =
      'Sen bir doküman tabanlı soru-cevap asistanısın. Sadece verilen bağlama (context) dayanarak cevap ver. ' +
      'Bağlamda bilgi yoksa "Bilmiyorum" de. Asla uydurma veya varsayım yapma. Cevabını JSON formatında döndür.';

    // Build context from chunks
    const contextParts = chunks.map((chunk, index) => {
      return `[Chunk ${index + 1} - Document: ${chunk.docName}]\n${chunk.text}`;
    }).join('\n\n---\n\n');

    const userPrompt = `Soru: ${question}\n\nBağlam:\n${contextParts}\n\nLütfen aşağıdaki JSON formatında cevap ver:\n{\n  "answer": "cevabın buraya",\n  "citations": [\n    {\n      "docId": "doküman-id",\n      "docName": "doküman-adı",\n      "chunkId": "chunk-id",\n      "startChar": 0,\n      "endChar": 100,\n      "quote": "alıntı metni (max 200 karakter)"\n    }\n  ],\n  "confidence": "low|medium|high"\n}`;

    const configuredModel = process.env.GEMINI_MODEL || '';
    const modelCandidates = await getModelCandidates(configuredModel, apiKey);

    let lastErr = null;
    for (const modelName of modelCandidates) {
      try {
        const geminiModel = api.getGenerativeModel({
          model: modelName,
          systemInstruction,
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 800
            // responseMimeType: 'application/json'  // keep it flexible; we parse JSON from text anyway
          }
        });

        const result = await geminiModel.generateContent(userPrompt);

        const response = result.response;
        const text = response.text();

        // Try to parse JSON response
        const parsedResponse = tryParseJsonFromText(text);
        if (!parsedResponse) {
          // If JSON parsing fails, return a safe fallback instead of failing the whole request
          // (Controller will still build citations from retrieval as needed.)
          return {
            answer: normalizeAnswerText(text),
            citations: [],
            confidence: 'low',
            parseError: true,
            model: modelName
          };
        }

        // Validate response structure
        if (!parsedResponse.answer) {
          throw new Error('LLM response missing "answer" field');
        }

        // Ensure citations array exists
        if (!Array.isArray(parsedResponse.citations)) {
          parsedResponse.citations = [];
        }

        // Ensure confidence exists
        if (!parsedResponse.confidence) {
          parsedResponse.confidence = 'medium';
        }

        parsedResponse.model = modelName;
        return parsedResponse;
      } catch (err) {
        lastErr = err;
        const status = getStatus(err);

        // Try next model on 404/Not Found
        if (status === 404) continue;

        // Retry quickly on 429, else try next model
        if (status === 429) {
          const retryAfter = getRetryAfterSeconds(err);
          if (retryAfter != null && retryAfter > 0 && retryAfter <= 5) {
            await sleep(retryAfter * 1000);
            try {
              // one retry on same model
              const geminiModel = api.getGenerativeModel({
                model: modelName,
                systemInstruction,
                generationConfig: { temperature: 0.2, maxOutputTokens: 800 }
              });
              const retryResult = await geminiModel.generateContent(userPrompt);
              const retryText = retryResult.response.text();
              const parsed = tryParseJsonFromText(retryText);
              if (!parsed) {
                return {
                  answer: normalizeAnswerText(retryText),
                  citations: [],
                  confidence: 'low',
                  parseError: true,
                  model: modelName
                };
              }
              if (!parsed.confidence) parsed.confidence = 'medium';
              if (!Array.isArray(parsed.citations)) parsed.citations = [];
              parsed.model = modelName;
              return parsed;
            } catch (_) {
              continue;
            }
          }
          continue;
        }
      }
    }

    if (lastErr) throw lastErr;
    throw new Error('LLM failed to generate an answer');
  } catch (error) {
    // Re-throw with more context
    if (error.message.includes('GEMINI_API_KEY')) {
      throw new Error('GEMINI_API_KEY is not set');
    }
    throw error;
  }
}

module.exports = { generateAnswer, initializeGemini };

