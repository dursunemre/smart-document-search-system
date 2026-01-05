/**
 * Normalize text for keyword extraction and matching
 * @param {string} text - Text to normalize
 * @returns {string} - Normalized text
 */
function normalizeText(text) {
  if (typeof text !== 'string') {
    return '';
  }

  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Extract keywords from text (remove very short words and common stop words)
 * @param {string} text - Text to extract keywords from
 * @returns {Array<string>} - Array of keywords
 */
function extractKeywords(text) {
  if (typeof text !== 'string') {
    return [];
  }

  const normalized = normalizeText(text);
  
  // Split by whitespace and filter
  const words = normalized
    .split(/\s+/)
    .filter(word => {
      // Remove very short words (less than 2 characters)
      if (word.length < 2) {
        return false;
      }
      
      // Remove common Turkish/English stop words (basic list)
      const stopWords = new Set([
        've', 'ile', 'bir', 'bu', 'şu', 'o', 'da', 'de', 'ki', 'mi', 'mu', 'mü',
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should'
      ]);
      
      return !stopWords.has(word);
    });

  return words;
}

module.exports = { normalizeText, extractKeywords };

