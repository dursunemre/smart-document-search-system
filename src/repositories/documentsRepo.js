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
 * @returns {Object} - Created document record
 */
function createDocument(doc) {
  const id = uuidv4();
  const createdAt = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO documents (
      id, original_name, stored_name, stored_path, 
      mime_type, size, sha256, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
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
      createdAt
    );

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
    createdAt: row.created_at
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
    createdAt: row.created_at
  }));
}

/**
 * Search documents by keyword
 * Searches in original_name and stored_path
 * @param {string} q - Search query
 * @param {Object} options - Query options
 * @param {number} options.limit - Maximum number of results
 * @param {number} options.offset - Number of results to skip
 * @returns {Array} - Array of matching document records
 */
function searchDocumentsByKeyword(q, { limit = 50, offset = 0 } = {}) {
  const searchTerm = `%${q}%`;
  const stmt = db.prepare(`
    SELECT * FROM documents 
    WHERE original_name LIKE ? OR stored_path LIKE ?
    ORDER BY created_at DESC 
    LIMIT ? OFFSET ?
  `);

  const rows = stmt.all(searchTerm, searchTerm, limit, offset);

  return rows.map(row => ({
    id: row.id,
    originalName: row.original_name,
    storedName: row.stored_name,
    storedPath: row.stored_path,
    mimeType: row.mime_type,
    size: row.size,
    sha256: row.sha256,
    createdAt: row.created_at
  }));
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
    createdAt: row.created_at
  };
}

module.exports = {
  createDocument,
  getDocumentById,
  listDocuments,
  searchDocumentsByKeyword,
  getDocumentBySha256
};

