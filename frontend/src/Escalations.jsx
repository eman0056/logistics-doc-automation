import React, { useState, useEffect } from 'react';

export const DEFAULT_DEMO_ESCALATIONS = [];

export const getResolvedEscalationIds = () => {
  try {
    return JSON.parse(localStorage.getItem('resolved_escalations') || '[]');
  } catch {
    return [];
  }
};

export const Escalations = () => {
  const [escalations, setEscalations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterReason, setFilterReason] = useState('ALL');
  const [resolvingId, setResolvingId] = useState(null);
  const [toastMsg, setToastMsg] = useState('');

  const loadEscalations = async () => {
    const resolvedIds = getResolvedEscalationIds();
    const resolvedSet = new Set(resolvedIds);

    try {
      const res = await fetch(`/api/documents?escalations_only=true&refresh=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Unable to load escalations (HTTP ${res.status}).`);
      const data = await res.json();
      const seenInvoices = new Set();
      const issues = (data.escalations || []).filter((item) => {
        if (
          item.scope !== 'invoice'
          || !item.poorImageQuality
          || item.hasInvoiceNumber
          || !item.hasExtraction
          || resolvedSet.has(item.id)
          || resolvedSet.has(item.documentId)
        ) return false;
        const invoiceKey = `${item.documentId}:${item.invoiceIndex}`;
        if (seenInvoices.has(invoiceKey)) return false;
        seenInvoices.add(invoiceKey);
        return true;
      });
      setEscalations(issues);
    } catch (err) {
      console.error('Failed to load escalations', err);
      setEscalations([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEscalations();
  }, []);

  const handleResolve = async (escItem) => {
    const targetId = escItem.id;
    setResolvingId(targetId);

    try {
      const resolvedIds = getResolvedEscalationIds();
      if (!resolvedIds.includes(targetId)) {
        resolvedIds.push(targetId);
        localStorage.setItem('resolved_escalations', JSON.stringify(resolvedIds));
      }
      if (escItem.documentId && !escItem.documentId.startsWith('demo-doc')) {
        await fetch(`/api/documents/${escItem.documentId}/review`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ invoiceId: escItem.id, editedData: { status: 'APPROVED' } })
        }).catch(console.warn);
      }

      setEscalations(prev => prev.filter(item => item.id !== targetId));
      setToastMsg(`✓ "${escItem.docNumber}" resolved and marked Completed`);
      setTimeout(() => setToastMsg(''), 3000);
    } catch (err) {
      alert('Unable to resolve escalation: ' + err.message);
    } finally {
      setResolvingId(null);
    }
  };

  const searchable = escalations.filter(e => {
    const matchesSearch = (
      e.docNumber.toLowerCase().includes(search.toLowerCase()) ||
      e.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
      e.reason.toLowerCase().includes(search.toLowerCase())
    );
    return matchesSearch;
  });
  const filtered = searchable.filter(e => {
    if (filterReason === 'POOR_QUALITY') return e.reason.includes('Poor Image Quality');
    if (filterReason === 'ESCALATED') return e.reason.includes('Escalation');
    return true;
  });
  const poorQualityCount = searchable.filter(e => e.reason.includes('Poor Image Quality')).length;
  const dataIssuesCount = searchable.filter(e => e.reason.includes('Escalation')).length;

  return (
    <main className="page">
      <div className="section-header">
        <div>
          <div className="eyebrow">Attention Required</div>
          <h1 className="page-title">Flagged & Poor Quality Escalations</h1>
          <p className="subtle-copy mt-2">Review document image quality alerts and missing data before approval.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <span className="status-pill danger" style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }}>
            📸⚠️ {filtered.length} Active Alerts
          </span>
        </div>
      </div>

      {toastMsg && (
        <div style={{
          marginBottom: '1rem',
          padding: '0.8rem 1.2rem',
          background: 'rgba(31, 201, 145, 0.15)',
          border: '1px solid var(--success, #1FC991)',
          borderRadius: '8px',
          color: '#7ae7ac',
          fontWeight: 600,
          fontSize: '0.9rem'
        }}>
          {toastMsg}
        </div>
      )}

      <div className="card" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <input 
            type="text" 
            placeholder="Search document name, invoice # or flag reason..." 
            value={search} 
            onChange={e => setSearch(e.target.value)} 
            style={{ 
              padding: '0.6rem 1rem', 
              width: '100%', 
              maxWidth: '380px',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              background: 'rgba(15, 32, 51, 0.72)',
              color: '#fff'
            }}
          />

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button 
              type="button"
              className={filterReason === 'ALL' ? 'primary-btn' : 'secondary-btn'}
              onClick={() => setFilterReason('ALL')}
              style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
            >
              All Flags ({filtered.length})
            </button>
            <button 
              type="button"
              className={filterReason === 'POOR_QUALITY' ? 'primary-btn' : 'secondary-btn'}
              onClick={() => setFilterReason('POOR_QUALITY')}
              style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
            >
              Poor Quality 📸 ({poorQualityCount})
            </button>
            <button 
              type="button"
              className={filterReason === 'ESCALATED' ? 'primary-btn' : 'secondary-btn'}
              onClick={() => setFilterReason('ESCALATED')}
              style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
            >
              Data Issues ⚠️ ({dataIssuesCount})
            </button>
          </div>
        </div>

        {loading ? <p className="subtle-copy">Loading flagged documents...</p> : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Document Name</th>
                <th>Invoice Number</th>
                <th>Flag Reason</th>
                <th>Date Flagged</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((esc) => {
                const isPoorQuality = esc.reason.includes('Poor Image Quality');
                const reviewUrl = esc.isMulti 
                  ? `/documents/${esc.documentId}/multi-workspace${esc.invoiceIndex !== undefined ? `?invoiceIndex=${esc.invoiceIndex}` : ''}`
                  : `/documents/${esc.documentId}/review`;

                return (
                  <tr key={esc.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: '#f8fafc' }}>{esc.docNumber}</div>
                    </td>
                    <td>
                      <span className="status-pill neutral">{esc.invoiceNumber}</span>
                    </td>
                    <td>
                      <span className={`status-pill ${isPoorQuality ? 'danger' : 'warning'}`}>
                        {isPoorQuality ? '📸⚠️ ' : '⚠️ '} {esc.reason}
                      </span>
                    </td>
                    <td>{esc.date}</td>
                    <td>
                      <span style={{ color: 'var(--warning, #D9A35B)', fontWeight: 600, fontSize: '0.82rem' }}>
                        ● {esc.status}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                        <a 
                          href={reviewUrl} 
                          className="primary-btn" 
                          style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                        >
                          Review & Edit
                        </a>
                        <button
                          type="button"
                          className="secondary-btn"
                          onClick={() => handleResolve(esc)}
                          disabled={resolvingId === esc.id}
                          style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', color: '#7ae7ac', borderColor: 'rgba(31, 201, 145, 0.4)' }}
                        >
                          {resolvingId === esc.id ? 'Resolving...' : '✓ Resolve'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan="6">
                    <div className="empty-state">
                      🎉 No flagged items found! All invoices are verified and completed.
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
};
