const { buildBasedOnDocs, sanitizeQuote } = require('../src/utils/citations');

function makeChunks() {
  return [
    {
      chunkId: 'doc123_chunk_0',
      docId: 'doc123',
      docName: 'policy.pdf',
      startChar: 100,
      endChar: 300,
      text: 'Line1\nLine2\tLine3 ' + 'A'.repeat(400)
    },
    {
      chunkId: 'doc999_chunk_1',
      docId: 'doc999',
      docName: 'notes.txt',
      startChar: 0,
      endChar: 120,
      text: 'Hello world. This is a second document with some content.'
    },
    {
      chunkId: 'doc777_chunk_0',
      docId: 'doc777',
      docName: 'guide.pdf',
      startChar: 0,
      endChar: 200,
      text: 'Third chunk text. ' + 'B'.repeat(220)
    }
  ];
}

test('buildBasedOnDocs: uses valid LLM citations when they match retrieved chunks', () => {
  const retrievedChunks = makeChunks();
  const llmCitations = [
    {
      chunkId: 'doc123_chunk_0',
      docId: 'doc123',
      docName: 'policy.pdf',
      startChar: 120,
      endChar: 180,
      quote: 'Q'.repeat(500)
    }
  ];

  const out = buildBasedOnDocs({ llmCitations, retrievedChunks, maxCitations: 3 });
  expect(out).toHaveLength(1);
  expect(out[0].chunkId).toBe('doc123_chunk_0');
  expect(out[0].docId).toBe('doc123');
  expect(out[0].quote.length).toBeLessThanOrEqual(200);
});

test('buildBasedOnDocs: discards hallucinated docId/chunkId and falls back to retrieved chunks', () => {
  const retrievedChunks = makeChunks();
  const llmCitations = [
    { chunkId: 'fake_chunk', docId: 'fake_doc', startChar: 0, endChar: 10, quote: 'fake' }
  ];

  const out = buildBasedOnDocs({ llmCitations, retrievedChunks, maxCitations: 3 });
  expect(out).toHaveLength(3);
  expect(out[0].chunkId).toBe(retrievedChunks[0].chunkId);
});

test('buildBasedOnDocs: falls back when LLM citations are missing', () => {
  const retrievedChunks = makeChunks();
  const out = buildBasedOnDocs({ llmCitations: null, retrievedChunks, maxCitations: 2 });
  expect(out).toHaveLength(2);
  expect(out[0].chunkId).toBe(retrievedChunks[0].chunkId);
  expect(out[1].chunkId).toBe(retrievedChunks[1].chunkId);
});

test('sanitizeQuote: trims, collapses whitespace, and caps to 200 chars', () => {
  const s = sanitizeQuote('  hello\nworld\t\t' + 'x'.repeat(300) + '   ');
  expect(s.includes('\n')).toBe(false);
  expect(s.includes('\t')).toBe(false);
  expect(s.startsWith('hello world')).toBe(true);
  expect(s.length).toBeLessThanOrEqual(200);
});


