const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sanitizeFilename = require('../utils/sanitizeFilename');

// Ensure uploads directory exists
const uploadDir = path.join(process.cwd(), 'uploads');
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
    // Create custom error for handling
    const error = new Error('Invalid file type. Only PDF and TXT are allowed.');
    error.code = 'INVALID_FILE_TYPE';
    cb(error, false);
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

