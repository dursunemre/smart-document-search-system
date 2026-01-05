const path = require('path');
const fs = require('fs');

/**
 * Upload a document
 */
exports.uploadDocument = (req, res, next) => {
  if (!req.file) {
    const error = new Error('No file uploaded');
    error.statusCode = 400;
    error.code = 'NO_FILE';
    return next(error);
  }

  const { filename, originalname, mimetype, size, path: storedPath } = req.file;

  res.status(201).json({
    id: filename,
    originalName: originalname,
    mimeType: mimetype,
    size: size,
    storedName: filename,
    storedPath: storedPath,
    uploadedAt: new Date().toISOString()
  });
};

/**
 * List all uploaded documents (Optional)
 */
exports.listDocuments = (req, res, next) => {
  const uploadDir = path.join(process.cwd(), 'uploads');

  fs.readdir(uploadDir, (err, files) => {
    if (err) {
      if (err.code === 'ENOENT') {
        // Directory doesn't exist yet, return empty
        return res.json([]);
      }
      return next(err);
    }
    res.json(files);
  });
};

/**
 * Download a document by ID (filename) (Optional)
 */
exports.downloadDocument = (req, res, next) => {
  const { id } = req.params;

  // Basic security check for path traversal on ID
  if (id.includes('..') || id.includes('/') || id.includes('\\')) {
    const error = new Error('Invalid file ID');
    error.statusCode = 400;
    return next(error);
  }

  const filePath = path.join(process.cwd(), 'uploads', id);

  if (!fs.existsSync(filePath)) {
    const error = new Error('File not found');
    error.statusCode = 404;
    error.code = 'NOT_FOUND';
    return next(error);
  }

  res.download(filePath);
};

