import { useEffect, useState } from 'react';
import { getJSON, postJSON, downloadFile } from '../api.js';

export default function DocumentDetail({ docId, onClose }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [doc, setDoc] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState('');
  const [summary, setSummary] = useState(null);
  const [summaryType, setSummaryType] = useState(null); // 'short' or 'long'
  const [summaryMeta, setSummaryMeta] = useState(null); // { level, format, model }

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
      // Load existing summaries if available
      if (data.summaryShort) {
        setSummary(data.summaryShort);
        setSummaryType('short');
        setSummaryMeta({ model: data.summaryShortModel });
      } else if (data.summaryLong) {
        setSummary(data.summaryLong);
        setSummaryType('long');
        // Parse level:format from summaryLongLevel
        const levelField = data.summaryLongLevel || '';
        const [level, format] = levelField.split(':');
        setSummaryMeta({ level: level || 'medium', format: format || 'structured', model: data.summaryLongModel });
      } else {
        setSummary(null);
        setSummaryType(null);
        setSummaryMeta(null);
      }
    } catch (err) {
      setError(err?.message || 'Doküman yüklenemedi');
    } finally {
      setLoading(false);
    }
  }

  async function generateShortSummary() {
    if (!docId) return;
    setSummaryLoading(true);
    setSummaryError('');
    try {
      const result = await postJSON(`/api/docs/${docId}/summary/short`, {});
      setSummary(result.summaryShort);
      setSummaryType('short');
      setSummaryMeta({ model: result.model });
    } catch (err) {
      setSummaryError(err?.message || 'Özet oluşturulamadı');
    } finally {
      setSummaryLoading(false);
    }
  }

  async function generateLongSummary(level = 'medium', format = 'structured') {
    if (!docId) return;
    setSummaryLoading(true);
    setSummaryError('');
    try {
      const result = await postJSON(`/api/docs/${docId}/summary/long`, {
        level,
        format
      });
      setSummary(result.summaryLong);
      setSummaryType('long');
      setSummaryMeta({ level: result.level, format: result.format, model: result.model });
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
                    onClick={generateShortSummary}
                    disabled={summaryLoading}
                  >
                    {summaryLoading ? 'Oluşturuluyor…' : 'Kısa Özet'}
                  </button>
                  <button
                    className="btn"
                    onClick={() => generateLongSummary('medium', 'structured')}
                    disabled={summaryLoading}
                  >
                    {summaryLoading ? 'Oluşturuluyor…' : 'Uzun Özet'}
                  </button>
                </div>
              </div>

              {summaryError ? <div className="errorBox">{summaryError}</div> : null}

              {summary ? (
                <div className="summaryBox">
                  <div className="summaryContent">{summary}</div>
                  {summaryMeta && (
                    <div className="muted" style={{ marginTop: '8px', fontSize: '12px' }}>
                      Tip: {summaryType === 'short' ? 'Kısa Özet' : `Uzun Özet (${summaryMeta.level || 'medium'}, ${summaryMeta.format || 'structured'})`}
                      {summaryMeta.model && ` • Model: ${summaryMeta.model}`}
                    </div>
                  )}
                </div>
              ) : (
                <div className="muted">Henüz özet oluşturulmadı. Yukarıdaki butonları kullanarak özet oluşturabilirsiniz.</div>
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

