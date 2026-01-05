/**
 * Citations utilities
 *
 * NOTE: We explicitly DISCARD any LLM-provided citations that do not match
 * retrieved chunks (docId/chunkId). This prevents hallucinated sources.
 */

/**
 * Sanitize quote text:
 * - newlines/tabs -> spaces
 * - collapse whitespace
 * - trim
 * - max 200 chars
 * @param {string} text
 * @param {number} [maxLen=200]
 * @returns {string}
 */
function sanitizeQuote(text, maxLen = 200) {
  if (typeof text !== 'string') return '';
  const cleaned = text.replace(/\s+/g, ' ').trim();
  return cleaned.length > maxLen ? cleaned.slice(0, maxLen) : cleaned;
}

function isFiniteNumber(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

function findMatchingChunk(c, retrievedChunks) {
  if (!Array.isArray(retrievedChunks) || retrievedChunks.length === 0) return null;

  // Strongest match: chunkId
  if (c && typeof c.chunkId === 'string' && c.chunkId) {
    return retrievedChunks.find((ch) => ch.chunkId === c.chunkId) || null;
  }

  // Secondary: docId + start/end char range
  if (c && typeof c.docId === 'string' && c.docId) {
    const start = isFiniteNumber(c.startChar) ? c.startChar : null;
    const end = isFiniteNumber(c.endChar) ? c.endChar : null;
    if (start !== null && end !== null) {
      return (
        retrievedChunks.find(
          (ch) =>
            ch.docId === c.docId &&
            isFiniteNumber(ch.startChar) &&
            isFiniteNumber(ch.endChar) &&
            ch.startChar <= start &&
            ch.endChar >= end
        ) || null
      );
    }
  }

  return null;
}

/**
 * Validate an LLM citation against retrieved chunks; fill missing fields using retrieved chunk.
 * Returns null if the citation doesn't match retrieval (discard hallucinations).
 *
 * @param {Object} c
 * @param {Array<Object>} retrievedChunks
 * @returns {Object|null}
 */
function validateCitation(c, retrievedChunks) {
  if (!c || typeof c !== 'object') return null;

  const chunk = findMatchingChunk(c, retrievedChunks);
  if (!chunk) {
    // DISCARD: LLM hallucinated docId/chunkId not present in retrieval
    return null;
  }

  const startChar = isFiniteNumber(c.startChar)
    ? Math.max(chunk.startChar, c.startChar)
    : chunk.startChar;
  const endChar = isFiniteNumber(c.endChar)
    ? Math.min(chunk.endChar, c.endChar)
    : chunk.endChar;

  // Build quote preference order:
  // 1) LLM quote
  // 2) slice from chunk text using start/end if valid
  // 3) chunk preview
  let quote = sanitizeQuote(c.quote || '');

  if (!quote && typeof chunk.text === 'string' && chunk.text) {
    const localStart = Math.max(0, startChar - chunk.startChar);
    const localEnd = Math.min(chunk.text.length, Math.max(localStart, endChar - chunk.startChar));
    const sliced = chunk.text.slice(localStart, localEnd);
    quote = sanitizeQuote(sliced);

    if (!quote) {
      quote = sanitizeQuote(chunk.text.slice(0, 200));
    }
  }

  return {
    docId: chunk.docId,
    docName: chunk.docName,
    chunkId: chunk.chunkId,
    startChar: startChar,
    endChar: Math.max(startChar, endChar),
    quote
  };
}

/**
 * Build standardized `based_on_docs` array for Q&A response.
 * - Uses validated LLM citations if available
 * - Falls back to top retrieved chunks (max 3) if LLM citations missing/invalid
 *
 * @param {Object} params
 * @param {Array<Object>|null|undefined} params.llmCitations
 * @param {Array<Object>} params.retrievedChunks
 * @param {number} [params.maxCitations=3]
 * @returns {Array<Object>}
 */
function buildBasedOnDocs({ llmCitations, retrievedChunks, maxCitations = 3 }) {
  try {
    const safeRetrieved = Array.isArray(retrievedChunks) ? retrievedChunks : [];
    const limit = Math.max(0, Math.min(parseInt(maxCitations) || 3, 10));

    // 1) If LLM provided citations, validate them
    if (Array.isArray(llmCitations) && llmCitations.length > 0) {
      const validated = [];
      const seen = new Set();

      for (const c of llmCitations) {
        const v = validateCitation(c, safeRetrieved);
        if (!v) continue;
        if (seen.has(v.chunkId)) continue;
        seen.add(v.chunkId);
        validated.push(v);
        if (validated.length >= limit) break;
      }

      if (validated.length > 0) return validated;
      // If all LLM citations were invalid/hallucinated, fall back to retrieval
    }

    // 2) Fallback: use top retrieved chunks (up to limit)
    return safeRetrieved.slice(0, limit).map((ch) => ({
      docId: ch.docId,
      docName: ch.docName,
      chunkId: ch.chunkId,
      startChar: ch.startChar,
      endChar: ch.endChar,
      quote: sanitizeQuote(typeof ch.text === 'string' ? ch.text.slice(0, 200) : '')
    }));
  } catch (_) {
    // Never crash the system on citation building
    return [];
  }
}

module.exports = {
  sanitizeQuote,
  validateCitation,
  buildBasedOnDocs
};


