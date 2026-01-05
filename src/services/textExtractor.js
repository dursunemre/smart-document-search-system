const fs = require('fs');
const AppError = require('../errors/AppError');
const { normalizeText } = require('../utils/textNormalize');

const MIN_TEXT_LENGTH = 20;
const SUPPORTED_MIME_TYPES = new Set(['application/pdf', 'text/plain']);

async function readTextFileUtf8Stream(filePath) {
  return new Promise((resolve, reject) => {
    let text = '';
    const stream = fs.createReadStream(filePath, { encoding: 'utf8' });

    stream.on('data', (chunk) => {
      text += chunk;
    });
    stream.on('end', () => resolve(text));
    stream.on('error', (err) => reject(err));
  });
}

/**
 * Extract text from file based on MIME type
 * @param {{ path: string, mimeType: string }} params
 * @returns {Promise<{ text: string, charCount: number }>}
 */
async function extractTextFromFile({ path, mimeType }) {
  if (!path) {
    throw new AppError({ statusCode: 400, code: 'NO_FILE', message: 'No file uploaded' });
  }

  if (!SUPPORTED_MIME_TYPES.has(mimeType)) {
    throw new AppError({ statusCode: 415, code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Unsupported file type' });
  }

  let rawText = '';

  if (mimeType === 'text/plain') {
    try {
      rawText = await readTextFileUtf8Stream(path);
    } catch (cause) {
      throw new AppError({ statusCode: 422, code: 'UNPROCESSABLE', message: 'TXT could not be processed', cause });
    }
  } else if (mimeType === 'application/pdf') {
    const pdfParseModule = require('pdf-parse');
    const pdfParse = pdfParseModule && pdfParseModule.default ? pdfParseModule.default : pdfParseModule;
    try {
      const buffer = await fs.promises.readFile(path);
      const result = await pdfParse(buffer);
      rawText = result && typeof result.text === 'string' ? result.text : '';
    } catch (cause) {
      throw new AppError({ statusCode: 422, code: 'UNPROCESSABLE', message: 'PDF could not be parsed', cause });
    }
  }

  const text = normalizeText(rawText);
  const charCount = text.length;

  if (charCount < MIN_TEXT_LENGTH) {
    throw new AppError({
      statusCode: 422,
      code: 'EMPTY_OR_TOO_SHORT',
      message: 'No extractable text (scanned PDF?)'
    });
  }

  return { text, charCount };
}

module.exports = { extractTextFromFile };


