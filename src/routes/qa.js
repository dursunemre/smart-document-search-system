/**
 * Q&A routes
 */
const express = require('express');
const router = express.Router();
const qaController = require('../controllers/qaController');

// POST /api/qa - Answer a question
router.post('/', qaController.answerQuestion);

module.exports = router;

