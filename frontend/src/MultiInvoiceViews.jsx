import React, { useState, useEffect } from 'react';
import { apiGetJson, normalizeApiCacheUrl } from './dataCache.js';

const API = '/api';

export const UploadMultiView = () => {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [statusText, setStatusText] = useState('');

  const handleFiles = (files) => {
    if (!files || !files.length) return;
    setSelectedFiles(Array.from(files));
  };

  const handleUpload = async () => {
    if (!selectedFiles.length) {
      alert('Please select document files first.');
      return;
    }

    setUploading(true);
    setStatusText('Uploading document for Multiple Invoice Processing...');

    const formData = new FormData();
    selectedFiles.forEach((file) => formData.append('file', file));

    try {
      const res = await fetch(`${API}/documents/upload-multi`, { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success && data.documentIds && data.documentIds.length > 0) {
        setStatusText('Upload complete! Redirecting...');
        const docId = data.documentIds[0];
        window.location.assign(`/documents/${docId}/multi-workspace`);
      } else {
        alert(data.error || 'Upload failed');
        setUploading(false);
      }
    } catch (error) {
      alert(error.message || 'Network error');
      setUploading(false);
    }
  };

  return (
    <main className="page">
      <div className="section-header">
        <div>
          <div className="eyebrow">Workflow</div>
          <h1 className="page-title">Multiple Invoices Upload</h1>
          <p className="subtle-copy mt-2">Upload a single PDF containing multiple invoices. You will review and process each individually.</p>
        </div>
      </div>
      <div className="card upload-panel">
        <div
          className="dropzone"
          onClick={() => document.getElementById('fileInputMulti').click()}
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
          onDragEnter={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
        >
          <input
            id="fileInputMulti"
            type="file"
            accept=".pdf"
            style={{ display: 'none' }}
            onChange={(e) => setSelectedFiles(Array.from(e.target.files || []))}
          />
          <div className="dropzone-icon">📥</div>
          <div className="dropzone-title">Select Multiple Invoice PDF</div>
          <div className="dropzone-subtext">Must be a single PDF file containing multiple invoices</div>
          {selectedFiles.length > 0 && <div className="file-chip">Selected: {selectedFiles[0].name}</div>}
        </div>
        <button className="primary-btn w-full mt-4" onClick={handleUpload} disabled={uploading}>
          {uploading ? 'Uploading...' : 'Upload & Detect Invoices'}
        </button>
        {statusText && <div className="progress-box">{statusText}</div>}
      </div>
    </main>
  );
};

export const MultiInvoiceWorkspace = () => {
  const path = window.location.pathname;
  const docId = path.split('/')[2];
  
  const [invoiceGroups, setInvoiceGroups] = useState([]);
  const [selectedInvoiceIndex, setSelectedInvoiceIndex] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [extractedData, setExtractedData] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/documents/${docId}/detect-invoices`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setInvoiceGroups(data.invoiceGroups);
          if (data.invoiceGroups.length > 0) {
            setSelectedInvoiceIndex(0);
          }
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [docId]);

  const processInvoice = async (index, group) => {
    if (processing || extractedData[index]) return;
    setProcessing(true);
    try {
      const res = await fetch(`${API}/documents/${docId}/process-single-invoice/${index}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageStart: group.pageStart,
          pageEnd: group.pageEnd
        })
      });
      const data = await res.json();
      if (data.invoiceHeader) {
         setExtractedData(prev => ({...prev, [index]: data}));
      } else {
         alert("Processing failed or returned no data.");
      }
    } catch (e) {
      alert("Error processing invoice: " + e.message);
    }
    setProcessing(false);
  };

  if (loading) return <main className="page"><div>Loading invoices...</div></main>;

  const selectedGroup = invoiceGroups[selectedInvoiceIndex];

  return (
    <main className="page" style={{ display: 'flex', gap: '1rem', height: 'calc(100vh - 80px)' }}>
      {/* Sidebar */}
      <div style={{ width: '300px', flexShrink: 0, overflowY: 'auto' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Detected Invoices</h2>
        {invoiceGroups.map((group, idx) => (
          <div 
            key={idx}
            onClick={() => setSelectedInvoiceIndex(idx)}
            style={{ 
              padding: '1rem', 
              marginBottom: '0.5rem',
              borderRadius: '8px',
              cursor: 'pointer',
              border: selectedInvoiceIndex === idx ? '2px solid #0B8FD3' : '1px solid #dfe7f0',
              backgroundColor: selectedInvoiceIndex === idx ? '#f0f9ff' : '#fff'
            }}
          >
            <strong>Invoice {idx + 1}</strong>
            <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>
              Pages {group.pageStart} - {group.pageEnd}
            </div>
            {extractedData[idx] && <div style={{ color: 'green', fontSize: '0.8rem', marginTop: '4px' }}>✓ Processed</div>}
          </div>
        ))}
      </div>

      {/* Main Content */}
      <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto' }}>
        {selectedGroup && (
          <>
            <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0 }}>Invoice {selectedInvoiceIndex + 1} Details</h3>
                <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>Pages {selectedGroup.pageStart} - {selectedGroup.pageEnd}</div>
              </div>
              <button 
                className="primary-btn" 
                onClick={() => processInvoice(selectedInvoiceIndex, selectedGroup)}
                disabled={processing || extractedData[selectedInvoiceIndex]}
              >
                {processing ? 'Processing...' : extractedData[selectedInvoiceIndex] ? 'Already Processed' : 'Run OCR & AI Extraction'}
              </button>
            </div>

            {/* Extracted Data Display */}
            {extractedData[selectedInvoiceIndex] && (
              <div className="card" style={{ background: '#f8fafc' }}>
                <h4>Extracted JSON</h4>
                <pre style={{ fontSize: '0.8rem', overflowX: 'auto' }}>
                  {JSON.stringify(extractedData[selectedInvoiceIndex], null, 2)}
                </pre>
              </div>
            )}

            {/* Original Document PDF */}
            <div className="card" style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
              <h4>Original Document</h4>
              <p style={{ fontSize: '0.8rem', color: '#6b7280' }}>The complete original PDF remains unmodified. Showing page {selectedGroup.pageStart}.</p>
              <iframe 
                src={`${API}/documents/${docId}/file#page=${selectedGroup.pageStart}`} 
                style={{ width: '100%', height: '100%', minHeight: '500px', border: 'none', borderRadius: '4px' }}
                title="Original Document"
              />
            </div>
          </>
        )}
      </div>
    </main>
  );
};
