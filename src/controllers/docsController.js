const path = require('path');
const fs = require('fs');
const hashFile = require('../utils/hashFile');
const documentsRepo = require('../repositories/documentsRepo');
const { extractTextFromFile } = require('../services/textExtractor');
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
      fs.unlinkSync(storedPath);
      
      const error = new Error('Duplicate document');
      error.statusCode = 409;
      error.code = 'DUPLICATE_DOC';
      return next(error);
    }

    // Extract text (PDF/TXT)
    let extracted = null;
    try {
      extracted = await extractTextFromFile({ path: storedPath, mimeType: mimetype });
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

    if (!q || !q.trim()) {
      const error = new Error('Missing query');
      error.statusCode = 400;
      error.code = 'BAD_REQUEST';
      return next(error);
    }

    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;

    const result = documentsRepo.searchDocumentsByKeyword(q.trim(), { limit, offset });
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

