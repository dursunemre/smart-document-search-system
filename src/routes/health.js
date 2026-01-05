/**
 * Health check route
 * GET /health -> 200 OK ve JSON döndürür
 */
const express = require('express');
const router = express.Router();

// Server başlangıç zamanı
const startTime = Date.now();

router.get('/health', (req, res) => {
  const uptimeSec = (Date.now() - startTime) / 1000;
  
  res.status(200).json({
    status: 'ok',
    uptimeSec: Math.round(uptimeSec * 100) / 100, // 2 ondalık basamak
    env: process.env.NODE_ENV || 'development'
  });
});

module.exports = router;

