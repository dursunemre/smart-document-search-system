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
        created_at TEXT NOT NULL,
        content_text TEXT,
        content_blob BLOB,
        summary TEXT,
        summary_created_at TEXT,
        summary_model TEXT,
        summary_short TEXT,
        summary_short_created_at TEXT,
        summary_short_model TEXT,
        summary_long TEXT,
        summary_long_created_at TEXT,
        summary_long_model TEXT,
        summary_long_level TEXT
      )
    `);

    // Store generated summaries as history (do not overwrite)
    db.exec(`
      CREATE TABLE IF NOT EXISTS document_summaries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        doc_id TEXT NOT NULL,
        summary TEXT NOT NULL,
        model TEXT,
        created_at TEXT NOT NULL
      )
    `);

    function columnExists(tableName, columnName) {
      try {
        const rows = db.prepare(`PRAGMA table_info(${tableName})`).all();
        return rows.some((r) => r && r.name === columnName);
      } catch (_) {
        return false;
      }
    }

    function ensureColumn(tableName, columnName, columnType) {
      if (columnExists(tableName, columnName)) return;
      db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`);
    }

    // Ensure columns exist (migrations for existing databases)
    // NOTE: SQLite doesn't support IF NOT EXISTS for ADD COLUMN.
    // We use PRAGMA table_info() checks before ALTER TABLE.
    try { ensureColumn('documents', 'content_text', 'TEXT'); } catch (_) {}
    try { ensureColumn('documents', 'content_blob', 'BLOB'); } catch (_) {}

    // Add summary columns if they don't exist
    const summaryColumns = [
      { name: 'summary', type: 'TEXT' },
      { name: 'summary_created_at', type: 'TEXT' },
      { name: 'summary_model', type: 'TEXT' },
      { name: 'summary_short', type: 'TEXT' },
      { name: 'summary_short_created_at', type: 'TEXT' },
      { name: 'summary_short_model', type: 'TEXT' },
      { name: 'summary_long', type: 'TEXT' },
      { name: 'summary_long_created_at', type: 'TEXT' },
      { name: 'summary_long_model', type: 'TEXT' },
      { name: 'summary_long_level', type: 'TEXT' }
    ];

    for (const col of summaryColumns) {
      try {
        ensureColumn('documents', col.name, col.type);
      } catch (err) {
        // Column already exists, ignore
        if (!err.message.includes('duplicate column name')) {
          throw err;
        }
      }
    }

    // Create indexes
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_documents_created_at 
      ON documents(created_at)
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_document_summaries_doc_id_created_at
      ON document_summaries(doc_id, created_at)
    `);

    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_sha256 
      ON documents(sha256)
    `);

    // Create FTS5 virtual table for full-text search
    // Try to create FTS5 table, fallback gracefully if FTS5 is not available
    try {
      db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
          doc_id UNINDEXED,
          original_name,
          content_text
        )
      `);

      // Create triggers to keep FTS5 in sync with documents table
      // Insert trigger
      db.exec(`
        CREATE TRIGGER IF NOT EXISTS documents_fts_insert AFTER INSERT ON documents BEGIN
          INSERT INTO documents_fts(doc_id, original_name, content_text)
          VALUES (new.id, new.original_name, COALESCE(new.content_text, ''));
        END
      `);

      // Update trigger
      db.exec(`
        CREATE TRIGGER IF NOT EXISTS documents_fts_update AFTER UPDATE ON documents BEGIN
          UPDATE documents_fts SET
            doc_id = new.id,
            original_name = new.original_name,
            content_text = COALESCE(new.content_text, '')
          WHERE doc_id = old.id;
        END
      `);

      // Delete trigger
      db.exec(`
        CREATE TRIGGER IF NOT EXISTS documents_fts_delete AFTER DELETE ON documents BEGIN
          DELETE FROM documents_fts WHERE doc_id = old.id;
        END
      `);

      console.log('FTS5 table and triggers created successfully');
    } catch (ftsError) {
      // FTS5 not available or error creating it
      console.warn('FTS5 not available, will use LIKE fallback:', ftsError.message);
    }

    console.log('Database schema initialized successfully');
  } catch (error) {
    console.error('Failed to initialize database schema:', error);
    throw error;
  }
}

module.exports = { initSchema };


