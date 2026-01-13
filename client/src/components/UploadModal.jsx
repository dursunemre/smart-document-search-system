import { useMemo, useState } from 'react';
import { postFormData } from '../api.js';

function formatKB(bytes) {
  if (typeof bytes !== 'number') return '-';
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default function UploadModal({ onClose, onUploaded }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [uploaded, setUploaded] = useState(null);

  const accept = useMemo(() => '.pdf,.txt', []);

  async function handleUpload(e) {
    e.preventDefault();
    setError('');
    setUploaded(null);

    if (!file) {
      setError('Please select a file');
      return;
    }

    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const result = await postFormData('/api/docs/upload', fd);
      setUploaded(result);
      onUploaded?.(result);
    } catch (err) {
      setError(err?.message || 'Upload failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modalContent" onClick={(e) => e.stopPropagation()}>
        <div className="modalHeader">
          <h2>Upload</h2>
          <button className="btn" onClick={onClose}>✕</button>
        </div>

        <p className="muted" style={{ marginBottom: '14px' }}>PDF or TXT (max 10MB)</p>

        <form className="row" onSubmit={handleUpload}>
          <input
            type="file"
            accept={accept}
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            disabled={loading}
          />
          <button className="btn primary" type="submit" disabled={loading}>
            {loading ? 'Uploading…' : 'Upload'}
          </button>
        </form>

        {error ? <div className="errorBox">{error}</div> : null}

        {uploaded ? (
          <div className="successBox">
            <div className="successTitle">Uploaded</div>
            <div className="grid2">
              <div>
                <div className="label">originalName</div>
                <div className="value">{uploaded.originalName || '-'}</div>
              </div>
              <div>
                <div className="label">mimeType</div>
                <div className="value">{uploaded.mimeType || '-'}</div>
              </div>
              <div>
                <div className="label">size</div>
                <div className="value">{formatKB(uploaded.size)}</div>
              </div>
              <div>
                <div className="label">createdAt</div>
                <div className="value">{uploaded.createdAt || uploaded.uploadedAt || '-'}</div>
              </div>
            </div>

            {uploaded.extractedText ? (
              <div className="previewBox">
                <div className="label">extractedText</div>
                <div className="muted">
                  charCount: {uploaded.extractedText.charCount ?? 0}
                </div>
                <pre className="preview">{uploaded.extractedText.preview || ''}</pre>
              </div>
            ) : (
              <div className="muted">No extractedText in response.</div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}


