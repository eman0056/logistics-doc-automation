import React, { useState, useEffect } from 'react';

export const DEFAULT_DEMO_ESCALATIONS = [
  { id: 'esc-1', documentId: 'demo-doc-1', docNumber: 'DHL_Express_Invoice_091.pdf', invoiceNumber: 'INV-9021', reason: 'Poor Image Quality', date: '2026-09-24', status: 'Poor Image Quality', isMulti: true, invoiceIndex: 0 },
  { id: 'esc-2', documentId: 'demo-doc-2', docNumber: 'Maersk_Bill_Of_Lading.pdf', invoiceNumber: 'BL-88102', reason: 'Poor Image Quality', date: '2026-09-24', status: 'Poor Image Quality', isMulti: false },
  { id: 'esc-3', documentId: 'demo-doc-3', docNumber: 'FedEx_Freight_Shipment.pdf', invoiceNumber: 'INV-4401', reason: 'Missing Line Items', date: '2026-09-23', status: 'Escalation Required', isMulti: true, invoiceIndex: 1 },
  { id: 'esc-4', documentId: 'demo-doc-4', docNumber: 'Combined_Invoices_Sept.pdf', invoiceNumber: 'INV-1092', reason: 'Poor Image Quality', date: '2026-09-23', status: 'Poor Image Quality', isMulti: true, invoiceIndex: 2 },
  { id: 'esc-5', documentId: 'demo-doc-5', docNumber: 'Apex_Logistics_Receipt.pdf', invoiceNumber: 'REC-332', reason: 'Unclear Currency', date: '2026-09-22', status: 'Escalation Required', isMulti: false },
  { id: 'esc-6', documentId: 'demo-doc-6', docNumber: 'Port_Terminal_Fee.pdf', invoiceNumber: 'PTF-9901', reason: 'Poor Image Quality', date: '2026-09-22', status: 'Poor Image Quality', isMulti: false },
  { id: 'esc-7', documentId: 'demo-doc-7', docNumber: 'Customs_Clearance_Doc.pdf', invoiceNumber: 'CC-5521', reason: 'Unclear Tax ID', date: '2026-09-21', status: 'Escalation Required', isMulti: false },
  { id: 'esc-8', documentId: 'demo-doc-8', docNumber: 'Hapag_Lloyd_Invoice.pdf', invoiceNumber: 'HL-7712', reason: 'Poor Image Quality', date: '2026-09-21', status: 'Poor Image Quality', isMulti: true, invoiceIndex: 0 },
  { id: 'esc-9', documentId: 'demo-doc-9', docNumber: 'Ocean_Freight_Manifest.pdf', invoiceNumber: 'OFM-112', reason: 'Missing Weight', date: '2026-09-20', status: 'Escalation Required', isMulti: true, invoiceIndex: 1 },
  { id: 'esc-10', documentId: 'demo-doc-10', docNumber: 'Warehouse_Storage_Slip.pdf', invoiceNumber: 'WSS-404', reason: 'Poor Image Quality', date: '2026-09-20', status: 'Poor Image Quality', isMulti: false },
  { id: 'esc-11', documentId: 'demo-doc-11', docNumber: 'Kuehne_Nagel_Delivery.pdf', invoiceNumber: 'KN-9011', reason: 'Poor Image Quality', date: '2026-09-19', status: 'Poor Image Quality', isMulti: true, invoiceIndex: 0 },
  { id: 'esc-12', documentId: 'demo-doc-12', docNumber: 'DB_Schenker_Voucher.pdf', invoiceNumber: 'DBS-663', reason: 'Unclear Total', date: '2026-09-19', status: 'Escalation Required', isMulti: false }
];

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
      const res = await fetch('/api/documents?refresh=' + Date.now());
      const data = await res.json();
      const issues = [];
      const seenIds = new Set();

      (data.documents || []).forEach(doc => {
        const docStatus = doc.status || 'PENDING';
        const isDocFlagged = docStatus === 'Escalation Required' || docStatus === 'Poor Image Quality' || docStatus === 'POOR_IMAGE_QUALITY';
        
        if (isDocFlagged && !resolvedSet.has(doc.id)) {
          seenIds.add(doc.id);
          issues.push({
            id: doc.id,
            documentId: doc.id,
            docNumber: doc.fileName,
            invoiceNumber: 'Doc Level',
            reason: docStatus,
            date: doc.createdAt ? new Date(doc.createdAt).toISOString().split('T')[0] : '2026-09-24',
            status: 'Pending Review',
            isMulti: (doc.invoiceCount || 1) > 1
          });
        }

        (doc.invoices || []).forEach((inv, idx) => {
          const invStatus = inv.status || inv.extractionStatus;
          const isInvFlagged = invStatus === 'Poor Image Quality' || invStatus === 'POOR_IMAGE_QUALITY' || invStatus === 'Escalation Required' || inv.poorImageQuality;
          const invKey = `${doc.id}-${idx}`;

          if (isInvFlagged && !resolvedSet.has(invKey) && !resolvedSet.has(doc.id)) {
            seenIds.add(invKey);
            issues.push({
              id: invKey,
              documentId: doc.id,
              invoiceIndex: idx,
              docNumber: doc.fileName,
              invoiceNumber: inv.invoiceNumber || `Invoice #${idx + 1}`,
              reason: invStatus || (inv.poorImageQuality ? 'Poor Image Quality' : 'Escalation Required'),
              date: doc.createdAt ? new Date(doc.createdAt).toISOString().split('T')[0] : '2026-09-24',
              status: 'Pending Review',
              isMulti: true
            });
          }
        });
      });

      // Add default demo items if they haven't been resolved
      DEFAULT_DEMO_ESCALATIONS.forEach((demoItem) => {
        if (!resolvedSet.has(demoItem.id) && !seenIds.has(demoItem.id)) {
          issues.push(demoItem);
        }
      });

      setEscalations(issues);
    } catch (err) {
      console.error('Failed to load escalations', err);
      // Fallback to demo items excluding resolved
      const fallback = DEFAULT_DEMO_ESCALATIONS.filter(item => !resolvedSet.has(item.id));
      setEscalations(fallback);
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

  const filtered = escalations.filter(e => {
    const matchesSearch = (
      e.docNumber.toLowerCase().includes(search.toLowerCase()) ||
      e.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
      e.reason.toLowerCase().includes(search.toLowerCase())
    );
    if (!matchesSearch) return false;
    if (filterReason === 'POOR_QUALITY') return e.reason.includes('Poor Image Quality');
    if (filterReason === 'ESCALATED') return e.reason.includes('Escalation');
    return true;
  });

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
            📸⚠️ {escalations.length} Active Alerts
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
              All Flags ({escalations.length})
            </button>
            <button 
              type="button"
              className={filterReason === 'POOR_QUALITY' ? 'primary-btn' : 'secondary-btn'}
              onClick={() => setFilterReason('POOR_QUALITY')}
              style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
            >
              Poor Quality 📸
            </button>
            <button 
              type="button"
              className={filterReason === 'ESCALATED' ? 'primary-btn' : 'secondary-btn'}
              onClick={() => setFilterReason('ESCALATED')}
              style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
            >
              Data Issues ⚠️
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
                          Review
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
