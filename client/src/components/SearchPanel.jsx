import { useEffect, useState } from 'react';
import { getJSON } from '../api.js';

export default function SearchPanel({ documents = [] }) {
  const [q, setQ] = useState('');
  const [selectedDocId, setSelectedDocId] = useState('');
  const [mode, setMode] = useState('');
  const [limit] = useState(20);
  const [offset, setOffset] = useState(0);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState({ total: 0, results: [], query: '', mode: '' });

  async function runSearch(nextOffset = offset, nextQ = q) {
    setError('');
    const trimmed = (nextQ || '').trim();
    if (!trimmed) {
      setError('Please enter a search query');
      return;
    }
    setLoading(true);
    try {
      let url = `/api/docs/search?q=${encodeURIComponent(trimmed)}&limit=${limit}&offset=${nextOffset}`;
      if (selectedDocId) {
        url += `&docId=${encodeURIComponent(selectedDocId)}`;
      }
      const res = await getJSON(url);
      setData(res);
      setMode(res?.mode || '');
      setOffset(nextOffset);
    } catch (err) {
      setError(err?.message || 'Search failed');
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    runSearch(0, q);
  }

  function handleClear() {
    setQ('');
    setSelectedDocId('');
    setMode('');
    setOffset(0);
    setError('');
    setData({ total: 0, results: [], query: '', mode: '' });
  }

  const results = data?.results || [];
  const total = typeof data?.total === 'number' ? data.total : results.length;
  const canPrev = offset > 0 && !loading;
  const canNext = !loading && offset + limit < total;

  // optional: if user edits query, reset paging indicator (but don't auto-search)
  useEffect(() => {
    setOffset(0);
  }, [q]);

  return (
    <section className="card">
      <div className="cardHeader">
        <h2>Search</h2>
        <p className="muted">
          {selectedDocId ? 'Seçili doküman içinde ara' : 'Tüm dokümanlarda ara'} • mode: <span className="mono">{mode || '-'}</span>
        </p>
      </div>

      <div style={{ marginBottom: '14px' }}>
        <select
          value={selectedDocId}
          onChange={(e) => {
            setSelectedDocId(e.target.value);
            setOffset(0);
            setData({ total: 0, results: [], query: '', mode: '' });
          }}
          disabled={loading}
        >
          <option value="">Tüm Dokümanlar</option>
          {documents.map((doc) => (
            <option key={doc.id} value={doc.id}>
              {doc.originalName || doc.id}
            </option>
          ))}
        </select>
      </div>

      <form className="row" onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="keyword…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          disabled={loading}
        />
        <button className="btn primary" type="submit" disabled={loading}>
          {loading ? 'Searching…' : 'Search'}
        </button>
        <button className="btn" type="button" onClick={handleClear} disabled={loading}>
          Clear
        </button>
      </form>

      {error ? <div className="errorBox">{error}</div> : null}

      <div className="row between">
        <div className="muted">
          {data?.query ? (
            <>
              query=<span className="mono">{data.query}</span>, total={total}
            </>
          ) : (
            <>total={total}</>
          )}
        </div>
        <div className="row">
          <button className="btn" onClick={() => runSearch(Math.max(0, offset - limit), q)} disabled={!canPrev}>
            Prev
          </button>
          <button className="btn" onClick={() => runSearch(offset + limit, q)} disabled={!canNext}>
            Next
          </button>
        </div>
      </div>

      <div className="list">
        {results.length ? (
          results.map((d) => (
            <div key={d.id || `${d.storedName}-${d.createdAt}`} className="listItem">
              <div className="row between">
                <div className="mono">{d.originalName || '-'}</div>
                <div className="muted mono">{d.createdAt || '-'}</div>
              </div>
              <div className="muted mono">{d.mimeType || '-'}</div>
            </div>
          ))
        ) : (
          <div className="muted">{loading ? 'Searching…' : 'No results'}</div>
        )}
      </div>
    </section>
  );
}


