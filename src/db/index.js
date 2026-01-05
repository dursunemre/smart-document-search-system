/**
 * SQLite database connection
 */
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Database file path - use test DB in test environment
const isTest = process.env.NODE_ENV === 'test';
const dbPath = isTest 
  ? (process.env.TEST_DB_PATH || ':memory:')
  : (process.env.DB_PATH || path.join(process.cwd(), 'data', 'app.db'));

// Ensure data directory exists (only for non-memory DBs)
if (dbPath !== ':memory:') {
  const dataDir = path.dirname(dbPath);
  if (dataDir && dataDir !== '.' && !fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

// Create and export database connection
const db = new Database(dbPath);

// Enable foreign keys and WAL mode for better performance
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

module.exports = db;

