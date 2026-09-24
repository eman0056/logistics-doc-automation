import React, { useState, useEffect } from 'react';

export const Escalations = () => {
  const [escalations, setEscalations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  useEffect(() => {
    fetch('/api/documents')
      .then(res => res.json())
      .then(data => {
        const issues = [];
        (data.documents || []).forEach(doc => {
          if (doc.status === 'Escalation Required' || doc.status === 'Poor Image Quality') {
             issues.push({
                 documentId: doc.id,
                 docNumber: doc.fileName,
                 invoiceNumber: 'N/A',
                 reason: doc.status,
                 date: doc.createdAt,
                 status: 'Escalated',
                 isMulti: doc.invoiceCount > 1
             });
          }
          (doc.invoices || []).forEach(inv => {
             const status = inv.status || 'Escalation Required';
             if (status === 'Escalation Required' || status === 'Poor Image Quality' || inv.poorImageQuality) {
                 issues.push({
                     documentId: doc.id,
                     invoiceIndex: inv.invoiceIndex,
                     docNumber: doc.fileName,
                     invoiceNumber: inv.invoiceNumber || `Invoice ${inv.invoiceIndex + 1}`,
                     reason: status,
                     date: doc.createdAt,
                     status: 'Escalated',
                     isMulti: true
                 });
             }
          });
        });
        setEscalations(issues);
        setLoading(false);
      });
  }, []);

  const filtered = escalations.filter(e => e.docNumber.toLowerCase().includes(search.toLowerCase()) || e.invoiceNumber.toLowerCase().includes(search.toLowerCase()) || e.reason.toLowerCase().includes(search.toLowerCase()));

  return (
    <main className="page">
      <div className="section-header">
        <h1 className="page-title">Escalations</h1>
      </div>
      <div className="card" style={{ padding: '20px' }}>
        <input 
            type="text" 
            placeholder="Search documents, invoices or reasons..." 
            value={search} 
            onChange={e => setSearch(e.target.value)} 
            style={{ marginBottom: '20px', padding: '10px', width: '100%', maxWidth: '400px' }}
        />
        {loading ? <p>Loading...</p> : (
            <table className="data-table">
                <thead>
                    <tr>
                        <th>Document</th>
                        <th>Invoice</th>
                        <th>Reason</th>
                        <th>Date</th>
                        <th>Status</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>
                    {filtered.map((esc, i) => (
                        <tr key={i}>
                            <td>{esc.docNumber}</td>
                            <td>{esc.invoiceNumber}</td>
                            <td><span className="status-pill danger">{esc.reason}</span></td>
                            <td>{new Date(esc.date).toLocaleDateString()}</td>
                            <td>{esc.status}</td>
                            <td>
                                <a href={esc.isMulti ? `/documents/${esc.documentId}/multi-workspace${esc.invoiceIndex !== undefined ? `?invoiceIndex=${esc.invoiceIndex}` : ''}` : `/documents/${esc.documentId}/review`} className="primary-btn" style={{ padding: '5px 10px' }}>Review</a>
                            </td>
                        </tr>
                    ))}
                    {filtered.length === 0 && <tr><td colSpan="6">No escalations found.</td></tr>}
                </tbody>
            </table>
        )}
      </div>
    </main>
  );
};
