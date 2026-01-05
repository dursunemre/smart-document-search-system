/**
 * Test setup file
 * Runs before all tests
 */
const path = require('path');
const fs = require('fs');

// Set test environment
process.env.NODE_ENV = 'test';
process.env.GEMINI_API_KEY = 'test-api-key';
process.env.GEMINI_MODEL = 'gemini-2.5-flash';
process.env.TEST_DB_PATH = process.env.TEST_DB_PATH || ':memory:';

// Test uploads directory (isolate per Jest worker to avoid cross-test interference)
// When Jest runs multiple test files in parallel workers, a shared uploads-test folder
// causes races (one worker cleans while another is uploading).
const workerId = process.env.JEST_WORKER_ID || '0';
const testUploadsDir = path.join(process.cwd(), 'uploads-test', `worker-${workerId}`);

// Ensure test uploads directory exists
if (!fs.existsSync(testUploadsDir)) {
  fs.mkdirSync(testUploadsDir, { recursive: true });
}

// Set test uploads directory in environment
process.env.UPLOADS_DIR = testUploadsDir;

// IMPORTANT: require DB modules AFTER env vars are set
const { initSchema } = require('../src/db/init');
const db = require('../src/db');

// Initialize database schema before all tests
beforeAll(() => {
  try {
    initSchema();
  } catch (error) {
    console.error('Failed to initialize test database schema:', error);
    throw error;
  }
});

function resetDb() {
  // Clear documents table
  try {
    db.exec('DELETE FROM documents');
    // Also clear FTS5 table if it exists
    try {
      db.exec('DELETE FROM documents_fts');
    } catch (_) {
      // FTS5 table might not exist, ignore
    }
  } catch (error) {
    console.warn('Failed to clean database:', error);
  }
}

function cleanUploadsDir() {
  // Clean test uploads directory
  try {
    const files = fs.readdirSync(testUploadsDir);
    for (const file of files) {
      const filePath = path.join(testUploadsDir, file);
      try {
        fs.unlinkSync(filePath);
      } catch (_) {
        // Ignore errors
      }
    }
  } catch (error) {
    // Directory might not exist, ignore
  }
}

// Clean up BEFORE each test to keep tests independent/deterministic
beforeEach(() => {
  resetDb();
  cleanUploadsDir();
});

// Clean up after all tests
afterAll(() => {
  // Close database connection
  try {
    db.close();
  } catch (error) {
    // Ignore
  }

  // Remove test uploads directory (worker-specific)
  try {
    if (fs.existsSync(testUploadsDir)) {
      const files = fs.readdirSync(testUploadsDir);
      for (const file of files) {
        const filePath = path.join(testUploadsDir, file);
        try {
          fs.unlinkSync(filePath);
        } catch (_) {
          // Ignore
        }
      }
      try {
        fs.rmdirSync(testUploadsDir);
      } catch (_) {
        // Ignore
      }
    }
  } catch (error) {
    // Ignore
  }
});

