/**
 * Chunk text into smaller pieces with overlap
 * @param {string} text - Text to chunk
 * @param {number} chunkSize - Target chunk size in characters
 * @param {number} overlap - Overlap size in characters
 * @returns {Array<{text: string, startChar: number, endChar: number}>}
 */
function chunkText(text, chunkSize = 1000, overlap = 100) {
  if (!text || text.length === 0) {
    return [];
  }

  const chunks = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const chunkText = text.slice(start, end);

    chunks.push({
      text: chunkText,
      startChar: start,
      endChar: end
    });

    // Move forward by chunkSize - overlap
    start += chunkSize - overlap;

    // Prevent infinite loop
    if (start >= text.length) {
      break;
    }
  }

  return chunks;
}

module.exports = { chunkText };

