/**
 * Q&A controller
 * Handles question-answering requests
 */
const retrievalService = require('../services/retrievalService');
const geminiService = require('../services/geminiService');
const AppError = require('../errors/AppError');
const { buildBasedOnDocs } = require('../utils/citations');

function buildRetrievalFallbackAnswer(question, basedOnDocs) {
  const citations = Array.isArray(basedOnDocs) ? basedOnDocs : [];
  if (citations.length === 0) {
    return 'Bilmiyorum. Yeterli kaynak bulunamadı.';
  }

  const lines = [
    'LLM şu anda yanıt üretemedi. Dokümanlarda soruyla ilgili geçen bölümler:',
    ''
  ];

  for (const c of citations.slice(0, 3)) {
    const name = c.docName || c.docId || 'Doküman';
    const quote = (c.quote || '').toString().trim();
    lines.push(`- ${name}: ${quote ? `"${quote}"` : '(alıntı yok)'}`);
  }

  lines.push('');
  lines.push('Bu alıntılara göre yanıtı daraltmak istersen soruyu biraz daha spesifikleştirebilirsin.');
  return lines.join('\n');
}

function coercePlainAnswerText(value) {
  const s = (value == null) ? '' : String(value);
  const trimmed = s.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith('{') && trimmed.includes('"answer"')) {
    // Best-effort: extract answer field from a JSON-ish string
    const m = trimmed.match(/"answer"\s*:\s*"((?:\\.|[^"\\])*)"/s);
    if (m && typeof m[1] === 'string') {
      try {
        return JSON.parse(`"${m[1]}"`).trim();
      } catch (_) {
        return m[1].trim();
      }
    }
  }
  return trimmed;
}

/**
 * Answer a question using RAG
 */
exports.answerQuestion = async (req, res, next) => {
  try {
    const { question, topK = 6, docLimit = 15 } = req.body;

    // Validation
    if (!question || !question.trim()) {
      const error = new Error('Missing question');
      error.statusCode = 400;
      error.code = 'BAD_REQUEST';
      return next(error);
    }

    // Validate and sanitize parameters
    // Q&A intentionally searches across ALL documents (no docId filtering in UI)
    const safeTopK = Math.min(Math.max(parseInt(topK) || 6, 1), 10);
    const safeDocLimit = Math.min(Math.max(parseInt(docLimit) || 15, 1), 25);

    // Retrieve relevant chunks
    const chunks = await retrievalService.retrieveChunks(
      question.trim(),
      safeDocLimit,
      safeTopK,
      null
    );

    // If no chunks found, return early
    if (chunks.length === 0) {
      return res.status(200).json({
        question: question.trim(),
        answer: 'Bilmiyorum. Yeterli kaynak bulunamadı.',
        confidence: 'low',
        based_on_docs: [],
        retrieval: {
          docLimit: safeDocLimit,
          topK: safeTopK
        }
      });
    }

    // Generate answer using Gemini
    let geminiResponse;
    try {
      geminiResponse = await geminiService.generateAnswer(question.trim(), chunks);
    } catch (error) {
      // Instead of failing the whole UX, return a retrieval-based fallback answer.
      // The UI still gets "based_on_docs" so the user can see which documents were used.
      let basedOnDocsFallback = [];
      try {
        basedOnDocsFallback = buildBasedOnDocs({
          llmCitations: null,
          retrievedChunks: chunks,
          maxCitations: 3
        });
      } catch (_) {
        basedOnDocsFallback = [];
      }

      return res.status(200).json({
        question: question.trim(),
        answer: buildRetrievalFallbackAnswer(question.trim(), basedOnDocsFallback),
        confidence: 'low',
        based_on_docs: basedOnDocsFallback,
        retrieval: {
          docLimit: safeDocLimit,
          topK: safeTopK
        },
        llm: {
          used: false,
          error: 'LLM_ERROR'
        }
      });
    }

    // Build standardized citations:
    // - validates LLM citations against retrieval (discard hallucinated docId/chunkId)
    // - falls back to top retrieved chunks if citations are missing/invalid
    let basedOnDocs = [];
    try {
      basedOnDocs = buildBasedOnDocs({
        llmCitations: geminiResponse && Array.isArray(geminiResponse.citations) ? geminiResponse.citations : null,
        retrievedChunks: chunks,
        maxCitations: 3
      });
    } catch (_) {
      basedOnDocs = [];
    }

    // Response
    res.status(200).json({
      question: question.trim(),
      answer: coercePlainAnswerText(geminiResponse.answer),
      confidence: geminiResponse.confidence || 'medium',
      based_on_docs: basedOnDocs,
      retrieval: {
        docLimit: safeDocLimit,
        topK: safeTopK
      },
      llm: {
        used: true,
        model: geminiResponse.model || null
      }
    });
  } catch (error) {
    // If it's already a formatted error, pass it through
    if (error.statusCode && error.code) {
      return next(error);
    }

    // Unexpected error
    const internalError = new Error('Internal server error');
    internalError.statusCode = 500;
    internalError.code = 'INTERNAL_ERROR';
    return next(internalError);
  }
};

