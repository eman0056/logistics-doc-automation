import os
import re

base = "/home/provelopers/Downloads/docs/logistics-doc-automation/frontend/src"

# 1. CREATE Escalations.jsx
escalations_code = """import React, { useState, useEffect } from 'react';

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
"""
with open(os.path.join(base, "Escalations.jsx"), "w") as f:
    f.write(escalations_code)

# 2. CREATE PreviewRange.jsx
preview_code = """import React, { useState } from 'react';

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
"""
with open(os.path.join(base, "PreviewRange.jsx"), "w") as f:
    f.write(preview_code)

# 3. PATCH App.jsx
app_path = os.path.join(base, "App.jsx")
with open(app_path, "r") as f:
    app_code = f.read()

# Add imports
imports = """import { UploadMultiView, MultiInvoiceWorkspace, ExtractionProcessingPanel } from './MultiInvoiceViews.jsx';
import { Escalations } from './Escalations.jsx';
import { PreviewRange } from './PreviewRange.jsx';"""
app_code = app_code.replace("import { UploadMultiView, MultiInvoiceWorkspace, ExtractionProcessingPanel } from './MultiInvoiceViews.jsx';", imports)

# Add routes
routes = """    if (path === '/escalations') return 'escalations';
    if (path === '/preview') return 'preview';
    if (path === '/documents/upload') return 'upload';"""
app_code = app_code.replace("if (path === '/documents/upload') return 'upload';", routes)

# Add nav
nav_links = """<a href="/" className="nav-link">Dashboard</a>
          <a href="/documents" className="nav-link">Documents</a>
          <a href="/escalations" className="nav-link">Escalations</a>
          <a href="/preview" className="nav-link">Preview</a>"""
app_code = app_code.replace("""<a href="/" className="nav-link">Dashboard</a>
          <a href="/documents" className="nav-link">Documents</a>""", nav_links)

# Add to switch
switch_cases = """    case 'escalations': renderedRoute = <Escalations />; break;
    case 'preview': renderedRoute = <PreviewRange />; break;
    case 'upload': renderedRoute = <UploadView />; break;"""
app_code = app_code.replace("case 'upload': renderedRoute = <UploadView />; break;", switch_cases)

with open(app_path, "w") as f:
    f.write(app_code)

# 4. PATCH MultiInvoiceViews.jsx for initial invoice selection
multi_path = os.path.join(base, "MultiInvoiceViews.jsx")
with open(multi_path, "r") as f:
    multi_code = f.read()

initial_effect = """
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initialIndex = params.has('invoiceIndex') ? parseInt(params.get('invoiceIndex'), 10) : null;
    
    fetch(`${API}/documents/${docId}/detect-invoices`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setInvoiceGroups(data.invoiceGroups || []);
          if (initialIndex !== null) {
              setSelectedInvoiceIndex(initialIndex);
              // fetch it
              processInvoice(initialIndex, data.invoiceGroups[initialIndex]);
          } else {
              setSelectedInvoiceIndex(0);
              processInvoice(0, data.invoiceGroups[0]);
          }
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));"""

multi_code = re.sub(r'fetch\(`\$\{API\}/documents/\$\{docId\}/detect-invoices`\).*?\.finally\(\(\) => setLoading\(false\)\);', initial_effect, multi_code, flags=re.DOTALL)

with open(multi_path, "w") as f:
    f.write(multi_code)

print("Done refactoring App.jsx and MultiInvoiceViews.jsx")
