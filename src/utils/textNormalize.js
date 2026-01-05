/**
 * Normalize extracted text
 * - Trim leading/trailing whitespace
 * - Collapse multiple whitespace into single spaces
 * @param {string} text
 * @returns {string}
 */
function normalizeText(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = { normalizeText };


