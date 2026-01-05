const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sanitizeFilename = require('../utils/sanitizeFilename');

// Ensure uploads directory exists
// Use test directory in test environment
const isTest = process.env.NODE_ENV === 'test';
const uploadDir = isTest 
  ? (process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads-test'))
  : (process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads'));

if (!fs.existsSync(uploadDir)) {
  try {
    fs.mkdirSync(uploadDir, { recursive: true });
  } catch (error) {
    console.error('Failed to create uploads directory:', error);
  }
}

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Format: <timestamp>-<random>-<safeOriginalName>
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const safeName = sanitizeFilename(file.originalname);
    cb(null, `${uniqueSuffix}-${safeName}`);
  }
});

// File filter for security
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = ['application/pdf', 'text/plain'];
  const allowedExtensions = ['.pdf', '.txt'];

  const ext = path.extname(file.originalname).toLowerCase();

  // Check both MIME type and extension
  if (allowedMimeTypes.includes(file.mimetype) && allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    // IMPORTANT:
    // Do NOT throw from fileFilter; it can abort the request stream and cause ECONNRESET in tests/clients.
    // Instead, mark a validation flag on req and tell multer to skip this file while still consuming the stream.
    req.fileValidationError = 'UNSUPPORTED_MEDIA_TYPE';
    cb(null, false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
});

module.exports = upload;

