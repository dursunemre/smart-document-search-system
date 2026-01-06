import { useEffect, useState } from 'react';
import { getJSON, postJSON, downloadFile } from '../api.js';

export default function DocumentDetail({ docId, onClose }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [doc, setDoc] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState('');
  const [summary, setSummary] = useState(null);
  const [summaryMeta, setSummaryMeta] = useState(null); // { model, createdAt }

  useEffect(() => {
    if (!docId) return;
    loadDocument();
  }, [docId]);

  async function loadDocument() {
    setLoading(true);
    setError('');
    try {
      const data = await getJSON(`/api/docs/${docId}`);
      setDoc(data);
      // If a previously generated summary exists, show it on open
      if (data.summary) {
        setSummary(data.summary);
        setSummaryMeta({ model: data.summaryModel, createdAt: data.summaryCreatedAt });
      } else {
        setSummary(null);
        setSummaryMeta(null);
      }
    } catch (err) {
      setError(err?.message || 'Doküman yüklenemedi');
    } finally {
      setLoading(false);
    }
  }

  async function generateSummary() {
    if (!docId) return;
    setSummaryLoading(true);
    setSummaryError('');
    setSummary(null);
    setSummaryMeta(null);
    try {
      const result = await postJSON(`/api/docs/${docId}/summary`, {});
      setSummary(result.summary);
      setSummaryMeta({ model: result.model, createdAt: result.createdAt });
    } catch (err) {
      setSummaryError(err?.message || 'Özet oluşturulamadı');
    } finally {
      setSummaryLoading(false);
    }
  }

  async function handleDownload() {
    if (!docId || !doc) return;
    try {
      await downloadFile(`/api/docs/${docId}/download`, doc.originalName);
    } catch (err) {
      setError(err?.message || 'İndirme başarısız');
    }
  }

  if (!docId) return null;

  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modalContent" onClick={(e) => e.stopPropagation()}>
        <div className="modalHeader">
          <h2>Doküman Detayları</h2>
          <button className="btn" onClick={onClose}>✕</button>
        </div>

        {loading ? (
          <div className="muted">Yükleniyor…</div>
        ) : error ? (
          <div className="errorBox">{error}</div>
        ) : doc ? (
          <>
            <div className="docInfo">
              <div className="grid2">
                <div>
                  <div className="label">Dosya Adı</div>
                  <div className="value mono">{doc.originalName || '-'}</div>
                </div>
                <div>
                  <div className="label">Tip</div>
                  <div className="value mono">{doc.mimeType || '-'}</div>
                </div>
                <div>
                  <div className="label">Boyut</div>
                  <div className="value mono">
                    {doc.size ? `${Math.round(doc.size / 1024)} KB` : '-'}
                  </div>
                </div>
                <div>
                  <div className="label">Oluşturulma</div>
                  <div className="value mono">{doc.createdAt || '-'}</div>
                </div>
              </div>
            </div>

            <div className="docActions">
              <button className="btn primary" onClick={handleDownload}>
                İndir
              </button>
            </div>

            <div className="summarySection">
              <div className="cardHeader row between">
                <h3>Özet</h3>
                <div className="row">
                  <button
                    className="btn"
                    onClick={generateSummary}
                    disabled={summaryLoading}
                  >
                    {summaryLoading ? 'Oluşturuluyor…' : 'Özet Oluştur'}
                  </button>
                </div>
              </div>

              {summaryError ? <div className="errorBox">{summaryError}</div> : null}

              {summaryLoading ? (
                <div className="muted">Özet oluşturuluyor…</div>
              ) : summary ? (
                <div className="summaryBox">
                  <div className="summaryContent">{summary}</div>
                  {summaryMeta && (
                    <div className="muted" style={{ marginTop: '8px', fontSize: '12px' }}>
                      {summaryMeta.createdAt ? `Oluşturulma: ${summaryMeta.createdAt}` : null}
                      {summaryMeta.model ? `${summaryMeta.createdAt ? ' • ' : ''}Model: ${summaryMeta.model}` : null}
                    </div>
                  )}
                </div>
              ) : (
                <div className="muted">Henüz özet oluşturulmadı. Yukarıdaki butona basarak özet oluşturabilirsiniz.</div>
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

