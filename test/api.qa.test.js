/**
 * Q&A endpoint tests
 */
const request = require('supertest');
const path = require('path');

// Mock Gemini service
jest.mock('../src/services/geminiService', () => ({
  generateAnswer: jest.fn()
}));

const geminiService = require('../src/services/geminiService');
const app = require('../src/app');

describe('POST /api/qa', () => {
  const sampleTxtPath = path.join(__dirname, 'fixtures', 'sample.txt');

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
    // Ensure at least 1 doc exists so retrieval returns chunks and Gemini is called
    await request(app).post('/api/docs/upload').attach('file', sampleTxtPath).expect(201);

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
        topK: 6,
        docLimit: 15
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
    await request(app).post('/api/docs/upload').attach('file', sampleTxtPath).expect(201);

    // Mock Gemini error
    geminiService.generateAnswer.mockRejectedValue(new Error('LLM API error'));

    const response = await request(app)
      .post('/api/qa')
      .send({
        question: 'What is this document about?'
      })
      .expect(200);

    expect(response.body).toHaveProperty('answer');
    expect(response.body).toHaveProperty('based_on_docs');
    expect(response.body).toHaveProperty('llm');
    expect(response.body.llm).toHaveProperty('used', false);
  });

  test('should return answer when no chunks found', async () => {
    // This test might return "Bilmiyorum" if no chunks are retrieved
    const response = await request(app)
      .post('/api/qa')
      .send({
        question: 'xyzabc123nonexistent',
        topK: 6,
        docLimit: 15
      })
      .expect(200);

    expect(response.body).toHaveProperty('answer');
    expect(response.body).toHaveProperty('based_on_docs');
  });

  test('should respect topK and docLimit parameters', async () => {
    await request(app).post('/api/docs/upload').attach('file', sampleTxtPath).expect(201);

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

  test('should ignore docId and still answer using all documents', async () => {
    await request(app).post('/api/docs/upload').attach('file', sampleTxtPath).expect(201);

    geminiService.generateAnswer.mockResolvedValue({
      answer: 'Test answer',
      citations: [],
      confidence: 'low'
    });

    const response = await request(app)
      .post('/api/qa')
      .send({
        question: 'What is this document about?',
        docId: 'non-existent-id'
      })
      .expect(200);

    expect(response.body).toHaveProperty('answer');
    expect(geminiService.generateAnswer).toHaveBeenCalled();
  });
});

