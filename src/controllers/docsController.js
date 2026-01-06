const path = require('path');
const fs = require('fs');
const hashFile = require('../utils/hashFile');
const documentsRepo = require('../repositories/documentsRepo');
const textExtractor = require('../services/textExtractor');
const { generateShortSummary, generateLongSummary } = require('../services/summaryService');
const AppError = require('../errors/AppError');

/**
 * Upload a document
 */
exports.uploadDocument = async (req, res, next) => {
  if (!req.file) {
    const error = new Error('No file uploaded');
    error.statusCode = 400;
    error.code = 'NO_FILE';
    return next(error);
  }

  try {
    const { filename, originalname, mimetype, size, path: storedPath } = req.file;

    // Extra safety: validate MIME here too (multer should already filter)
    if (mimetype !== 'application/pdf' && mimetype !== 'text/plain') {
      try { fs.unlinkSync(storedPath); } catch (_) {}
      throw new AppError({ statusCode: 415, code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Unsupported file type' });
    }

    // Calculate SHA256 hash
    const sha256 = await hashFile(storedPath);

    // Check for duplicate
    const existingDoc = documentsRepo.getDocumentBySha256(sha256);
    if (existingDoc) {
      // Delete the uploaded file since it's a duplicate
      try { fs.unlinkSync(storedPath); } catch (_) {}
      
      const error = new Error('Duplicate document');
      error.statusCode = 409;
      error.code = 'DUPLICATE_DOC';
      return next(error);
    }

    // Extract text (PDF/TXT)
    let extracted = null;
    try {
      extracted = await textExtractor.extractTextFromFile({ path: storedPath, mimeType: mimetype });
    } catch (err) {
      // On extraction failures, remove the uploaded file to avoid storing unusable content
      try { fs.unlinkSync(storedPath); } catch (_) {}
      throw err;
    }

    // Create document record in database
    const doc = documentsRepo.createDocument({
      originalName: originalname,
      storedName: filename,
      storedPath: storedPath,
      mimeType: mimetype,
      size: size,
      sha256: sha256,
      contentText: extracted ? extracted.text : null
    });

    const preview = extracted && extracted.text ? extracted.text.slice(0, 200) : '';
    res.status(201).json({
      ...doc,
      extractedText: {
        charCount: extracted ? extracted.charCount : 0,
        preview
      }
    });
  } catch (error) {
    // If it's already a formatted error, pass it through
    if (error.statusCode && error.code) {
      return next(error);
    }

    // Database error
    const dbError = new Error('Database error');
    dbError.statusCode = 500;
    dbError.code = 'DB_ERROR';
    return next(dbError);
  }
};

/**
 * List all uploaded documents
 */
exports.listDocuments = (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const documents = documentsRepo.listDocuments({ limit, offset });
    res.json(documents);
  } catch (error) {
    const dbError = new Error('Database error');
    dbError.statusCode = 500;
    dbError.code = 'DB_ERROR';
    return next(dbError);
  }
};

/**
 * Get document by ID
 */
exports.getDocument = (req, res, next) => {
  try {
    const { id } = req.params;
    const document = documentsRepo.getDocumentById(id);

    if (!document) {
      const error = new Error('Document not found');
      error.statusCode = 404;
      error.code = 'NOT_FOUND';
      return next(error);
    }

    res.json(document);
  } catch (error) {
    const dbError = new Error('Database error');
    dbError.statusCode = 500;
    dbError.code = 'DB_ERROR';
    return next(dbError);
  }
};

/**
 * Search documents by keyword
 */
exports.searchDocuments = (req, res, next) => {
  try {
    const q = req.query.q || '';
    const docId = req.query.docId || null;

    if (!q || !q.trim()) {
      const error = new Error('Missing query');
      error.statusCode = 400;
      error.code = 'BAD_REQUEST';
      return next(error);
    }

    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;

    // If docId is provided, validate it exists
    if (docId && docId.trim()) {
      const doc = documentsRepo.getDocumentById(docId.trim());
      if (!doc) {
        const error = new Error('Document not found');
        error.statusCode = 404;
        error.code = 'NOT_FOUND';
        return next(error);
      }
    }

    const result = documentsRepo.searchDocumentsByKeyword(q.trim(), { limit, offset, docId: docId ? docId.trim() : null });
    res.json(result);
  } catch (error) {
    // If it's already a formatted error, pass it through
    if (error.statusCode && error.code) {
      return next(error);
    }

    const dbError = new Error('Database error');
    dbError.statusCode = 500;
    dbError.code = 'DB_ERROR';
    return next(dbError);
  }
};

/**
 * Download a document by ID
 */
exports.downloadDocument = (req, res, next) => {
  try {
    const { id } = req.params;

    // Get document from database
    const document = documentsRepo.getDocumentById(id);

    if (!document) {
      const error = new Error('File not found');
      error.statusCode = 404;
      error.code = 'NOT_FOUND';
      return next(error);
    }

    // Check if file exists on disk
    if (!fs.existsSync(document.storedPath)) {
      const error = new Error('File not found on disk');
      error.statusCode = 404;
      error.code = 'NOT_FOUND';
      return next(error);
    }

    // Download with original filename
    res.download(document.storedPath, document.originalName);
  } catch (error) {
    const dbError = new Error('Database error');
    dbError.statusCode = 500;
    dbError.code = 'DB_ERROR';
    return next(dbError);
  }
};

/**
 * Generate short summary for a document
 */
exports.generateShortSummary = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Get document from database
    const document = documentsRepo.getDocumentById(id);

    if (!document) {
      const error = new Error('Document not found');
      error.statusCode = 404;
      error.code = 'NOT_FOUND';
      return next(error);
    }

    // Get text content
    let text = '';

    // Try to get from DB first
    if (document.contentText && document.contentText.trim().length > 0) {
      text = document.contentText;
    } else {
      // Extract from file
      try {
        const extracted = await textExtractor.extractTextFromFile({
          path: document.storedPath,
          mimeType: document.mimeType
        });
        text = extracted.text;
      } catch (extractError) {
        const error = new Error('Text extraction failed');
        error.statusCode = 422;
        error.code = 'EXTRACTION_FAILED';
        error.cause = extractError;
        return next(error);
      }
    }

    // Validate text
    if (!text || text.trim().length === 0) {
      const error = new Error('Text extraction failed');
      error.statusCode = 422;
      error.code = 'EXTRACTION_FAILED';
      return next(error);
    }

    // Generate summary using Gemini
    let summaryResult;
    try {
      summaryResult = await generateShortSummary({
        docId: document.id,
        text: text,
        docName: document.originalName
      });
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

    // Save summary to database
    const updatedDoc = documentsRepo.updateShortSummary(document.id, {
      summary: summaryResult.summary,
      model: summaryResult.model
    });

    // Response
    res.status(200).json({
      docId: updatedDoc.id,
      docName: updatedDoc.originalName,
      summaryShort: updatedDoc.summaryShort,
      model: updatedDoc.summaryShortModel,
      createdAt: updatedDoc.summaryShortCreatedAt
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

function parseLevelField(levelField) {
  if (!levelField || typeof levelField !== 'string') return { level: null, format: null };
  // stored as "level:format"
  const [level, format] = levelField.split(':');
  return { level: level || null, format: format || null };
}

/**
 * Generate long summary for a document (on-demand, cached)
 * POST /api/docs/:id/summary/long
 * body: { level?: "medium"|"long", format?: "structured"|"bullets" }
 */
exports.generateLongSummary = async (req, res, next) => {
  try {
    const { id } = req.params;
    const level = (req.body && req.body.level) ? String(req.body.level) : 'medium';
    const format = (req.body && req.body.format) ? String(req.body.format) : 'structured';

    const allowedLevels = new Set(['medium', 'long']);
    const allowedFormats = new Set(['structured', 'bullets']);

    if (!allowedLevels.has(level) || !allowedFormats.has(format)) {
      const error = new Error('Invalid level or format');
      error.statusCode = 400;
      error.code = 'BAD_REQUEST';
      return next(error);
    }

    const document = documentsRepo.getDocumentById(id);
    if (!document) {
      const error = new Error('Document not found');
      error.statusCode = 404;
      error.code = 'NOT_FOUND';
      return next(error);
    }

    // Cache behavior:
    // If summary_long exists AND matches requested level/format, return as-is.
    const cachedMeta = parseLevelField(document.summaryLongLevel);
    if (
      document.summaryLong &&
      typeof document.summaryLong === 'string' &&
      document.summaryLong.trim().length > 0 &&
      cachedMeta.level === level &&
      cachedMeta.format === format
    ) {
      return res.status(200).json({
        docId: document.id,
        docName: document.originalName,
        summaryLong: document.summaryLong,
        level,
        format,
        model: document.summaryLongModel || (process.env.GEMINI_MODEL || 'gemini-1.5-flash'),
        createdAt: document.summaryLongCreatedAt || null
      });
    }

    // Get text content (prefer DB)
    let text = '';
    if (document.contentText && document.contentText.trim().length > 0) {
      text = document.contentText;
    } else {
      try {
        const extracted = await textExtractor.extractTextFromFile({
          path: document.storedPath,
          mimeType: document.mimeType
        });
        text = extracted.text;
      } catch (extractError) {
        const error = new Error('Text extraction failed');
        error.statusCode = 422;
        error.code = 'EXTRACTION_FAILED';
        error.cause = extractError;
        return next(error);
      }
    }

    if (!text || text.trim().length === 0) {
      const error = new Error('Text extraction failed');
      error.statusCode = 422;
      error.code = 'EXTRACTION_FAILED';
      return next(error);
    }

    // Generate summary via Gemini
    let result;
    try {
      result = await generateLongSummary({
        docId: document.id,
        docName: document.originalName,
        text,
        level,
        format
      });
    } catch (error) {
      if (error.message.includes('GEMINI_API_KEY')) {
        const apiError = new Error('GEMINI_API_KEY is not configured');
        apiError.statusCode = 500;
        apiError.code = 'CONFIG_ERROR';
        return next(apiError);
      }

      const llmError = new Error('LLM error');
      llmError.statusCode = 502;
      llmError.code = 'LLM_ERROR';
      llmError.cause = error;
      return next(llmError);
    }

    const createdAt = new Date().toISOString();
    const updatedDoc = documentsRepo.updateLongSummary(document.id, {
      summary: result.summary,
      model: result.model,
      createdAt,
      level,
      format
    });

    return res.status(200).json({
      docId: updatedDoc.id,
      docName: updatedDoc.originalName,
      summaryLong: updatedDoc.summaryLong,
      level,
      format,
      model: updatedDoc.summaryLongModel,
      createdAt: updatedDoc.summaryLongCreatedAt
    });
  } catch (error) {
    if (error.statusCode && error.code) {
      return next(error);
    }
    const internalError = new Error('Internal server error');
    internalError.statusCode = 500;
    internalError.code = 'INTERNAL_ERROR';
    return next(internalError);
  }
};

