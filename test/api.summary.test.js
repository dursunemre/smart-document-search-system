/**
 * Summary endpoint tests
 */
const request = require('supertest');
const path = require('path');

// Mock summary service
jest.mock('../src/services/summaryService', () => ({
  generateSummary: jest.fn()
}));

const summaryService = require('../src/services/summaryService');
const app = require('../src/app');

describe('POST /api/docs/:id/summary', () => {
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
      .post('/api/docs/non-existent-id/summary')
      .expect(404);

    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toHaveProperty('code', 'NOT_FOUND');
  });

  test('should generate summary successfully', async () => {
    const uploadedDocId = await uploadDoc();
    // Mock summary service
    summaryService.generateSummary.mockResolvedValue({
      summary: 'This is a summary of the document.',
      model: 'gemini-2.0-flash-exp'
    });

    const response = await request(app)
      .post(`/api/docs/${uploadedDocId}/summary`)
      .expect(200);

    expect(response.body).toHaveProperty('docId', uploadedDocId);
    expect(response.body).toHaveProperty('docName');
    expect(response.body).toHaveProperty('summary');
    expect(response.body).toHaveProperty('model');
    expect(response.body).toHaveProperty('createdAt');
    expect(summaryService.generateSummary).toHaveBeenCalled();
  });

  test('should return 502 when Gemini service fails', async () => {
    const uploadedDocId = await uploadDoc();
    // Mock Gemini error
    summaryService.generateSummary.mockRejectedValue(new Error('LLM API error'));

    const response = await request(app)
      .post(`/api/docs/${uploadedDocId}/summary`)
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
      .post(`/api/docs/${uploadedDocId}/summary`)
      .expect(422);

    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toHaveProperty('code', 'EXTRACTION_FAILED');

    spy.mockRestore();
  });
});

