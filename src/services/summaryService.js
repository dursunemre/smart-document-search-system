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
    const modelName = process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp';

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

module.exports = { generateShortSummary };

