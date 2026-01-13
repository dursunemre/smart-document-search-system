import { useEffect, useMemo, useRef, useState } from 'react';
import { getJSON, postJSON, downloadFile } from '../api.js';

export default function DocumentDetail({ docId, onClose }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [doc, setDoc] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState('');
  const [summary, setSummary] = useState(null);
  const [summaryMeta, setSummaryMeta] = useState(null); // { model, createdAt }

  // In-document find (Ctrl+F behavior)
  const [findQ, setFindQ] = useState('');
  const [activeHit, setActiveHit] = useState(0);
  const findInputRef = useRef(null);

  const contentText = (doc?.contentText || '').toString();

  const matches = useMemo(() => {
    const q = (findQ || '').trim();
    if (!q) return [];

    const text = contentText;
    const lower = text.toLowerCase();
    const needle = q.toLowerCase();
    if (!needle) return [];

    const out = [];
    let i = 0;
    while (true) {
      const idx = lower.indexOf(needle, i);
      if (idx === -1) break;
      out.push({ start: idx, end: idx + needle.length });
      i = idx + needle.length; // non-overlapping
      if (out.length > 2000) break; // safety cap
    }
    return out;
  }, [contentText, findQ]);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.ctrlKey && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        findInputRef.current?.focus();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!matches.length) setActiveHit(0);
    else if (activeHit >= matches.length) setActiveHit(0);
  }, [matches.length, activeHit]);

  useEffect(() => {
    if (!matches.length) return;
    const el = document.getElementById(`doc-hit-${activeHit}`);
    el?.scrollIntoView({ block: 'center' });
  }, [activeHit, matches.length]);

  function nextHit() {
    if (!matches.length) return;
    setActiveHit((v) => (v + 1) % matches.length);
  }

  function prevHit() {
    if (!matches.length) return;
    setActiveHit((v) => (v - 1 + matches.length) % matches.length);
  }

  function renderHighlighted() {
    const text = contentText;
    if (!matches.length) return text;

    const nodes = [];
    let last = 0;
    for (let i = 0; i < matches.length; i++) {
      const m = matches[i];
      if (m.start > last) nodes.push(<span key={`t-${i}`}>{text.slice(last, m.start)}</span>);
      nodes.push(
        <mark
          key={`m-${i}`}
          id={`doc-hit-${i}`}
          className={i === activeHit ? 'active' : ''}
        >
          {text.slice(m.start, m.end)}
        </mark>
      );
      last = m.end;
    }
    if (last < text.length) nodes.push(<span key="tail">{text.slice(last)}</span>);
    return nodes;
  }

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
      // reset find state on open/change
      setFindQ('');
      setActiveHit(0);
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

            <div className="contentSection">
              <div className="cardHeader row between">
                <h3>İçerik</h3>
                <div className="row findBar">
                  <input
                    ref={findInputRef}
                    type="text"
                    placeholder="İçerikte bul (Ctrl+F)…"
                    value={findQ}
                    onChange={(e) => setFindQ(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (e.shiftKey) prevHit();
                        else nextHit();
                      }
                    }}
                  />
                  <div className="muted mono" style={{ minWidth: 80 }}>
                    {matches.length ? `${activeHit + 1}/${matches.length}` : '0/0'}
                  </div>
                  <button className="btn" onClick={prevHit} disabled={!matches.length}>Prev</button>
                  <button className="btn" onClick={nextHit} disabled={!matches.length}>Next</button>
                  <button
                    className="btn"
                    onClick={() => { setFindQ(''); setActiveHit(0); }}
                    disabled={!findQ}
                  >
                    Clear
                  </button>
                </div>
              </div>

              {!contentText.trim() ? (
                <div className="muted">
                  Bu doküman için çıkarılmış metin yok. (Scanned PDF olabilir; OCR gerekir.)
                </div>
              ) : (
                <div className="contentBox mono">{renderHighlighted()}</div>
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

