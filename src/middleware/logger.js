/**
 * Request logger middleware
 * Logs: method, path, status, durationMs
 */
const logger = (req, res, next) => {
  const startTime = Date.now();
  
  // Response tamamlandığında logla
  res.on('finish', () => {
    const durationMs = Date.now() - startTime;
    console.log(`${req.method} ${req.path} ${res.statusCode} ${durationMs}ms`);
  });
  
  next();
};

module.exports = logger;

