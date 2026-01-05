/**
 * Application error with HTTP status code and stable error code
 */
class AppError extends Error {
  /**
   * @param {Object} params
   * @param {number} params.statusCode
   * @param {string} params.code
   * @param {string} params.message
   * @param {Error} [params.cause]
   */
  constructor({ statusCode = 500, code = 'INTERNAL_ERROR', message = 'Internal Server Error', cause } = {}) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    if (cause) this.cause = cause;
  }
}

module.exports = AppError;


