/**
 * Express uygulama yapılandırması
 */
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const routes = require('./routes');
const logger = require('./middleware/logger');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// Güvenlik middleware
app.use(helmet());

// CORS - dev için açık
app.use(cors());

// JSON body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logger middleware
app.use(logger);

// Routes
app.use('/', routes);

// Global error handler (en sonda olmalı)
app.use(errorHandler);

module.exports = app;

