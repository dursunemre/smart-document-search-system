/**
 * Download endpoint tests
 */
const request = require('supertest');
const path = require('path');
const fs = require('fs');

const app = require('../src/app');

describe('GET /api/docs/:id/download', () => {
  const sampleTxtPath = path.join(__dirname, 'fixtures', 'sample.txt');

  test('should download from DB blob even if file is missing on disk', async () => {
    // Upload a txt doc
    const uploadRes = await request(app).post('/api/docs/upload').attach('file', sampleTxtPath);
    expect(uploadRes.status).toBe(201);

    const docId = uploadRes.body.id;
    const storedPath = uploadRes.body.storedPath;
    expect(typeof storedPath).toBe('string');

    // Delete the stored file to simulate missing uploads folder
    try {
      fs.unlinkSync(storedPath);
    } catch (_) {}

    const downloadRes = await request(app)
      .get(`/api/docs/${docId}/download`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);

    const expected = fs.readFileSync(sampleTxtPath);
    expect(Buffer.isBuffer(downloadRes.body)).toBe(true);
    expect(downloadRes.body.equals(expected)).toBe(true);
  });
});


