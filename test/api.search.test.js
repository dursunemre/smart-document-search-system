/**
 * Search endpoint tests
 */
const request = require('supertest');
const app = require('../src/app');
const path = require('path');

describe('GET /api/docs/search', () => {
  const sampleTxtPath = path.join(__dirname, 'fixtures', 'sample.txt');
  let uploadedDocId = null;

  beforeAll(async () => {
    // Upload a document before search tests
    const uploadResponse = await request(app)
      .post('/api/docs/upload')
      .attach('file', sampleTxtPath);

    if (uploadResponse.status === 201) {
      uploadedDocId = uploadResponse.body.id;
    }
  });

  test('should return 400 when query is missing', async () => {
    const response = await request(app)
      .get('/api/docs/search')
      .expect(400);

    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toHaveProperty('code', 'BAD_REQUEST');
  });

  test('should return 400 when query is empty', async () => {
    const response = await request(app)
      .get('/api/docs/search?q=')
      .expect(400);

    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toHaveProperty('code', 'BAD_REQUEST');
  });

  test('should search documents successfully', async () => {
    const response = await request(app)
      .get('/api/docs/search?q=sample')
      .expect(200);

    expect(response.body).toHaveProperty('query', 'sample');
    expect(response.body).toHaveProperty('mode');
    expect(response.body).toHaveProperty('total');
    expect(response.body).toHaveProperty('results');
    expect(Array.isArray(response.body.results)).toBe(true);
  });

  test('should respect limit parameter', async () => {
    const response = await request(app)
      .get('/api/docs/search?q=test&limit=5')
      .expect(200);

    expect(response.body).toHaveProperty('limit');
    expect(response.body.limit).toBeLessThanOrEqual(5);
    expect(response.body.results.length).toBeLessThanOrEqual(5);
  });

  test('should clamp limit to maximum 50', async () => {
    const response = await request(app)
      .get('/api/docs/search?q=test&limit=100')
      .expect(200);

    expect(response.body.limit).toBeLessThanOrEqual(50);
  });

  test('should respect offset parameter', async () => {
    const response = await request(app)
      .get('/api/docs/search?q=test&offset=0')
      .expect(200);

    expect(response.body).toHaveProperty('offset');
    expect(response.body.offset).toBeGreaterThanOrEqual(0);
  });
});

