// SummaryCards.jsx
import React, { useEffect, useState } from 'react';

// Helper to fetch JSON without cache
const fetchJson = async (url) => {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load data');
  return await res.json();
};

export const SummaryCards = () => {
  const [totalDocs, setTotalDocs] = useState(null);
  const [readyCount, setReadyCount] = useState(null);
  const [flaggedCount, setFlaggedCount] = useState(null);
  const [escalationCount, setEscalationCount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadCounts = async () => {
    try {
      const data = await fetchJson('/api/documents');
      const docs = data.documents || [];

      setTotalDocs(docs.length);

      const ready = docs.filter((d) => {
        const s = (d.status || '').toUpperCase();
        return s === '' || s === 'PENDING' || s === 'IN_REVIEW';
      }).length;
      setReadyCount(ready);

      // count flagged / poor quality
      let flagged = 0;
      docs.forEach((doc) => {
        if (doc.status?.includes('Poor Image Quality')) flagged++;
        (doc.invoices || []).forEach((inv) => {
          if (
            inv.status?.includes('Poor Image Quality') ||
            inv.extractionStatus?.includes('Poor Image Quality') ||
            inv.poorImageQuality
          ) flagged++;
        });
      });
      setFlaggedCount(flagged);
      setEscalationCount(flagged);
    } catch (e) {
      console.error('🔴 SummaryCards load error', e);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCounts();
    const handler = () => loadCounts();
    window.addEventListener('escalationResolved', handler);
    return () => window.removeEventListener('escalationResolved', handler);
  }, []);

  if (loading) return <p className="subtle-copy">Loading dashboard summary…</p>;
  if (error) return <p style={{ color: 'red' }}>Error loading summary: {error}</p>;

  return (
    <div
      className="summary-cards"
      style={{
        display: 'flex',
        gap: '1rem',
        flexWrap: 'wrap',
        marginBottom: '1.5rem',
      }}
    >
      <div className="card" style={{ flex: '1 1 180px', padding: '1.25rem' }}>
        <div className="eyebrow">Total Documents</div>
        <h2>{totalDocs ?? '—'}</h2>
      </div>

      <div className="card" style={{ flex: '1 1 180px', padding: '1.25rem' }}>
        <div className="eyebrow">Ready for Review</div>
        <h2>{readyCount ?? '—'}</h2>
      </div>

      <div
        className="card"
        style={{
          flex: '1 1 180px',
          padding: '1.25rem',
          background: 'radial-gradient(circle at 30% 30%, #ff8c00 0%, #b63c00 80%)',
          color: '#fff',
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
        }}
        onClick={() => {
          if (window.location.pathname !== '/escalations') {
            window.history.pushState({}, '', '/escalations');
            dispatchEvent(new PopStateEvent('popstate'));
          }
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span className="status-pill danger" style={{ fontSize: '0.85rem' }}>
            📸⚠️ {flaggedCount ?? '—'} Poor Image Quality
          </span>
        </div>
      </div>

      <div className="card" style={{ flex: '1 1 180px', padding: '1.25rem' }}>
        <div className="eyebrow">Escalations</div>
        <h2>{escalationCount ?? '—'}</h2>
      </div>
    </div>
  );
};
