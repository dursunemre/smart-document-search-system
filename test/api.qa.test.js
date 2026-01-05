/**
 * Q&A endpoint tests
 */
const request = require('supertest');
const app = require('../src/app');
const path = require('path');
const geminiService = require('../src/services/geminiService');

// Mock Gemini service
jest.mock('../src/services/geminiService', () => ({
  generateAnswer: jest.fn()
}));

describe('POST /api/qa', () => {
  const sampleTxtPath = path.join(__dirname, 'fixtures', 'sample.txt');

  beforeAll(async () => {
    // Upload a document before Q&A tests
    await request(app)
      .post('/api/docs/upload')
      .attach('file', sampleTxtPath);
  });

  beforeEach(() => {
    // Reset mock before each test
    jest.clearAllMocks();
  });

  test('should return 400 when question is missing', async () => {
    const response = await request(app)
      .post('/api/qa')
      .send({})
      .expect(400);

    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toHaveProperty('code', 'BAD_REQUEST');
  });

  test('should return 400 when question is empty', async () => {
    const response = await request(app)
      .post('/api/qa')
      .send({ question: '' })
      .expect(400);

    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toHaveProperty('code', 'BAD_REQUEST');
  });

  test('should answer question successfully', async () => {
    // Mock Gemini response
    geminiService.generateAnswer.mockResolvedValue({
      answer: 'This is a test answer about Node.js and Express.',
      citations: [
        {
          docId: 'test-doc-id',
          docName: 'sample.txt',
          chunkId: 'test-doc-id_chunk_0',
          startChar: 0,
          endChar: 100,
          quote: 'This is a sample text document for testing purposes.'
        }
      ],
      confidence: 'medium'
    });

    const response = await request(app)
      .post('/api/qa')
      .send({
        question: 'What is this document about?',
        topK: 5,
        docLimit: 5
      })
      .expect(200);

    expect(response.body).toHaveProperty('question');
    expect(response.body).toHaveProperty('answer');
    expect(response.body).toHaveProperty('confidence');
    expect(response.body).toHaveProperty('based_on_docs');
    expect(response.body).toHaveProperty('retrieval');
    expect(Array.isArray(response.body.based_on_docs)).toBe(true);
    expect(geminiService.generateAnswer).toHaveBeenCalled();
  });

  test('should return 502 when Gemini service fails', async () => {
    // Mock Gemini error
    geminiService.generateAnswer.mockRejectedValue(new Error('LLM API error'));

    const response = await request(app)
      .post('/api/qa')
      .send({
        question: 'What is this document about?'
      })
      .expect(502);

    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toHaveProperty('code', 'LLM_ERROR');
  });

  test('should return answer when no chunks found', async () => {
    // This test might return "Bilmiyorum" if no chunks are retrieved
    const response = await request(app)
      .post('/api/qa')
      .send({
        question: 'xyzabc123nonexistent',
        topK: 5,
        docLimit: 5
      })
      .expect(200);

    expect(response.body).toHaveProperty('answer');
    expect(response.body).toHaveProperty('based_on_docs');
  });

  test('should respect topK and docLimit parameters', async () => {
    geminiService.generateAnswer.mockResolvedValue({
      answer: 'Test answer',
      citations: [],
      confidence: 'low'
    });

    const response = await request(app)
      .post('/api/qa')
      .send({
        question: 'What is this?',
        topK: 3,
        docLimit: 2
      })
      .expect(200);

    expect(response.body.retrieval).toHaveProperty('topK', 3);
    expect(response.body.retrieval).toHaveProperty('docLimit', 2);
  });
});

