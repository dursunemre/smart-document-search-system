/**
 * Test setup file
 * Runs before all tests
 */
const path = require('path');
const fs = require('fs');
const { initSchema } = require('../src/db/init');
const db = require('../src/db');

// Set test environment
process.env.NODE_ENV = 'test';
process.env.GEMINI_API_KEY = 'test-api-key';
process.env.GEMINI_MODEL = 'gemini-2.0-flash-exp';

// Test uploads directory
const testUploadsDir = path.join(process.cwd(), 'uploads-test');

// Ensure test uploads directory exists
if (!fs.existsSync(testUploadsDir)) {
  fs.mkdirSync(testUploadsDir, { recursive: true });
}

// Set test uploads directory in environment
process.env.UPLOADS_DIR = testUploadsDir;

// Initialize database schema before all tests
beforeAll(() => {
  try {
    initSchema();
  } catch (error) {
    console.error('Failed to initialize test database schema:', error);
    throw error;
  }
});

// Clean up after each test
afterEach(() => {
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
});

// Clean up after all tests
afterAll(() => {
  // Close database connection
  try {
    db.close();
  } catch (error) {
    // Ignore
  }

  // Remove test uploads directory
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

