/**
 * Database schema initialization
 */
const db = require('./index');

/**
 * Initialize database schema
 * Creates tables and indexes if they don't exist
 */
function initSchema() {
  try {
    // Create documents table
    db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        original_name TEXT NOT NULL,
        stored_name TEXT NOT NULL,
        stored_path TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size INTEGER NOT NULL,
        sha256 TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);

    // Create indexes
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_documents_created_at 
      ON documents(created_at)
    `);

    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_sha256 
      ON documents(sha256)
    `);

    console.log('Database schema initialized successfully');
  } catch (error) {
    console.error('Failed to initialize database schema:', error);
    throw error;
  }
}

module.exports = { initSchema };

