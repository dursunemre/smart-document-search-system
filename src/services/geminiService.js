/**
 * Gemini AI service
 * Handles communication with Google Gemini API
 */
const { GoogleGenerativeAI } = require('@google/generative-ai');

let genAI = null;
let model = null;

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

  const modelName = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  
  if (!model) {
    model = genAI.getGenerativeModel({ 
      model: modelName,
      systemInstruction: 'Sen bir doküman tabanlı soru-cevap asistanısın. Sadece verilen bağlama (context) dayanarak cevap ver. Bağlamda bilgi yoksa "Bilmiyorum" de. Asla uydurma veya varsayım yapma. Cevabını JSON formatında döndür.',
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 700,
        responseMimeType: 'application/json'
      }
    });
  }

  return model;
}

/**
 * Generate answer from context and question
 * @param {string} question - User question
 * @param {Array<Object>} chunks - Context chunks with metadata
 * @returns {Promise<Object>} - Generated answer with citations
 */
async function generateAnswer(question, chunks) {
  try {
    const geminiModel = initializeGemini();

    // Build context from chunks
    const contextParts = chunks.map((chunk, index) => {
      return `[Chunk ${index + 1} - Document: ${chunk.docName}]\n${chunk.text}`;
    }).join('\n\n---\n\n');

    const userPrompt = `Soru: ${question}\n\nBağlam:\n${contextParts}\n\nLütfen aşağıdaki JSON formatında cevap ver:\n{\n  "answer": "cevabın buraya",\n  "citations": [\n    {\n      "docId": "doküman-id",\n      "docName": "doküman-adı",\n      "chunkId": "chunk-id",\n      "startChar": 0,\n      "endChar": 100,\n      "quote": "alıntı metni (max 200 karakter)"\n    }\n  ],\n  "confidence": "low|medium|high"\n}`;

    const result = await geminiModel.generateContent(userPrompt);

    const response = result.response;
    const text = response.text();

    // Try to parse JSON response
    let parsedResponse;
    try {
      // Remove markdown code blocks if present
      const cleanedText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsedResponse = JSON.parse(cleanedText);
    } catch (parseError) {
      // If JSON parsing fails, return a safe fallback instead of failing the whole request
      // (Controller will still build citations from retrieval as needed.)
      return {
        answer: (text || '').toString().trim(),
        citations: [],
        confidence: 'low',
        parseError: true
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

    return parsedResponse;
  } catch (error) {
    // Re-throw with more context
    if (error.message.includes('GEMINI_API_KEY')) {
      throw new Error('GEMINI_API_KEY is not set');
    }
    throw error;
  }
}

module.exports = { generateAnswer, initializeGemini };

