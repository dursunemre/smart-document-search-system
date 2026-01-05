/**
 * Ana route dosyası
 * Tüm route'ları buradan export eder
 */
const express = require('express');
const router = express.Router();
const healthRouter = require('./health');

// Health check route'unu ekle
router.use('/', healthRouter);

// 404 handler (bu route'a ulaşılırsa)
router.use('*', (req, res, next) => {
  const err = new Error('Not Found');
  err.statusCode = 404;
  next(err);
});

module.exports = router;

