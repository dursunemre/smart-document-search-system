/**
 * Upload endpoint tests
 */
const request = require('supertest');
const app = require('../src/app');
const path = require('path');
const fs = require('fs');

describe('POST /api/docs/upload', () => {
  const sampleTxtPath = path.join(__dirname, 'fixtures', 'sample.txt');

  test('should upload a valid text file successfully', async () => {
    const response = await request(app)
      .post('/api/docs/upload')
      .attach('file', sampleTxtPath)
      .expect(201);

    expect(response.body).toHaveProperty('id');
    expect(response.body).toHaveProperty('originalName');
    expect(response.body).toHaveProperty('mimeType', 'text/plain');
    expect(response.body).toHaveProperty('size');
    expect(response.body).toHaveProperty('storedPath');
    expect(response.body).toHaveProperty('createdAt');
    expect(response.body).toHaveProperty('extractedText');
    expect(response.body.extractedText).toHaveProperty('charCount');
    expect(response.body.extractedText).toHaveProperty('preview');
  });

  test('should return 400 when no file is uploaded', async () => {
    const response = await request(app)
      .post('/api/docs/upload')
      .expect(400);

    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toHaveProperty('code', 'NO_FILE');
  });

  test('should return 415 for invalid file type', async () => {
    // Create a temporary invalid file (wrong extension + mime)
    const invalidFilePath = path.join(__dirname, 'fixtures', 'invalid.jpg');
    fs.writeFileSync(invalidFilePath, 'not-an-image-but-extension-tests-filter');

    const response = await request(app)
      .post('/api/docs/upload')
      .attach('file', invalidFilePath, { filename: 'invalid.jpg', contentType: 'image/jpeg' })
      .expect(415);

    expect(response.body).toHaveProperty('error');

    // Cleanup
    try {
      fs.unlinkSync(invalidFilePath);
    } catch (_) {
      // Ignore
    }
  });

  test('should return 409 for duplicate file (same SHA256)', async () => {
    // First upload
    const firstResponse = await request(app)
      .post('/api/docs/upload')
      .attach('file', sampleTxtPath)
      .expect(201);

    const firstDocId = firstResponse.body.id;

    // Try to upload the same file again
    const secondResponse = await request(app)
      .post('/api/docs/upload')
      .attach('file', sampleTxtPath)
      .expect(409);

    expect(secondResponse.body).toHaveProperty('error');
    expect(secondResponse.body.error).toHaveProperty('code', 'DUPLICATE_DOC');
  });
});

