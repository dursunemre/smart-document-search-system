/**
 * Documents repository
 * Handles all database operations for documents
 */
const db = require('../db');
const { v4: uuidv4 } = require('uuid');

/**
 * Create a new document record
 * @param {Object} doc - Document data
 * @param {string} doc.originalName - Original filename
 * @param {string} doc.storedName - Stored filename
 * @param {string} doc.storedPath - Full path to stored file
 * @param {string} doc.mimeType - MIME type
 * @param {number} doc.size - File size in bytes
 * @param {string} doc.sha256 - SHA256 hash
 * @param {string} [doc.contentText] - Extracted text content
 * @returns {Object} - Created document record
 */
function createDocument(doc) {
  const id = uuidv4();
  const createdAt = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO documents (
      id, original_name, stored_name, stored_path, 
      mime_type, size, sha256, created_at, content_text
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  try {
    stmt.run(
      id,
      doc.originalName,
      doc.storedName,
      doc.storedPath,
      doc.mimeType,
      doc.size,
      doc.sha256,
      createdAt,
      doc.contentText || null
    );

    // FTS5 triggers should handle the sync automatically, but we can also manually insert
    // if triggers didn't work (for existing documents without triggers)
    try {
      const ftsStmt = db.prepare(`
        INSERT INTO documents_fts(doc_id, original_name, content_text)
        SELECT id, original_name, COALESCE(content_text, '')
        FROM documents WHERE id = ?
      `);
      ftsStmt.run(id);
    } catch (ftsError) {
      // FTS5 table might not exist, ignore
      if (!ftsError.message.includes('no such table')) {
        console.warn('FTS5 insert failed (non-critical):', ftsError.message);
      }
    }

    return getDocumentById(id);
  } catch (error) {
    // Check if it's a unique constraint violation (duplicate sha256)
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      const duplicateError = new Error('Duplicate document');
      duplicateError.code = 'DUPLICATE_DOC';
      duplicateError.statusCode = 409;
      throw duplicateError;
    }
    throw error;
  }
}

/**
 * Get document by ID
 * @param {string} id - Document ID
 * @returns {Object|null} - Document record or null
 */
function getDocumentById(id) {
  const stmt = db.prepare('SELECT * FROM documents WHERE id = ?');
  const row = stmt.get(id);

  if (!row) {
    return null;
  }

  // Map database column names to camelCase
  return {
    id: row.id,
    originalName: row.original_name,
    storedName: row.stored_name,
    storedPath: row.stored_path,
    mimeType: row.mime_type,
    size: row.size,
    sha256: row.sha256,
    createdAt: row.created_at,
    contentText: row.content_text || null,
    summary: row.summary || null,
    summaryCreatedAt: row.summary_created_at || null,
    summaryModel: row.summary_model || null
  };
}

/**
 * List documents with pagination
 * @param {Object} options - Query options
 * @param {number} options.limit - Maximum number of results
 * @param {number} options.offset - Number of results to skip
 * @returns {Array} - Array of document records
 */
function listDocuments({ limit = 50, offset = 0 } = {}) {
  const stmt = db.prepare(`
    SELECT * FROM documents 
    ORDER BY created_at DESC 
    LIMIT ? OFFSET ?
  `);

  const rows = stmt.all(limit, offset);

  return rows.map(row => ({
    id: row.id,
    originalName: row.original_name,
    storedName: row.stored_name,
    storedPath: row.stored_path,
    mimeType: row.mime_type,
    size: row.size,
    sha256: row.sha256,
    createdAt: row.created_at,
    contentText: row.content_text || null
  }));
}

/**
 * Search documents by keyword using FTS5 or LIKE fallback
 * @param {string} q - Search query
 * @param {Object} options - Query options
 * @param {number} options.limit - Maximum number of results
 * @param {number} options.offset - Number of results to skip
 * @param {string} [options.docId] - Optional document ID to filter by
 * @returns {Object} - Search result with mode, total, and results
 */
