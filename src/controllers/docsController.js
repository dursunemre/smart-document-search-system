const path = require('path');
const fs = require('fs');
const db = require('../db');
const hashFile = require('../utils/hashFile');
const documentsRepo = require('../repositories/documentsRepo');
const summariesRepo = require('../repositories/summariesRepo');
const textExtractor = require('../services/textExtractor');
const { generateSummary } = require('../services/summaryService');
const AppError = require('../errors/AppError');

function resolveStoredFilePath({ storedPath, storedName }) {
  const candidates = [];
  if (storedPath) {
    candidates.push(path.normalize(storedPath));
    if (!path.isAbsolute(storedPath)) {
      candidates.push(path.resolve(process.cwd(), storedPath));
    }
  }

  const uploadsDirs = [
    process.env.UPLOADS_DIR,
    path.join(process.cwd(), 'uploads'),
    path.join(process.cwd(), 'uploads-test')
  ].filter(Boolean);

  if (storedName) {
    for (const dir of uploadsDirs) {
      candidates.push(path.join(dir, storedName));
    }
  }

  return candidates.find((p) => p && fs.existsSync(p)) || null;
}

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

    // Read original file bytes to store in DB (so download works without local uploads folder)
    let contentBlob = null;
    try {
      contentBlob = await fs.promises.readFile(storedPath);
    } catch (cause) {
      // If we can't read the uploaded file, treat as unprocessable and remove it
      try { fs.unlinkSync(storedPath); } catch (_) {}
      const e = new AppError({ statusCode: 422, code: 'UNPROCESSABLE', message: 'File could not be stored', cause });
      throw e;
    }

    // Create document record in database
    const doc = documentsRepo.createDocument({
      originalName: originalname,
      storedName: filename,
      storedPath: storedPath,
      mimeType: mimetype,
      size: size,
      sha256: sha256,
      contentText: extracted ? extracted.text : null,
      contentBlob
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

    // Attach latest generated summary (if exists) from history table
    try {
      const latest = summariesRepo.getLatestSummaryByDocId(document.id);
      if (latest && latest.summary) {
        document.summary = latest.summary;
        document.summaryModel = latest.model || null;
        document.summaryCreatedAt = latest.createdAt || null;
      }
    } catch (_) {
      // Non-fatal: return document without summary enrichment
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
    const document = documentsRepo.getDocumentFileById(id);

    if (!document) {
      const error = new Error('File not found');
      error.statusCode = 404;
      error.code = 'NOT_FOUND';
      return next(error);
    }

    // Resolve stored path robustly (support moved workspaces / env changes)
    const existingPath = resolveStoredFilePath({ storedPath: document.storedPath, storedName: document.storedName });

    // If file is not on disk, fall back to DB BLOB
    if (!existingPath) {
      if (document.contentBlob && Buffer.isBuffer(document.contentBlob)) {
        const safeName = document.originalName || 'download';
        res.setHeader('Content-Type', document.mimeType || 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeName)}"`);
        return res.status(200).send(document.contentBlob);
      }

      const error = new Error('File not found on disk');
      error.statusCode = 404;
      error.code = 'NOT_FOUND';
      return next(error);
    }

    // Download with original filename
    res.download(existingPath, document.originalName);
  } catch (error) {
    const dbError = new Error('Database error');
    dbError.statusCode = 500;
    dbError.code = 'DB_ERROR';
    return next(dbError);
  }
};

/**
 * Delete a document by ID (and all related data)
 * DELETE /api/docs/:id
 */
