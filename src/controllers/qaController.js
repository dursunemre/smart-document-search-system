/**
 * Q&A controller
 * Handles question-answering requests
 */
const retrievalService = require('../services/retrievalService');
const geminiService = require('../services/geminiService');
const AppError = require('../errors/AppError');

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

    // Map Gemini citations to our format
    const citations = geminiResponse.citations.map(citation => {
      // Find matching chunk
      const chunk = chunks.find(c => 
        c.chunkId === citation.chunkId || 
        (c.docId === citation.docId && 
         c.startChar <= citation.startChar && 
         c.endChar >= citation.endChar)
      );

      if (chunk) {
        // Extract quote from chunk (max 200 chars)
        const quoteStart = Math.max(0, citation.startChar - chunk.startChar);
        const quoteEnd = Math.min(
          chunk.text.length,
          quoteStart + 200,
          citation.endChar - chunk.startChar
        );
        const quote = chunk.text.slice(quoteStart, quoteEnd).trim();

        return {
          docId: chunk.docId,
          docName: chunk.docName,
          chunkId: chunk.chunkId,
          startChar: chunk.startChar + quoteStart,
          endChar: chunk.startChar + quoteEnd,
          quote: quote || chunk.text.slice(0, 200).trim()
        };
      }

      // Fallback if chunk not found
      return {
        docId: citation.docId || '',
        docName: citation.docName || '',
        chunkId: citation.chunkId || '',
        startChar: citation.startChar || 0,
        endChar: citation.endChar || 0,
        quote: citation.quote || ''
      };
    });

    // Response
    res.status(200).json({
      question: question.trim(),
      answer: geminiResponse.answer,
      confidence: geminiResponse.confidence || 'medium',
      based_on_docs: citations,
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