function searchDocumentsByKeyword(q, { limit = 50, offset = 0, docId = null } = {}) {
  // Validate and sanitize limit/offset
  const safeLimit = Math.min(Math.max(parseInt(limit) || 50, 1), 50);
  const safeOffset = Math.max(parseInt(offset) || 0, 0);

  // Try FTS5 search first
  try {
    // Escape special FTS5 characters and build query
    // FTS5 uses a simple syntax: words are ANDed by default, use OR for multiple terms
    const ftsQuery = q.trim().split(/\s+/).map(term => {
      // Escape special characters for FTS5
      return term.replace(/["'*]/g, '');
    }).filter(term => term.length > 0).join(' OR ');

    if (!ftsQuery) {
      // Empty query after processing
      return {
        mode: 'fts5',
        query: q,
        limit: safeLimit,
        offset: safeOffset,
        total: 0,
        results: []
      };
    }

    // Check if FTS5 table exists
    const tableCheck = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='documents_fts'
    `).get();

    if (!tableCheck) {
      throw new Error('FTS5 table not found');
    }

    // FTS5 search query
    // Note: snippet() column indices: 0=doc_id, 1=original_name, 2=content_text
    const docIdFilter = docId ? 'AND d.id = ?' : '';
    const ftsStmt = db.prepare(`
      SELECT 
        d.id,
        d.original_name,
        d.stored_name,
        d.stored_path,
        d.mime_type,
        d.size,
        d.sha256,
        d.created_at,
        d.content_text,
        bm25(documents_fts) as score,
        snippet(documents_fts, 1, '<mark>', '</mark>', '...', 32) as highlight_original_name,
        snippet(documents_fts, 2, '<mark>', '</mark>', '...', 32) as highlight_content_text
      FROM documents_fts
      JOIN documents d ON d.id = documents_fts.doc_id
      WHERE documents_fts MATCH ? ${docIdFilter}
      ORDER BY score ASC, d.created_at DESC
      LIMIT ? OFFSET ?
    `);

    const queryParams = docId 
      ? [ftsQuery, docId, safeLimit, safeOffset]
      : [ftsQuery, safeLimit, safeOffset];
    const rows = ftsStmt.all(...queryParams);

    // Get total count
    const countStmt = db.prepare(`
      SELECT COUNT(*) as total
      FROM documents_fts
      JOIN documents d ON d.id = documents_fts.doc_id
      WHERE documents_fts MATCH ? ${docIdFilter}
    `);
    const countParams = docId ? [ftsQuery, docId] : [ftsQuery];
    const countResult = countStmt.get(...countParams);
    const total = countResult ? countResult.total : 0;

    const results = rows.map(row => {
      const highlights = [];
      if (row.highlight_original_name) highlights.push(row.highlight_original_name);
      if (row.highlight_content_text) highlights.push(row.highlight_content_text);

      return {
        id: row.id,
        originalName: row.original_name,
        mimeType: row.mime_type,
        size: row.size,
        createdAt: row.created_at,
        score: row.score || null,
        highlights: highlights.length > 0 ? highlights : undefined
      };
    });

    return {
      mode: 'fts5',
      query: q,
      limit: safeLimit,
      offset: safeOffset,
      total: total,
      results: results
    };
  } catch (ftsError) {
    // FTS5 not available or query failed, fallback to LIKE
    console.warn('FTS5 search failed, using LIKE fallback:', ftsError.message);

    const searchTerm = `%${q}%`;
    const docIdFilter = docId ? 'AND id = ?' : '';
    const likeStmt = db.prepare(`
      SELECT * FROM documents 
      WHERE (original_name LIKE ? OR stored_path LIKE ? OR COALESCE(content_text, '') LIKE ?) ${docIdFilter}
      ORDER BY created_at DESC 
      LIMIT ? OFFSET ?
    `);

    const likeParams = docId 
      ? [searchTerm, searchTerm, searchTerm, docId, safeLimit, safeOffset]
      : [searchTerm, searchTerm, searchTerm, safeLimit, safeOffset];
    const rows = likeStmt.all(...likeParams);

    // Get total count for LIKE search
    const countStmt = db.prepare(`
      SELECT COUNT(*) as total
      FROM documents 
      WHERE (original_name LIKE ? OR stored_path LIKE ? OR COALESCE(content_text, '') LIKE ?) ${docIdFilter}
    `);
    const countParams = docId ? [searchTerm, searchTerm, searchTerm, docId] : [searchTerm, searchTerm, searchTerm];
    const countResult = countStmt.get(...countParams);
    const total = countResult ? countResult.total : 0;

    const results = rows.map(row => ({
      id: row.id,
      originalName: row.original_name,
      mimeType: row.mime_type,
      size: row.size,
      createdAt: row.created_at,
      score: null,
      highlights: undefined
    }));

    return {
      mode: 'like',
      query: q,
      limit: safeLimit,
      offset: safeOffset,
      total: total,
      results: results
    };
  }
}

/**
 * Check if document with given SHA256 exists
 * @param {string} sha256 - SHA256 hash
 * @returns {Object|null} - Existing document or null
 */
function getDocumentBySha256(sha256) {
  const stmt = db.prepare('SELECT * FROM documents WHERE sha256 = ?');
  const row = stmt.get(sha256);

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    originalName: row.original_name,
    storedName: row.stored_name,
    storedPath: row.stored_path,
    mimeType: row.mime_type,
    size: row.size,
    sha256: row.sha256,
    createdAt: row.created_at,
    contentText: row.content_text || null,
    summary: row.summary || null,
    summaryCreatedAt: row.summary_created_at || null,
    summaryModel: row.summary_model || null
  };
}

/**
 * Update summary for a document
 * @param {string} docId - Document ID
 * @param {Object} summaryData - Summary data
 * @param {string} summaryData.summary - Summary text
 * @param {string} summaryData.model - Model used to generate summary
 * @param {string} [summaryData.createdAt] - Creation timestamp (ISO), defaults to now
 * @returns {Object} - Updated document record
 */
function updateSummary(docId, { summary, model, createdAt }) {
  const summaryCreatedAt = createdAt || new Date().toISOString();

  const stmt = db.prepare(`
    UPDATE documents 
    SET summary = ?,
        summary_created_at = ?,
        summary_model = ?
    WHERE id = ?
  `);

  try {
    stmt.run(summary, summaryCreatedAt, model, docId);
    return getDocumentById(docId);
  } catch (error) {
    throw error;
  }
}

module.exports = {
  createDocument,
  getDocumentById,
  listDocuments,
  searchDocumentsByKeyword,
  getDocumentBySha256,
  updateSummary
};

