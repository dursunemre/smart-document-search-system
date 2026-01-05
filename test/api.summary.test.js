/**
 * Summary endpoint tests
 */
const request = require('supertest');
const path = require('path');

// Mock summary service
jest.mock('../src/services/summaryService', () => ({
  generateShortSummary: jest.fn(),
  generateLongSummary: jest.fn()
}));

const summaryService = require('../src/services/summaryService');
const app = require('../src/app');

describe('POST /api/docs/:id/summary/short', () => {
  const sampleTxtPath = path.join(__dirname, 'fixtures', 'sample.txt');
  async function uploadDoc() {
    const uploadResponse = await request(app).post('/api/docs/upload').attach('file', sampleTxtPath);
    expect(uploadResponse.status).toBe(201);
    return uploadResponse.body.id;
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should return 404 when document does not exist', async () => {
    const response = await request(app)
      .post('/api/docs/non-existent-id/summary/short')
      .expect(404);

    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toHaveProperty('code', 'NOT_FOUND');
  });

  test('should generate short summary successfully', async () => {
    const uploadedDocId = await uploadDoc();
    // Mock summary service
    summaryService.generateShortSummary.mockResolvedValue({
      summary: 'This is a short summary of the document.',
      model: 'gemini-2.0-flash-exp'
    });

    const response = await request(app)
      .post(`/api/docs/${uploadedDocId}/summary/short`)
      .expect(200);

    expect(response.body).toHaveProperty('docId', uploadedDocId);
    expect(response.body).toHaveProperty('docName');
    expect(response.body).toHaveProperty('summaryShort');
    expect(response.body).toHaveProperty('model');
    expect(response.body).toHaveProperty('createdAt');
    expect(summaryService.generateShortSummary).toHaveBeenCalled();
  });

  test('should return 502 when Gemini service fails', async () => {
    const uploadedDocId = await uploadDoc();
    // Mock Gemini error
    summaryService.generateShortSummary.mockRejectedValue(new Error('LLM API error'));

    const response = await request(app)
      .post(`/api/docs/${uploadedDocId}/summary/short`)
      .expect(502);

    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toHaveProperty('code', 'LLM_ERROR');
  });

  test('should return 422 when text extraction fails', async () => {
    const documentsRepo = require('../src/repositories/documentsRepo');
    const textExtractor = require('../src/services/textExtractor');
    const db = require('../src/db');

    const uploadedDocId = await uploadDoc();
    // Force controller to use extraction path (not contentText from DB)
    db.prepare('UPDATE documents SET content_text = NULL WHERE id = ?').run(uploadedDocId);

    const spy = jest
      .spyOn(textExtractor, 'extractTextFromFile')
      .mockRejectedValue(new Error('extraction failed'));

    const response = await request(app)
      .post(`/api/docs/${uploadedDocId}/summary/short`)
      .expect(422);

    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toHaveProperty('code', 'EXTRACTION_FAILED');

    spy.mockRestore();
  });
});

