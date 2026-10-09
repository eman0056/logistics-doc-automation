import React, { useState, useEffect } from 'react';
import { getInvoicePoorImageState } from './MultiInvoiceViews.jsx';

// FlaggedImagesCard: displays count of Poor Image Quality flags and navigates to Escalations page
export const FlaggedImagesCard = () => {
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const loadCount = async () => {
    try {
      const res = await fetch('/api/documents?refresh=' + Date.now());
      if (!res.ok) throw new Error(`Unable to load poor-image count (HTTP ${res.status}).`);
      const data = await res.json();
      const poorInvoiceKeys = new Set();
      (data.documents || []).forEach((doc) => {
        (doc.invoices || []).forEach((invoice, index) => {
          const invoiceIndex = Number(invoice.invoiceIndex ?? index);
          if (
            Number.isInteger(invoiceIndex)
            && invoiceIndex >= 0
            && getInvoicePoorImageState(invoice).poor
          ) {
            poorInvoiceKeys.add(`${doc.id}:${invoiceIndex}`);
          }
        });
      });
      setCount(poorInvoiceKeys.size);
    } catch (err) {
      console.error('Failed to load flagged count', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCount();
    const handler = () => loadCount();
    window.addEventListener('escalationResolved', handler);
    return () => window.removeEventListener('escalationResolved', handler);
  }, []);

  const navigate = () => {
    if (window.location.pathname !== '/escalations') {
      window.history.pushState({}, '', '/escalations');
      const popEvent = new PopStateEvent('popstate');
      dispatchEvent(popEvent);
    }
  };

  return (
    <div className="card" style={{ padding: '1.25rem', cursor: 'pointer', background: loading ? 'rgba(15,23,42,0.5)' : 'rgba(15,23,42,0.7)' }} onClick={navigate}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span className="status-pill danger" style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }}>
          📸⚠️ {loading ? '...' : count} Poor Image Quality
        </span>
      </div>
    </div>
  );
};
