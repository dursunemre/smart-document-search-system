/**
 * Summaries repository
 * Stores generated summaries as history records (append-only)
 */
const db = require('../db');

/**
 * Insert a new summary record for a document
 * @param {Object} params
 * @param {string} params.docId
 * @param {string} params.summary
 * @param {string|null} [params.model]
 * @param {string} params.createdAt ISO string
 * @returns {{id: number, docId: string, summary: string, model: string|null, createdAt: string}}
 */
function createSummary({ docId, summary, model, createdAt }) {
  const stmt = db.prepare(`
    INSERT INTO document_summaries (doc_id, summary, model, created_at)
    VALUES (?, ?, ?, ?)
  `);

  const info = stmt.run(docId, summary, model || null, createdAt);
  return {
    id: Number(info.lastInsertRowid),
    docId,
    summary,
    model: model || null,
    createdAt
  };
}

/**
 * Get latest summary for a document (most recent by created_at)
 * @param {string} docId
 * @returns {{id:number, docId:string, summary:string, model:string|null, createdAt:string} | null}
 */
function getLatestSummaryByDocId(docId) {
  const stmt = db.prepare(`
    SELECT id, doc_id, summary, model, created_at
    FROM document_summaries
    WHERE doc_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `);
  const row = stmt.get(docId);
  if (!row) return null;
  return {
    id: row.id,
    docId: row.doc_id,
    summary: row.summary,
    model: row.model || null,
    createdAt: row.created_at
  };
}

/**
 * Delete all summaries for a document
 * @param {string} docId
 * @returns {number} number of deleted rows
 */
function deleteSummariesByDocId(docId) {
  const stmt = db.prepare(`DELETE FROM document_summaries WHERE doc_id = ?`);
  const info = stmt.run(docId);
  return info.changes || 0;
}

module.exports = { createSummary, getLatestSummaryByDocId, deleteSummariesByDocId };


