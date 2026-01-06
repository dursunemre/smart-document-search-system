/**
 * Retrieval service for Q&A
 * Handles document selection, text extraction, chunking, and scoring
 */
const documentsRepo = require('../repositories/documentsRepo');
const { extractTextFromFile } = require('./textExtractor');
const { chunkText } = require('../utils/chunkText');
const { extractKeywords } = require('../utils/normalize');

/**
 * Get text content for a document
 * @param {Object} doc - Document object
 * @returns {Promise<string>} - Text content
 */
async function getDocumentText(doc) {
  // If content_text exists in DB, use it
  if (doc.contentText && doc.contentText.trim().length > 0) {
    return doc.contentText;
  }

  // Otherwise, extract from file
  try {
    const extracted = await extractTextFromFile({
      path: doc.storedPath,
      mimeType: doc.mimeType
    });
    return extracted.text;
  } catch (error) {
    console.warn(`Failed to extract text from ${doc.storedPath}:`, error.message);
    return '';
  }
}

/**
 * Score a chunk based on question keywords
 * @param {string} chunkText - Chunk text
 * @param {Array<string>} questionKeywords - Keywords from question
 * @returns {number} - Score
 */
function scoreChunk(chunkText, questionKeywords) {
  if (questionKeywords.length === 0) {
    return 0;
  }

  const chunkLower = chunkText.toLowerCase();
  let matchCount = 0;

  for (const keyword of questionKeywords) {
    if (chunkLower.includes(keyword.toLowerCase())) {
      matchCount++;
    }
  }

  // Score is ratio of matched keywords
  return matchCount / questionKeywords.length;
}

/**
 * Retrieve and score chunks for a question
 * @param {string} question - User question
 * @param {number} docLimit - Maximum number of documents to consider
 * @param {number} topK - Maximum number of chunks to return
 * @param {string} [docId] - Optional document ID to filter by
 * @returns {Promise<Array<Object>>} - Scored chunks with metadata
 */
async function retrieveChunks(question, docLimit = 5, topK = 5, docId = null) {
  // Extract keywords from question
  const questionKeywords = extractKeywords(question);

  // If docId is provided, use only that document
  let candidateDocs = [];
  
  if (docId) {
    const doc = documentsRepo.getDocumentById(docId);
    if (doc) {
      candidateDocs = [doc];
    } else {
      // Document not found, return empty chunks
      return [];
    }
  } else {
    // Try to get documents via search first
    if (questionKeywords.length > 0) {
      try {
        // Use first few keywords for search
        const searchQuery = questionKeywords.slice(0, 3).join(' ');
        const searchResult = documentsRepo.searchDocumentsByKeyword(searchQuery, {
          limit: docLimit,
          offset: 0,
          docId: null // Search all documents
        });
        
        if (searchResult.results && searchResult.results.length > 0) {
          // Get full document objects
          candidateDocs = searchResult.results.map(result => 
            documentsRepo.getDocumentById(result.id)
          ).filter(doc => doc !== null);
        }
      } catch (error) {
        console.warn('Search failed, falling back to recent documents:', error.message);
      }
    }

    // If no documents from search, get recent documents
    if (candidateDocs.length === 0) {
      const recentDocs = documentsRepo.listDocuments({ limit: docLimit, offset: 0 });
      candidateDocs = recentDocs.results || recentDocs;
    }

    // Limit to docLimit
    candidateDocs = candidateDocs.slice(0, docLimit);
  }

  // Get text for each document and chunk
  const allChunks = [];

  for (const doc of candidateDocs) {
    try {
      const text = await getDocumentText(doc);
      
      if (!text || text.trim().length === 0) {
        continue;
      }

      // Chunk the text
      const chunks = chunkText(text, 1000, 100);

      // Add metadata to each chunk
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const chunkId = `${doc.id}_chunk_${i}`;
        
        allChunks.push({
          chunkId,
          docId: doc.id,
          docName: doc.originalName,
          text: chunk.text,
          startChar: chunk.startChar,
          endChar: chunk.endChar,
          score: scoreChunk(chunk.text, questionKeywords)
        });
      }
    } catch (error) {
      console.warn(`Failed to process document ${doc.id}:`, error.message);
      continue;
    }
  }

  // Sort by score (descending) and take topK
  allChunks.sort((a, b) => b.score - a.score);
  const topChunks = allChunks.slice(0, topK);

  return topChunks;
}

module.exports = { retrieveChunks };

