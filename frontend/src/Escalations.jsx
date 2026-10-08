import React, { useState, useEffect } from 'react';
import { getInvoicePoorImageState } from './MultiInvoiceViews.jsx';

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
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [filterReason, setFilterReason] = useState('ALL');
  const [resolvingId, setResolvingId] = useState(null);
  const [toastMsg, setToastMsg] = useState('');

  const loadEscalations = async () => {
    const resolvedIds = getResolvedEscalationIds();
    const resolvedSet = new Set(resolvedIds);

    try {
      setLoading(true);
      setLoadError('');
      const res = await fetch(`/api/documents?refresh=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Unable to load escalations (HTTP ${res.status}).`);
      const data = await res.json();
      if (!Array.isArray(data.documents)) throw new Error('The document list response did not include documents.');
      const documents = data.documents;
      const documentsWithInvoices = documents.filter((doc) => (
        doc.id && (Number(doc.invoiceCount) > 0 || (Array.isArray(doc.invoices) && doc.invoices.length > 0))
      ));
      const documentsById = new Map(documentsWithInvoices.map((doc) => [doc.id, doc]));
      const invoiceChunks = [];
      for (let i = 0; i < documentsWithInvoices.length; i += 100) {
        invoiceChunks.push(documentsWithInvoices.slice(i, i + 100));
      }
      const invoiceResponses = await Promise.all(invoiceChunks.map(async (documentChunk) => {
        const ids = documentChunk.map((doc) => doc.id).join(',');
        const requestDocId = documentChunk[0].id;
        const invoiceRes = await fetch(
          `/api/documents/${encodeURIComponent(requestDocId)}/invoices?ids=${encodeURIComponent(ids)}&refresh=${Date.now()}`,
          { cache: 'no-store' }
        );
        if (!invoiceRes.ok) {
          throw new Error(`Unable to load invoice records (HTTP ${invoiceRes.status}).`);
        }
        const invoiceData = await invoiceRes.json();
        if (!Array.isArray(invoiceData.invoices)) {
          throw new Error('The invoice list response did not include invoices.');
        }
        return {
          invoices: invoiceData.invoices
        };
      }));
      const seenInvoices = new Set();
      const issues = [];
      invoiceResponses.forEach(({ invoices }) => {
        invoices.forEach((invoice) => {
          const documentId = invoice.documentId;
          const doc = documentsById.get(documentId);
          const invoiceIndex = Number(invoice.invoiceIndex);
          const invoiceId = invoice.id || `${documentId}:${invoiceIndex}`;
          const invoiceKey = `${documentId}:${invoiceIndex}`;
          if (
            !documentId
            || !doc
            || !Number.isInteger(invoiceIndex)
            || invoiceIndex < 0
            || !getInvoicePoorImageState(invoice).poor
            || resolvedSet.has(invoiceId)
            || seenInvoices.has(invoiceKey)
          ) return;
          seenInvoices.add(invoiceKey);
          issues.push({
            id: invoiceId,
            documentId,
            invoiceIndex,
            docNumber: invoice.fileName || invoice.sourceFileName || doc.fileName || documentId,
            invoiceNumber: `Invoice #${invoiceIndex + 1}`,
            reason: 'Poor Image Quality',
            date: String(doc.createdAt || '').slice(0, 10),
            status: 'Pending Review',
            isMulti: Number(doc.invoiceCount || invoices.length) > 1,
            scope: 'invoice',
            poorImageQuality: true,
            hasInvoiceNumber: false,
            hasExtraction: true
          });
        });
      });
      setEscalations(issues);
    } catch (err) {
      console.error('Failed to load escalations', err);
      setEscalations([]);
      setLoadError(err.message || 'Unable to load escalations.');
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
  const poorQualityCount = filtered.length;
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

        {loading ? <p className="subtle-copy">Loading flagged documents...</p> : loadError ? (
          <p className="subtle-copy">{loadError}</p>
        ) : (
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
                const reviewUrl = `/documents/${esc.documentId}/multi-workspace?invoiceIndex=${esc.invoiceIndex}`;

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
                      {escalations.length === 0
                        ? '🎉 No poor-image invoices found.'
                        : 'No invoices match the current search or filter.'}
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
