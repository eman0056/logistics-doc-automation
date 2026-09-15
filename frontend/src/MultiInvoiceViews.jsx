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
  const [processingIndex, setProcessingIndex] = useState(null);
  const [extractedData, setExtractedData] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/documents/${docId}/detect-invoices`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setInvoiceGroups(data.invoiceGroups || []);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [docId]);

  const processInvoice = async (index, group) => {
    if (processing || extractedData[index]) return;
    setProcessing(true);
    setProcessingIndex(index);
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
      if (data && !data.error) {
        setExtractedData(prev => ({...prev, [index]: data}));
      } else if (data && data.error) {
        alert("Processing error: " + data.error);
      } else {
        setExtractedData(prev => ({...prev, [index]: data}));
      }
    } catch (e) {
      alert("Error processing invoice: " + e.message);
    } finally {
      setProcessing(false);
      setProcessingIndex(null);
    }
  };

  const handleInvoiceClick = (index, group) => {
    setSelectedInvoiceIndex(index);
    if (!extractedData[index] && !processing) {
      processInvoice(index, group);
    }
  };

  if (loading) return <main className="page"><div>Loading detected invoices...</div></main>;

  const selectedGroup = selectedInvoiceIndex !== null ? invoiceGroups[selectedInvoiceIndex] : null;

  return (
    <main className="page" style={{ display: 'flex', gap: '1rem', height: 'calc(100vh - 80px)' }}>
      {/* Sidebar */}
      <div style={{ width: '300px', flexShrink: 0, overflowY: 'auto' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Detected Invoices ({invoiceGroups.length})</h2>
        {invoiceGroups.length === 0 ? (
          <div style={{ color: '#6b7280', fontSize: '0.9rem' }}>No invoice groups detected.</div>
        ) : (
          invoiceGroups.map((group, idx) => {
            const isSelected = selectedInvoiceIndex === idx;
            const isDone = Boolean(extractedData[idx]);
            const isProcessingThis = processing && processingIndex === idx;

            return (
              <div 
                key={idx}
                onClick={() => handleInvoiceClick(idx, group)}
                style={{ 
                  padding: '1rem', 
                  marginBottom: '0.5rem',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  border: isSelected ? '2px solid #0B8FD3' : '1px solid #dfe7f0',
                  backgroundColor: isSelected ? '#f0f9ff' : '#fff',
                  transition: 'all 0.2s ease'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong>Invoice {idx + 1}</strong>
                  {isDone && <span style={{ color: 'green', fontSize: '0.8rem', fontWeight: 'bold' }}>✓ Processed</span>}
                  {isProcessingThis && <span style={{ color: '#d97706', fontSize: '0.8rem', fontWeight: 'bold' }}>⏳ Processing...</span>}
                </div>
                <div style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '4px' }}>
                  Pages {group.pageStart} - {group.pageEnd}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Main Content */}
      <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto' }}>
        {selectedGroup ? (
          <>
            <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0 }}>Invoice {selectedInvoiceIndex + 1} Details</h3>
                <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>Pages {selectedGroup.pageStart} - {selectedGroup.pageEnd}</div>
              </div>
              <button 
                className="primary-btn" 
                onClick={() => processInvoice(selectedInvoiceIndex, selectedGroup)}
                disabled={processing || Boolean(extractedData[selectedInvoiceIndex])}
              >
                {processing && processingIndex === selectedInvoiceIndex 
                  ? 'Processing...' 
                  : extractedData[selectedInvoiceIndex] 
                  ? 'Processed' 
                  : 'Run OCR & AI Extraction'}
              </button>
            </div>

            {/* Extracted Data Display */}
            {extractedData[selectedInvoiceIndex] && (
              <div className="card" style={{ background: '#f8fafc' }}>
                <h4>Extracted JSON for Invoice {selectedInvoiceIndex + 1}</h4>
                <pre style={{ fontSize: '0.8rem', overflowX: 'auto', background: '#1e293b', color: '#f8fafc', padding: '1rem', borderRadius: '6px' }}>
                  {JSON.stringify(extractedData[selectedInvoiceIndex], null, 2)}
                </pre>
              </div>
            )}
          </>
        ) : (
          <div className="card" style={{ background: '#f9fafb', padding: '1rem', borderLeft: '4px solid #0B8FD3' }}>
            <h4 style={{ margin: 0 }}>Select an Invoice</h4>
            <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.85rem', color: '#6b7280' }}>
              Click an invoice from the sidebar to trigger OCR and OpenAI extraction for that specific invoice.
            </p>
          </div>
        )}

        {/* Original Document PDF (Always visible) */}
        <div className="card" style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', minHeight: '500px' }}>
          <h4>Original Document</h4>
          <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: '0 0 0.5rem 0' }}>The complete original PDF remains unmodified and displays all pages.</p>
          <iframe 
            src={`${API}/documents/${docId}/file`}
            style={{ width: '100%', height: '100%', minHeight: '500px', border: 'none', borderRadius: '4px' }}
            title="Original Document"
          />
        </div>
      </div>
    </main>
  );
};
