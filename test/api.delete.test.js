/**
 * Delete document endpoint tests
 */
const request = require('supertest');
const path = require('path');

const app = require('../src/app');
const db = require('../src/db');

describe('DELETE /api/docs/:id', () => {
  const sampleTxtPath = path.join(__dirname, 'fixtures', 'sample.txt');

  test('should delete document and related summaries', async () => {
    const uploadRes = await request(app).post('/api/docs/upload').attach('file', sampleTxtPath);
    expect(uploadRes.status).toBe(201);

    const docId = uploadRes.body.id;

    // Insert a fake summary history row to ensure cascade deletion works
    db.prepare(
      `INSERT INTO document_summaries (doc_id, summary, model, created_at) VALUES (?, ?, ?, ?)`
    ).run(docId, 'test summary', 'test-model', new Date().toISOString());

    const delRes = await request(app).delete(`/api/docs/${docId}`).expect(200);
    expect(delRes.body).toHaveProperty('ok', true);
    expect(delRes.body).toHaveProperty('docId', docId);

    // Document should be gone
    await request(app).get(`/api/docs/${docId}`).expect(404);

    // Download should be 404
    await request(app).get(`/api/docs/${docId}/download`).expect(404);

    // Summary history should be gone
    const cnt = db.prepare(`SELECT COUNT(*) as c FROM document_summaries WHERE doc_id = ?`).get(docId);
    expect(cnt.c).toBe(0);
  });
});


