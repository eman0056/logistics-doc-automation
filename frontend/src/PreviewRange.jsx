import React, { useState } from 'react';

export const PreviewRange = () => {
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [previewData, setPreviewData] = useState(null);

  const handleGenerate = async () => {
      if (!fromDate || !toDate) return;
      setLoading(true);
      try {
          const res = await fetch('/api/documents');
          const data = await res.json();
          
          let totalDocs = 0;
          let totalInvoices = 0;
          let ready = 0;
          let escalated = 0;
          let poorQuality = 0;

          const fromD = new Date(fromDate);
          const toD = new Date(toDate);
          toD.setHours(23, 59, 59, 999);

          const filtered = (data.documents || []).filter(doc => {
              const d = new Date(doc.createdAt);
              return d >= fromD && d <= toD;
          });

          filtered.forEach(doc => {
              totalDocs++;
              const invCount = doc.invoiceCount || 1;
              totalInvoices += invCount;
              
              if (doc.status === 'Ready for Review' || doc.status === 'Completed' || doc.status === 'EXTRACTED') ready++;
              if (doc.status === 'Escalation Required') escalated++;
              if (doc.status === 'Poor Image Quality') poorQuality++;
          });

          setPreviewData({
              filtered,
              totalDocs,
              totalInvoices,
              ready,
              escalated,
              poorQuality
          });
      } finally {
          setLoading(false);
      }
  };

  return (
    <main className="page">
      <div className="section-header">
        <h1 className="page-title">Date Range Preview</h1>
      </div>
      <div className="card" style={{ padding: '20px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', gap: '20px', alignItems: 'end' }}>
              <div>
                  <label>From Date:</label>
                  <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} style={{ padding: '8px', display: 'block', marginTop: '5px' }} />
              </div>
              <div>
                  <label>To Date:</label>
                  <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} style={{ padding: '8px', display: 'block', marginTop: '5px' }} />
              </div>
              <button className="primary-btn" onClick={handleGenerate} disabled={loading || !fromDate || !toDate}>Generate Preview</button>
          </div>
      </div>
      
      {previewData && (
          <div className="card" style={{ padding: '20px' }}>
              <h3>Preview Summary</h3>
              <p>Selected From Date: {fromDate}</p>
              <p>Selected To Date: {toDate}</p>
              <div style={{ display: 'flex', gap: '20px', marginTop: '20px' }}>
                  <div className="status-pill neutral">Total Documents: {previewData.totalDocs}</div>
                  <div className="status-pill neutral">Total Invoices: {previewData.totalInvoices}</div>
                  <div className="status-pill success">Ready Documents: {previewData.ready}</div>
                  <div className="status-pill warning">Escalated: {previewData.escalated}</div>
                  <div className="status-pill danger">Poor Quality: {previewData.poorQuality}</div>
              </div>
              
              <h4 style={{ marginTop: '20px' }}>Records</h4>
              {previewData.filtered.length === 0 ? <p>No records found</p> : (
                  <table className="data-table">
                      <thead>
                          <tr>
                              <th>Document</th>
                              <th>Date</th>
                              <th>Status</th>
                          </tr>
                      </thead>
                      <tbody>
                          {previewData.filtered.map((d, i) => (
                              <tr key={i}>
                                  <td>{d.fileName}</td>
                                  <td>{new Date(d.createdAt).toLocaleDateString()}</td>
                                  <td>{d.status}</td>
                              </tr>
                          ))}
                      </tbody>
                  </table>
              )}
          </div>
      )}
    </main>
  );
};
