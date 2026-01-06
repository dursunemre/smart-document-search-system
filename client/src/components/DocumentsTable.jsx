import { useState } from 'react';
import { deleteJSON, downloadFile } from '../api.js';
import DocumentDetail from './DocumentDetail.jsx';
import UploadModal from './UploadModal.jsx';
import QAModal from './QAModal.jsx';

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
  onRefresh,
  onUploadSuccess
}) {
  const results = data?.results || [];
  const total = data?.total;
  const [selectedDocId, setSelectedDocId] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [qaOpen, setQaOpen] = useState(false);

  const canPrev = offset > 0 && !loading;
  const canNext =
    !loading &&
    (typeof total === 'number' ? offset + limit < total : results.length === limit);

  async function handleDownload(doc) {
    if (!doc.id) return;
    setDownloadingId(doc.id);
    try {
      await downloadFile(`/api/docs/${doc.id}/download`, doc.originalName);
    } catch (err) {
      alert(err?.message || 'İndirme başarısız');
    } finally {
      setDownloadingId(null);
    }
  }

  async function handleDelete(doc) {
    if (!doc?.id) return;
    const ok = window.confirm(`"${doc.originalName || 'Doküman'}" silinsin mi? Bu işlem geri alınamaz.`);
    if (!ok) return;

    setDeletingId(doc.id);
    try {
      await deleteJSON(`/api/docs/${doc.id}`);
      if (selectedDocId === doc.id) setSelectedDocId(null);
      await onRefresh?.();
    } catch (err) {
      alert(err?.message || 'Silme başarısız');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
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
            <button className="btn primary" onClick={() => setUploadOpen(true)} disabled={loading}>
              Upload
            </button>
            <button className="btn" onClick={() => setQaOpen(true)} disabled={loading}>
              Soru-Cevap
            </button>
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
                <th>Actions</th>
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
                    <td>
                      <div className="row" style={{ gap: '6px' }}>
                        <button
                          className="btn"
                          onClick={() => setSelectedDocId(d.id)}
                          style={{ fontSize: '12px', padding: '6px 10px' }}
                        >
                          Görüntüle
                        </button>
                        <button
                          className="btn"
                          onClick={() => handleDownload(d)}
                          disabled={downloadingId === d.id}
                          style={{ fontSize: '12px', padding: '6px 10px' }}
                        >
                          {downloadingId === d.id ? 'İndiriliyor…' : 'İndir'}
                        </button>
                        <button
                          className="btn"
                          onClick={() => handleDelete(d)}
                          disabled={deletingId === d.id}
                          style={{ fontSize: '12px', padding: '6px 10px' }}
                        >
                          {deletingId === d.id ? 'Siliniyor…' : 'Kaldır'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="muted">
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

      {selectedDocId && (
        <DocumentDetail docId={selectedDocId} onClose={() => setSelectedDocId(null)} />
      )}

      {uploadOpen && (
        <UploadModal
          onClose={() => setUploadOpen(false)}
          onUploaded={async () => {
            // New docs appear on the first page (sorted by createdAt DESC)
            await onUploadSuccess?.();
          }}
        />
      )}

      {qaOpen && <QAModal onClose={() => setQaOpen(false)} />}
    </>
  );
}


