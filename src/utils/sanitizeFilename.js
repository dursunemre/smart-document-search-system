const path = require('path');

/**
 * Filename sanitizer
 * - Prevents path traversal
 * - Removes special characters
 * - Replaces spaces with hyphens
 */
const sanitizeFilename = (originalName) => {
  // Only keep the base name to prevent path traversal via ../
  const name = path.basename(originalName);
  
  // Replace anything that is not alphanumeric, dot, or hyphen with a hyphen
  // This ensures no spaces, special chars, or slashes remain
  return name.replace(/[^a-zA-Z0-9.-]/g, '-');
};

module.exports = sanitizeFilename;