exports.deleteDocument = (req, res, next) => {
  try {
    const { id } = req.params;

    const document = documentsRepo.getDocumentFileById(id);
    if (!document) {
      const error = new Error('Document not found');
      error.statusCode = 404;
      error.code = 'NOT_FOUND';
      return next(error);
    }

    // Best-effort remove file from disk (uploads)
    try {
      const existingPath = resolveStoredFilePath({ storedPath: document.storedPath, storedName: document.storedName });
      if (existingPath) {
        try { fs.unlinkSync(existingPath); } catch (_) {}
      }
    } catch (_) {}

    // Delete DB records in a transaction
    const tx = db.transaction(() => {
      summariesRepo.deleteSummariesByDocId(document.id);
      // If FTS triggers are missing, also try delete from documents_fts (non-fatal if table doesn't exist)
      try {
        db.prepare('DELETE FROM documents_fts WHERE doc_id = ?').run(document.id);
      } catch (_) {}
      const deleted = documentsRepo.deleteDocumentById(document.id);
      if (!deleted) {
        const e = new Error('Document not found');
        e.statusCode = 404;
        e.code = 'NOT_FOUND';
        throw e;
      }
    });

    try {
      tx();
    } catch (err) {
      if (err && err.statusCode && err.code) return next(err);
      const dbError = new Error('Database error');
      dbError.statusCode = 500;
      dbError.code = 'DB_ERROR';
      dbError.cause = err;
      return next(dbError);
    }

    return res.status(200).json({ ok: true, docId: document.id });
  } catch (error) {
    if (error.statusCode && error.code) return next(error);
    const internalError = new Error('Internal server error');
    internalError.statusCode = 500;
    internalError.code = 'INTERNAL_ERROR';
    return next(internalError);
  }
};

/**
 * Generate summary for a document
 * POST /api/docs/:id/summary
 */
exports.generateSummary = async (req, res, next) => {
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
      summaryResult = await generateSummary({
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

      const status = error && (error.status || error.statusCode);

      // Model not available / not supported
      if (status === 404) {
        const modelError = new Error('Configured Gemini model is not available for this API key.');
        modelError.statusCode = 500;
        modelError.code = 'MODEL_NOT_AVAILABLE';
        modelError.cause = error;
        return next(modelError);
      }

      // Rate limit / quota exceeded
      if (status === 429) {
        // Try to surface retry-after if present in errorDetails/message
        let retryAfterSec = null;
        try {
          const details = error.errorDetails;
          if (Array.isArray(details)) {
            for (const d of details) {
              if (!d) continue;
              const t = d['@type'] || d.type || '';
              if (String(t).includes('RetryInfo') && d.retryDelay) {
                const m = String(d.retryDelay).trim().match(/^(\d+(?:\.\d+)?)s$/i);
                if (m) retryAfterSec = Math.max(0, Math.ceil(parseFloat(m[1])));
              }
            }
          }
          if (retryAfterSec == null && error.message) {
            const m2 = String(error.message).match(/Please retry in\s+(\d+(?:\.\d+)?)s/i);
            if (m2) retryAfterSec = Math.max(0, Math.ceil(parseFloat(m2[1])));
          }
        } catch (_) {}

        if (retryAfterSec != null) {
          res.set('Retry-After', String(retryAfterSec));
        }

        const rateError = new Error('LLM rate limit exceeded. Please retry shortly.');
        rateError.statusCode = 429;
        rateError.code = 'RATE_LIMIT';
        rateError.cause = error;
        return next(rateError);
      }

      // Other Gemini errors
      const llmError = new Error('LLM error');
      llmError.statusCode = 502;
      llmError.code = 'LLM_ERROR';
      llmError.cause = error;
      return next(llmError);
    }

    const createdAt = new Date().toISOString();

    // Persist as history (append-only; do not overwrite)
    try {
      summariesRepo.createSummary({
        docId: document.id,
        summary: summaryResult.summary,
        model: summaryResult.model,
        createdAt
      });
    } catch (dbErr) {
      // If persistence fails, still return generated summary (best-effort)
      console.warn('Failed to persist summary (non-fatal):', dbErr.message || dbErr);
    }

    // Response (keep current UX; summary shown immediately)
    return res.status(200).json({
      docId: document.id,
      docName: document.originalName,
      summary: summaryResult.summary,
      model: summaryResult.model,
      createdAt
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
