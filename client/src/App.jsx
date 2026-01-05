import { useEffect, useState } from 'react';
import { getJSON } from './api.js';
import UploadCard from './components/UploadCard.jsx';
import DocumentsTable from './components/DocumentsTable.jsx';
import SearchPanel from './components/SearchPanel.jsx';

function normalizeListResponse(res, { limit, offset }) {
  // Expected: { total, limit, offset, results }
  if (res && typeof res === 'object' && Array.isArray(res.results)) return res;

  // Fallback: API returns an array
  if (Array.isArray(res)) {
    return { total: res.length, limit, offset, results: res };
  }

  // Unknown shape
  return { total: 0, limit, offset, results: [] };
}

export default function App() {
  const [limit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState({ total: 0, limit: 20, offset: 0, results: [] });

  async function fetchDocs(nextOffset = offset) {
    setError('');
    setLoading(true);
    try {
      const res = await getJSON(`/api/docs?limit=${limit}&offset=${nextOffset}`);
      const normalized = normalizeListResponse(res, { limit, offset: nextOffset });
      setData(normalized);
      setOffset(nextOffset);
    } catch (err) {
      setError(err?.message || 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchDocs(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="page">
      <header className="header">
        <div>
          <h1>Smart Docs</h1>
          <p className="muted">Upload, list, and search PDF/TXT documents.</p>
        </div>
        <div className="pill mono">API: /api → localhost:3000</div>
      </header>

      <main className="grid">
        <UploadCard onUploaded={() => fetchDocs(0)} />

        <DocumentsTable
          loading={loading}
          error={error}
          data={data}
          limit={limit}
          offset={offset}
          onRefresh={() => fetchDocs(offset)}
          onPrev={() => fetchDocs(Math.max(0, offset - limit))}
          onNext={() => fetchDocs(offset + limit)}
        />

        <SearchPanel />
      </main>

      <footer className="footer muted">
        No innerHTML. All rendering is plain React text nodes to avoid XSS.
      </footer>
    </div>
  );
}


