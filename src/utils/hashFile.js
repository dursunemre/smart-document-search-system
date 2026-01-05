/**
 * Calculate SHA256 hash of a file using streams
 */
const crypto = require('crypto');
const fs = require('fs');
const { promisify } = require('util');

const createHash = crypto.createHash;

/**
 * Calculate SHA256 hash of a file
 * @param {string} filePath - Path to the file
 * @returns {Promise<string>} - Hex string of SHA256 hash
 */
async function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = fs.createReadStream(filePath);

    stream.on('data', (data) => {
      hash.update(data);
    });

    stream.on('end', () => {
      resolve(hash.digest('hex'));
    });

    stream.on('error', (error) => {
      reject(error);
    });
  });
}

module.exports = hashFile;

