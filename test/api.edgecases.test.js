/**
 * Edge-case API tests (Jest + Supertest)
 */
const request = require('supertest');
const path = require('path');

// Mock Gemini for Q&A (no real API calls)
jest.mock('../src/services/geminiService', () => ({
  generateAnswer: jest.fn()
}));

const geminiService = require('../src/services/geminiService');
const app = require('../src/app');

describe('Edge-cases', () => {
  describe('A) Upload edge-cases', () => {
    test('1) empty file upload -> 422/400 with EXTRACTION_FAILED or EMPTY_OR_TOO_SHORT', async () => {
      const emptyPath = path.join(__dirname, 'fixtures', 'empty.txt');

      const res = await request(app)
        .post('/api/docs/upload')
        .attach('file', emptyPath);

      expect([400, 422]).toContain(res.status);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toHaveProperty('message');
      expect(res.body.error).toHaveProperty('code');
      expect(['EXTRACTION_FAILED', 'EMPTY_OR_TOO_SHORT', 'UNPROCESSABLE']).toContain(res.body.error.code);
    });

    test('2) oversized file (>10MB) -> 413', async () => {
      // Programmatically create an oversized buffer
      const big = Buffer.alloc(10 * 1024 * 1024 + 1, 'a'); // 10MB + 1 byte

      const res = await request(app)
        .post('/api/docs/upload')
        .attach('file', big, { filename: 'big.txt', contentType: 'text/plain' });

      // Multer should reject with LIMIT_FILE_SIZE -> our middleware maps to 413
      expect([413, 400]).toContain(res.status);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toHaveProperty('message');
      expect(res.body.error).toHaveProperty('code');
      expect(['LIMIT_FILE_SIZE', 'UPLOAD_ERROR', 'BAD_REQUEST']).toContain(res.body.error.code);
    });
  });

  describe('B) Search edge-cases', () => {
    test('3) no search result -> 200 and results: [] total: 0', async () => {
      const sampleTxtPath = path.join(__dirname, 'fixtures', 'sample.txt');
      await request(app).post('/api/docs/upload').attach('file', sampleTxtPath).expect(201);

      const res = await request(app)
        .get('/api/docs/search?q=nonexistentkeyword123&limit=20&offset=0')
        .expect(200);

      expect(res.body).toHaveProperty('results');
      expect(Array.isArray(res.body.results)).toBe(true);
      expect(res.body.results).toHaveLength(0);
      expect(res.body).toHaveProperty('total', 0);
    });

    test('4) weird query: whitespace-only -> 400 BAD_REQUEST', async () => {
      const res = await request(app)
        .get('/api/docs/search?q=%20%20%20')
        .expect(400);

      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toHaveProperty('code', 'BAD_REQUEST');
    });

    test('4b) weird query: single character -> 200 (normalized query)', async () => {
      const sampleTxtPath = path.join(__dirname, 'fixtures', 'sample.txt');
      await request(app).post('/api/docs/upload').attach('file', sampleTxtPath).expect(201);

      const res = await request(app)
        .get('/api/docs/search?q=a&limit=20&offset=0')
        .expect(200);

      expect(res.body).toHaveProperty('query', 'a');
      expect(res.body).toHaveProperty('results');
      expect(Array.isArray(res.body.results)).toBe(true);
    });
  });

  describe('C) Q&A edge-cases', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    test('5) no docs in system -> 200 with "Bilmiyorum" and based_on_docs: []', async () => {
      const res = await request(app)
        .post('/api/qa')
        .send({ question: 'What is the support email?' })
        .expect(200);

      expect(res.body).toHaveProperty('answer');
      expect(res.body.answer).toMatch(/Bilmiyorum/i);
      expect(res.body).toHaveProperty('based_on_docs');
      expect(Array.isArray(res.body.based_on_docs)).toBe(true);
      expect(res.body.based_on_docs).toHaveLength(0);
    });

    test('6) conflicting docs -> based_on_docs has >=2 different docId and answer mentions conflict', async () => {
      const conflict1 = path.join(__dirname, 'fixtures', 'conflict1.txt');
      const conflict2 = path.join(__dirname, 'fixtures', 'conflict2.txt');

      await request(app).post('/api/docs/upload').attach('file', conflict1).expect(201);
      await request(app).post('/api/docs/upload').attach('file', conflict2).expect(201);

      geminiService.generateAnswer.mockImplementation(async (_question, chunks) => {
        const seen = new Map();
        for (const ch of chunks) {
          if (!seen.has(ch.docId)) seen.set(ch.docId, ch);
          if (seen.size >= 2) break;
        }
        const selected = Array.from(seen.values());
        const citations = selected.map((ch) => ({
          docId: ch.docId,
          docName: ch.docName,
          chunkId: ch.chunkId,
          startChar: ch.startChar,
          endChar: Math.min(ch.endChar, ch.startChar + 60),
          quote: (ch.text || '').slice(0, 120)
        }));

        return {
          answer: 'Çelişki var: iki dokümanda farklı destek e-postası belirtiliyor.',
          citations,
          confidence: 'medium'
        };
      });

      const res = await request(app)
        .post('/api/qa')
        .send({ question: 'Support email nedir?', topK: 5, docLimit: 5 })
        .expect(200);

      expect(res.body).toHaveProperty('answer');
      expect(res.body.answer).toMatch(/çelişki|farklı/i);
      expect(res.body).toHaveProperty('based_on_docs');
      expect(Array.isArray(res.body.based_on_docs)).toBe(true);
      expect(res.body.based_on_docs.length).toBeGreaterThanOrEqual(2);

      const docIds = new Set(res.body.based_on_docs.map((c) => c.docId));
      expect(docIds.size).toBeGreaterThanOrEqual(2);
    });
  });

  describe('D) Summary edge-cases', () => {
    test('7) summary/short when extraction fails -> 422 EXTRACTION_FAILED', async () => {
      const documentsRepo = require('../src/repositories/documentsRepo');
      const textExtractor = require('../src/services/textExtractor');

      const spy = jest.spyOn(textExtractor, 'extractTextFromFile').mockRejectedValue(new Error('extraction failed'));

      const doc = documentsRepo.createDocument({
        originalName: 'scan.pdf',
        storedName: 'scan.pdf',
        storedPath: path.join(process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads-test'), 'scan.pdf'),
        mimeType: 'application/pdf',
        size: 0,
        sha256: `sha-${Date.now()}-${Math.random()}`,
        contentText: null
      });

      const res = await request(app)
        .post(`/api/docs/${doc.id}/summary/short`)
        .expect(422);

      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toHaveProperty('code', 'EXTRACTION_FAILED');

      spy.mockRestore();
    });

    test('8) invalid long summary params -> 400 BAD_REQUEST', async () => {
      const sampleTxtPath = path.join(__dirname, 'fixtures', 'sample.txt');
      const uploadRes = await request(app).post('/api/docs/upload').attach('file', sampleTxtPath).expect(201);
      const docId = uploadRes.body.id;

      await request(app)
        .post(`/api/docs/${docId}/summary/long`)
        .send({ level: 'mega', format: 'structured' })
        .expect(400);

      const res2 = await request(app)
        .post(`/api/docs/${docId}/summary/long`)
        .send({ level: 'medium', format: 'weird' })
        .expect(400);

      expect(res2.body).toHaveProperty('error');
      expect(res2.body.error).toHaveProperty('code', 'BAD_REQUEST');
    });
  });
});


