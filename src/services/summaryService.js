/**
 * Summary service
 * Generates short summaries using Gemini AI
 */
const { GoogleGenerativeAI } = require('@google/generative-ai');

let genAI = null;

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
 * Generate short summary for a document
 * @param {Object} params - Summary parameters
 * @param {string} params.docId - Document ID
 * @param {string} params.text - Document text content
 * @param {string} params.docName - Document name
 * @returns {Promise<Object>} - Generated summary with model info
 */
async function generateShortSummary({ docId, text, docName }) {
  try {
    const api = initializeGemini();
    const modelName = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

    // Limit text length to reduce LLM cost (first 12000 characters)
    const truncatedText = text.length > 12000 ? text.slice(0, 12000) + '...' : text;

    const model = api.getGenerativeModel({
      model: modelName,
      systemInstruction: 'Sen bir doküman özetleme asistanısın. Verilen metni kısa ve öz bir şekilde özetle. Metinde belirtilmeyen bilgileri uydurma. Eğer bir bilgi metinde yoksa "belirtilmemiş" de. Özeti JSON formatında döndür.',
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 500,
        responseMimeType: 'application/json'
      }
    });

    const prompt = `Aşağıdaki dokümanı kısa ve öz bir şekilde özetle. Özet 3-5 cümle veya 5-7 madde halinde olmalı. Maksimum 1200 karakter. Metinde olmayan bilgileri uydurma.

Doküman Adı: ${docName}

Metin:
${truncatedText}

Lütfen aşağıdaki JSON formatında özet döndür:
{
  "summary": "özet metni buraya"
}`;

    const result = await model.generateContent(prompt);
    const response = result.response;
    const textResponse = response.text();

    // Parse JSON response
    let parsedResponse;
    try {
      // Remove markdown code blocks if present
      const cleanedText = textResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsedResponse = JSON.parse(cleanedText);
    } catch (parseError) {
      // If JSON parsing fails, use the raw text as summary
      parsedResponse = {
        summary: textResponse.trim().slice(0, 1200)
      };
    }

    // Validate and truncate summary
    if (!parsedResponse.summary || typeof parsedResponse.summary !== 'string') {
      throw new Error('Invalid summary format from LLM');
    }

    // Ensure summary is within limit
    const summary = parsedResponse.summary.trim().slice(0, 1200);

    return {
      summary,
      model: modelName
    };
  } catch (error) {
    // Re-throw with more context
    if (error.message.includes('GEMINI_API_KEY')) {
      throw new Error('GEMINI_API_KEY is not set');
    }
    throw error;
  }
}

/**
 * Generate long/detailed summary for a document (on-demand)
 * @param {Object} params
 * @param {string} params.docId
 * @param {string} params.docName
 * @param {string} params.text
 * @param {"medium"|"long"} params.level
 * @param {"structured"|"bullets"} params.format
 * @returns {Promise<{summary: string, model: string, level: string, format: string}>}
 */
async function generateLongSummary({ docId, docName, text, level, format }) {
  try {
    const api = initializeGemini();
    const modelName = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

    const maxChars = 20000;
    const isTruncated = text.length > maxChars;
    const truncatedText = isTruncated ? text.slice(0, maxChars) : text;

    const summaryMax = level === 'long' ? 6000 : 2500;

    const model = api.getGenerativeModel({
      model: modelName,
      systemInstruction:
        "Sadece verilen metne dayan. Metinde olmayan bilgiyi uydurma. Belirtilmemişse 'belirtilmemiş' de. Cevabını JSON formatında döndür.",
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: level === 'long' ? 1400 : 900,
        responseMimeType: 'application/json'
      }
    });

    const shapeInstructions =
      level === 'long'
        ? `Seviye: long. Başlıklar halinde yaz: Amaç, Kapsam, Önemli Noktalar, Riskler/Limitler, Sonuç. Toplam uzunluk ~${summaryMax} karakteri aşmasın.`
        : `Seviye: medium. 6-10 madde + 1 paragraf sonuç üret. Toplam uzunluk ~${summaryMax} karakteri aşmasın.`;

    const formatInstructions =
      format === 'bullets'
        ? 'Format: bullets. Sadece madde madde yaz (satır başına "- "). Başlık ekleme.'
        : 'Format: structured. Başlıklar + maddeler (gerektiğinde) kullan.';

    const truncNote = isTruncated
      ? `NOT: Metin çok uzundu, sadece ilk ${maxChars} karakter gönderildi (kısmi metin). Özetinde bunu kısa bir not olarak belirt.`
      : '';

    const prompt = `Aşağıdaki doküman metni için detaylı özet üret.
${shapeInstructions}
${formatInstructions}
${truncNote}

Doküman Adı: ${docName}

Metin:
${truncatedText}

Lütfen aşağıdaki JSON formatında döndür:
{
  "summary": "....",
  "level": "${level}",
  "format": "${format}"
}`;

    const result = await model.generateContent(prompt);
    const response = result.response;
    const textResponse = response.text();

    let parsed;
    try {
      const cleanedText = textResponse.replace(/```json\\n?/g, '').replace(/```\\n?/g, '').trim();
      parsed = JSON.parse(cleanedText);
    } catch (_) {
      // fallback: use raw text as summary
      parsed = { summary: (textResponse || '').toString() };
    }

    let summary = typeof parsed.summary === 'string' ? parsed.summary : '';
    summary = summary.trim();
    if (summary.length > summaryMax) summary = summary.slice(0, summaryMax);

    if (!summary) {
      throw new Error('Invalid summary format from LLM');
    }

    return {
      summary,
      model: modelName,
      level,
      format
    };
  } catch (error) {
    if (error.message.includes('GEMINI_API_KEY')) {
      throw new Error('GEMINI_API_KEY is not set');
    }
    throw error;
  }
}

module.exports = { generateShortSummary, generateLongSummary };