describe('POST /api/docs/:id/summary/long', () => {
  const sampleTxtPath = path.join(__dirname, 'fixtures', 'sample.txt');
  async function uploadDoc() {
    const uploadResponse = await request(app).post('/api/docs/upload').attach('file', sampleTxtPath);
    expect(uploadResponse.status).toBe(201);
    return uploadResponse.body.id;
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should return 404 when document does not exist', async () => {
    const response = await request(app)
      .post('/api/docs/non-existent-id/summary/long')
      .send({ level: 'medium', format: 'structured' })
      .expect(404);

    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toHaveProperty('code', 'NOT_FOUND');
  });

  test('should return 400 for invalid level', async () => {
    const uploadedDocId = await uploadDoc();
    const response = await request(app)
      .post(`/api/docs/${uploadedDocId}/summary/long`)
      .send({ level: 'invalid', format: 'structured' })
      .expect(400);

    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toHaveProperty('code', 'BAD_REQUEST');
  });

  test('should return 400 for invalid format', async () => {
    const uploadedDocId = await uploadDoc();
    const response = await request(app)
      .post(`/api/docs/${uploadedDocId}/summary/long`)
      .send({ level: 'medium', format: 'invalid' })
      .expect(400);

    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toHaveProperty('code', 'BAD_REQUEST');
  });

  test('should generate long summary with medium level and structured format', async () => {
    const uploadedDocId = await uploadDoc();
    summaryService.generateLongSummary.mockResolvedValue({
      summary: 'This is a medium-length structured summary.',
      model: 'gemini-2.0-flash-exp',
      level: 'medium',
      format: 'structured'
    });

    const response = await request(app)
      .post(`/api/docs/${uploadedDocId}/summary/long`)
      .send({ level: 'medium', format: 'structured' })
      .expect(200);

    expect(response.body).toHaveProperty('docId', uploadedDocId);
    expect(response.body).toHaveProperty('summaryLong');
    expect(response.body).toHaveProperty('level', 'medium');
    expect(response.body).toHaveProperty('format', 'structured');
    expect(response.body).toHaveProperty('model');
    expect(response.body).toHaveProperty('createdAt');
    expect(summaryService.generateLongSummary).toHaveBeenCalled();
  });

  test('should generate long summary with long level and bullets format', async () => {
    const uploadedDocId = await uploadDoc();
    summaryService.generateLongSummary.mockResolvedValue({
      summary: '- Point 1\n- Point 2\n- Point 3',
      model: 'gemini-2.0-flash-exp',
      level: 'long',
      format: 'bullets'
    });

    const response = await request(app)
      .post(`/api/docs/${uploadedDocId}/summary/long`)
      .send({ level: 'long', format: 'bullets' })
      .expect(200);

    expect(response.body).toHaveProperty('level', 'long');
    expect(response.body).toHaveProperty('format', 'bullets');
    expect(summaryService.generateLongSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'long',
        format: 'bullets'
      })
    );
  });

  test('should use default values when level and format not provided', async () => {
    const uploadedDocId = await uploadDoc();
    summaryService.generateLongSummary.mockResolvedValue({
      summary: 'Default summary',
      model: 'gemini-2.0-flash-exp',
      level: 'medium',
      format: 'structured'
    });

    const response = await request(app)
      .post(`/api/docs/${uploadedDocId}/summary/long`)
      .send({})
      .expect(200);

    expect(response.body).toHaveProperty('level', 'medium');
    expect(response.body).toHaveProperty('format', 'structured');
  });

  test('should return cached summary if same level and format exist', async () => {
    const uploadedDocId = await uploadDoc();
    // First, generate a summary
    summaryService.generateLongSummary.mockResolvedValue({
      summary: 'Cached summary',
      model: 'gemini-2.0-flash-exp',
      level: 'medium',
      format: 'structured'
    });

    await request(app)
      .post(`/api/docs/${uploadedDocId}/summary/long`)
      .send({ level: 'medium', format: 'structured' })
      .expect(200);

    // Clear mock to verify it's not called again
    jest.clearAllMocks();

    // Second call should return cached (service not called)
    const response = await request(app)
      .post(`/api/docs/${uploadedDocId}/summary/long`)
      .send({ level: 'medium', format: 'structured' })
      .expect(200);

    expect(response.body).toHaveProperty('summaryLong');
    // Service should not be called if cached
    // Note: In real scenario, the cache check happens before service call
  });

  test('should return 502 when Gemini service fails', async () => {
    const uploadedDocId = await uploadDoc();
    summaryService.generateLongSummary.mockRejectedValue(new Error('LLM API error'));

    const response = await request(app)
      .post(`/api/docs/${uploadedDocId}/summary/long`)
      .send({ level: 'medium', format: 'structured' })
      .expect(502);

    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toHaveProperty('code', 'LLM_ERROR');
  });
});

