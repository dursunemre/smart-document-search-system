import { useState } from 'react';
import { postJSON } from '../api.js';

export default function QAPanel({ documents = [] }) {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setResult(null);

    const trimmed = question.trim();
    if (!trimmed) {
      setError('Lütfen bir soru girin');
      return;
    }

    setLoading(true);
    try {
      const requestBody = {
        question: trimmed,
        topK: 6,
        docLimit: 15
      };

      const response = await postJSON('/api/qa', requestBody);
      setResult(response);
    } catch (err) {
      setError(err?.message || 'Soru-cevap işlemi başarısız');
    } finally {
      setLoading(false);
    }
  }

  function handleClear() {
    setQuestion('');
    setError('');
    setResult(null);
  }

  return (
    <section className="card">
      <div className="cardHeader">
        <h2>Soru-Cevap (Q&A)</h2>
        <p className="muted">
          Tüm dokümanlar içinde soru sorun
        </p>
      </div>

      <form className="row" onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Sorunuzu yazın..."
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          disabled={loading}
        />
        <button className="btn primary" type="submit" disabled={loading}>
          {loading ? 'Soruluyor…' : 'Sor'}
        </button>
        <button className="btn" type="button" onClick={handleClear} disabled={loading}>
          Temizle
        </button>
      </form>

      {error ? <div className="errorBox">{error}</div> : null}

      {result ? (
        <div className="qaResult">
          <div className="qaQuestion">
            <div className="label">Soru</div>
            <div className="value">{result.question}</div>
          </div>

          <div className="qaAnswer">
            <div className="label">Cevap</div>
            <div className="value">{result.answer}</div>
          </div>

          {result.based_on_docs && result.based_on_docs.length > 0 ? (
            <div className="qaCitations">
              <div className="label">Kaynaklar</div>
              <div className="citationsList">
                {result.based_on_docs.map((cite, idx) => (
                  <div key={idx} className="citationItem">
                    <div className="citationDoc">{cite.docName || cite.docId || '-'}</div>
                    {cite.quote ? (
                      <div className="citationQuote">"{cite.quote}"</div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

