const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const controller = require('../controllers/docsController');

// Wrapper middleware to catch Multer errors and format them
const uploadMiddleware = (req, res, next) => {
  const uploadSingle = upload.single('file');

  uploadSingle(req, res, (err) => {
    if (err) {
      // Handle Multer-specific errors
      if (err.code === 'LIMIT_FILE_SIZE') {
        err.statusCode = 413;
        err.message = 'File size too large. Max 10MB.';
      } else if (!err.statusCode) {
        err.statusCode = 400; // Default to bad request for upload errors
      }
      
      return next(err);
    }

    // File type validation from fileFilter (see src/middleware/upload.js)
    if (req.fileValidationError === 'UNSUPPORTED_MEDIA_TYPE') {
      const e = new Error('Unsupported file type. Only PDF and TXT are allowed.');
      e.statusCode = 415;
      e.code = 'UNSUPPORTED_MEDIA_TYPE';
      return next(e);
    }
    next();
  });
};

// Routes
router.post('/upload', uploadMiddleware, controller.uploadDocument);
router.get('/', controller.listDocuments);
router.get('/search', controller.searchDocuments);
router.get('/:id', controller.getDocument);
router.get('/:id/download', controller.downloadDocument);
router.post('/:id/summary/short', controller.generateShortSummary);
router.post('/:id/summary/long', controller.generateLongSummary);

module.exports = router;

