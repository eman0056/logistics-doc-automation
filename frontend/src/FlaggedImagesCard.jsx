import React, { useState, useEffect } from 'react';

// FlaggedImagesCard: displays count of Poor Image Quality flags and navigates to Escalations page
export const FlaggedImagesCard = () => {
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const loadCount = async () => {
    try {
      const res = await fetch('/api/documents?refresh=' + Date.now());
      const data = await res.json();
      let total = 0;
      (data.documents || []).forEach(doc => {
        const docStatus = doc.status || '';
        const isDocPoor = docStatus.includes('Poor Image Quality') || docStatus === 'POOR_IMAGE_QUALITY' || doc.poorImageQuality || (doc.imageQuality != null && doc.imageQuality < 0.6);
        if (isDocPoor) total++;
        (doc.invoices || []).forEach(inv => {
          const invStatus = inv.status || inv.extractionStatus || '';
          if (invStatus.includes('Poor Image Quality') || invStatus === 'POOR_IMAGE_QUALITY' || inv.poorImageQuality || (inv.imageQuality != null && inv.imageQuality < 0.6)) total++;
        });
      });
      try {
        const resolved = JSON.parse(localStorage.getItem('resolved_escalations') || '[]');
        const demo = [
          { id: 'esc-1', reason: 'Poor Image Quality' },
          { id: 'esc-2', reason: 'Poor Image Quality' },
          { id: 'esc-4', reason: 'Poor Image Quality' },
          { id: 'esc-6', reason: 'Poor Image Quality' },
          { id: 'esc-8', reason: 'Poor Image Quality' },
          { id: 'esc-10', reason: 'Poor Image Quality' },
          { id: 'esc-11', reason: 'Poor Image Quality' }
        ];
        demo.forEach(item => {
          if (!resolved.includes(item.id)) total++;
        });
      } catch {}
      setCount(total);
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
