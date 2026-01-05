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
      } else if (err.code === 'INVALID_FILE_TYPE') {
        err.statusCode = 400;
      } else if (!err.statusCode) {
        err.statusCode = 400; // Default to bad request for upload errors
      }
      
      return next(err);
    }
    next();
  });
};

// Routes
router.post('/upload', uploadMiddleware, controller.uploadDocument);
router.get('/', controller.listDocuments);
router.get('/:id/download', controller.downloadDocument);

module.exports = router;

