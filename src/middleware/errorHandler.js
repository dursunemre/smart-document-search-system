/**
 * Global error handler middleware
 * Tüm hataları JSON formatında döndürür
 */
const errorHandler = (err, req, res, next) => {
  // Varsayılan hata değerleri
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  let code = err.code || 'INTERNAL_ERROR';

  // 404 Not Found için özel işlem
  if (statusCode === 404) {
    code = 'NOT_FOUND';
    message = 'Not Found';
  }

  // Development modunda stack trace göster
  if (process.env.NODE_ENV === 'development') {
    console.error('Error:', err);
  }

  res.status(statusCode).json({
    error: {
      message,
      code
    }
  });
};

module.exports = errorHandler;

