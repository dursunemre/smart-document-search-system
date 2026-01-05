function formatKB(bytes) {
  if (typeof bytes !== 'number') return '-';
  return (bytes / 1024).toFixed(1);
}

export default function DocumentsTable({
  loading,
  error,
  data,
  limit,
  offset,
  onPrev,
  onNext,
  onRefresh
}) {
  const results = data?.results || [];
  const total = data?.total;

  const canPrev = offset > 0 && !loading;
  const canNext =
    !loading &&
    (typeof total === 'number' ? offset + limit < total : results.length === limit);

  return (
    <section className="card">
      <div className="cardHeader row between">
        <div>
          <h2>Documents</h2>
          <p className="muted">
            {typeof total === 'number'
              ? `Total: ${total}`
              : `Showing: ${results.length}`}
          </p>
        </div>
        <div className="row">
          <button className="btn" onClick={onRefresh} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {error ? <div className="errorBox">{error}</div> : null}

      <div className="tableWrap">
        <table className="table">
          <thead>
            <tr>
              <th>originalName</th>
              <th>mimeType</th>
              <th className="right">size (KB)</th>
              <th>createdAt</th>
            </tr>
          </thead>
          <tbody>
            {results.length ? (
              results.map((d) => (
                <tr key={d.id || `${d.storedName}-${d.createdAt}`}>
                  <td className="mono">{d.originalName || '-'}</td>
                  <td className="mono">{d.mimeType || '-'}</td>
                  <td className="right mono">{formatKB(d.size)}</td>
                  <td className="mono">{d.createdAt || '-'}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="4" className="muted">
                  {loading ? 'Loading…' : 'No documents'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="row between">
        <div className="muted">
          limit={limit}, offset={offset}
        </div>
        <div className="row">
          <button className="btn" onClick={onPrev} disabled={!canPrev}>
            Prev
          </button>
          <button className="btn" onClick={onNext} disabled={!canNext}>
            Next
          </button>
        </div>
      </div>
    </section>
  );
}


