/**
 * Q&A controller
 * Handles question-answering requests
 */
const retrievalService = require('../services/retrievalService');
const geminiService = require('../services/geminiService');
const AppError = require('../errors/AppError');
const { buildBasedOnDocs } = require('../utils/citations');

/**
 * Answer a question using RAG
 */
exports.answerQuestion = async (req, res, next) => {
  try {
    const { question, topK = 5, docLimit = 5 } = req.body;

    // Validation
    if (!question || !question.trim()) {
      const error = new Error('Missing question');
      error.statusCode = 400;
      error.code = 'BAD_REQUEST';
      return next(error);
    }

    // Validate and sanitize parameters
    const safeTopK = Math.min(Math.max(parseInt(topK) || 5, 1), 8);
    const safeDocLimit = Math.min(Math.max(parseInt(docLimit) || 5, 1), 10);

    // Retrieve relevant chunks
    const chunks = await retrievalService.retrieveChunks(
      question.trim(),
      safeDocLimit,
      safeTopK
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
      // Check if it's an API key error
      if (error.message.includes('GEMINI_API_KEY')) {
        const apiError = new Error('GEMINI_API_KEY is not configured');
        apiError.statusCode = 500;
        apiError.code = 'CONFIG_ERROR';
        return next(apiError);
      }

      // Other Gemini errors
      const llmError = new Error('LLM error');
      llmError.statusCode = 502;
      llmError.code = 'LLM_ERROR';
      llmError.cause = error;
      return next(llmError);
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
      answer: geminiResponse.answer,
      confidence: geminiResponse.confidence || 'medium',
      based_on_docs: basedOnDocs,
      retrieval: {
        docLimit: safeDocLimit,
        topK: safeTopK
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

