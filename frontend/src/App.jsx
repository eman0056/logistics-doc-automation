import { useEffect, useMemo, useRef, useState } from 'react';

const API = '/api';

const defaultCustomer = {
  name: 'Apex Freight Logistics',
  code: 'APEX',
  primaryColor: '#0B8FD3',
};

const normalizeStatus = (status) => {
  const safe = status || 'PENDING';
  const lookup = {
    EXTRACTED: 'success',
    IN_REVIEW: 'warning',
    APPROVED: 'success',
    INVOICE_GENERATED: 'success',
    PENDING: 'warning',
    PREPROCESSED: 'warning',
    FAILED: 'danger',
  };
  return lookup[safe] || 'neutral';
};

function App() {
  const [customer, setCustomer] = useState(defaultCustomer);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [path, setPath] = useState(window.location.pathname + window.location.search);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [toast, setToast] = useState(null);
  const cancelDeleteRef = useRef(null);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname + window.location.search);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [customerRes, docsRes] = await Promise.all([
          fetch(`${API}/customer`),
          fetch(`${API}/documents`),
        ]);

        const customerJson = await customerRes.json();
        const docsJson = await docsRes.json();

        if (customerJson.customer) setCustomer(customerJson.customer);
        setDocuments(docsJson.documents || []);
      } catch (error) {
        console.error('Load error', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const route = useMemo(() => {
    if (path === '/documents/upload') return 'upload';
    if (path.startsWith('/documents/') && path.includes('/review')) return 'review';
    if (path.startsWith('/invoices/') && path.split('/').length > 2) return 'invoice';
    if (path === '/invoices') return 'invoices';
    if (path === '/review-queue') return 'queue';
    return 'documents';
  }, [path]);

  const nav = (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="brand-wrap">
          <div className="logo-badge" style={{ background: customer.primaryColor || defaultCustomer.primaryColor }}>🚚</div>
          <div className="brand-meta">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className="brand-name">{customer.name || defaultCustomer.name}</span>
              <span
                className="status-pill success"
                style={{ background: customer.primaryColor || defaultCustomer.primaryColor, color: '#fff', border: 'none', padding: '0.25rem 0.55rem' }}
              >
                {customer.code || 'APEX'}
              </span>
            </div>
            <span className="brand-tag">Document Automation Engine</span>
          </div>
        </div>

        <nav className="main-nav">
          <a href="/" className="nav-link">Dashboard</a>
          <a href="/documents" className="nav-link">Documents</a>
          <a href="/documents/upload" className="nav-link">Upload</a>
          <a href="/review-queue" className="nav-link">Review Queue</a>
          <a href="/invoices" className="nav-link">Invoices</a>
        </nav>
      </div>
    </header>
  );

  const deleteDocument = async (docId) => {
    const docToDelete = documents.find((doc) => doc.id === docId);
    if (!docToDelete) return;

    const confirmed = window.confirm(`Delete "${docToDelete.fileName}"? This action cannot be undone.`);
    if (!confirmed) return;

    try {
      const res = await fetch(`${API}/documents/${docId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Delete failed');
      }

      setDocuments((current) => current.filter((doc) => doc.id !== docId));
    } catch (error) {
      alert(error.message || 'Unable to delete document.');
    }
  };

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!deleteTarget) return;

    const handleEscape = (event) => {
      if (event.key === 'Escape' && !deletingId) {
        setDeleteTarget(null);
      }
    };

    const focusTimer = window.setTimeout(() => cancelDeleteRef.current?.focus(), 0);
    window.addEventListener('keydown', handleEscape);

    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [deleteTarget, deletingId]);

  const openDeleteModal = (doc) => setDeleteTarget(doc);

  const handleDeleteDocument = async () => {
    if (!deleteTarget || deletingId) return;

    setDeletingId(deleteTarget.id);
    try {
      const res = await fetch(`${API}/documents/${deleteTarget.id}`, { method: 'DELETE' });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Unable to delete document.');
      }

      setDocuments((current) => current.filter((doc) => doc.id !== deleteTarget.id));
      setDeleteTarget(null);
      setToast({ type: 'success', message: 'Document deleted successfully.' });
    } catch (error) {
      setToast({ type: 'error', message: error.message || 'Unable to delete document.' });
    } finally {
      setDeletingId(null);
    }
  };

  const renderDocumentsView = () => {
    const rows = documents.map((doc) => {
      const status = doc.status || 'PENDING';
      return (
        <tr key={doc.id}>
          <td>{doc.fileName}</td>
          <td><span className="status-pill neutral">{doc.documentType || 'Document'}</span></td>
          <td><span className={`status-pill ${normalizeStatus(status)}`}>{status}</span></td>
          <td>{((doc.fileSize || 0) / 1024).toFixed(1)} KB</td>
          <td>{new Date(doc.createdAt).toLocaleDateString()}</td>
          <td style={{ textAlign: 'right' }}>
            <a href={`/documents/${doc.id}/review`} className="nav-link" style={{ padding: '0.4rem 0.6rem', display: 'inline-flex' }}>
              Review & Edit
            </a>
            <button
              type="button"
              className="nav-link"
              style={{ padding: '0.4rem 0.6rem', display: 'inline-flex', marginLeft: '0.25rem' }}
              onClick={() => openDeleteModal(doc)}
            >
              Delete
            </button>
            {doc.status === 'INVOICE_GENERATED' && (
              <a href={`/invoices/${doc.id}`} className="nav-link" style={{ padding: '0.4rem 0.6rem', display: 'inline-flex', marginLeft: '0.25rem' }}>
                View Invoice
              </a>
            )}
          </td>
        </tr>
      );
    });

    return (
      <>
        {nav}
        {deleteTarget && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(15, 23, 42, 0.6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
              padding: '1rem'
            }}
            onClick={() => !deletingId && setDeleteTarget(null)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-document-title"
              onClick={(event) => event.stopPropagation()}
              style={{
                width: '100%',
                maxWidth: '420px',
                background: '#ffffff',
                borderRadius: '18px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 24px 60px rgba(15, 23, 42, 0.26)',
                padding: '1.5rem'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <div id="delete-document-title" style={{ fontSize: '1.15rem', fontWeight: 700, color: '#0f172a' }}>Delete document</div>
                <button
                  type="button"
                  aria-label="Close delete dialog"
                  disabled={deletingId}
                  onClick={() => setDeleteTarget(null)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#64748b',
                    fontSize: '1.5rem',
                    cursor: deletingId ? 'not-allowed' : 'pointer',
                    lineHeight: 1
                  }}
                >
                  ×
                </button>
              </div>

              <p style={{ margin: '0 0 0.5rem', color: '#334155', fontSize: '1rem' }}>Are you sure you want to delete this document?</p>
              <div style={{ marginBottom: '0.75rem', padding: '0.75rem 0.9rem', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0', color: '#0f172a', fontWeight: 600, wordBreak: 'break-word' }}>
                {deleteTarget.fileName}
              </div>
              <p style={{ margin: '0 0 1.2rem', color: '#ef4444', fontWeight: 600, fontSize: '0.9rem' }}>This action cannot be undone.</p>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  ref={cancelDeleteRef}
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  disabled={deletingId}
                  style={{
                    background: '#e2e8f0',
                    border: '1px solid #cbd5e1',
                    color: '#0f172a',
                    borderRadius: '10px',
                    padding: '0.75rem 1rem',
                    fontWeight: 600,
                    cursor: deletingId ? 'not-allowed' : 'pointer',
                    opacity: deletingId ? 0.7 : 1
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteDocument}
                  disabled={deletingId === deleteTarget.id}
                  style={{
                    background: '#dc2626',
                    border: '1px solid #b91c1c',
                    color: '#ffffff',
                    borderRadius: '10px',
                    padding: '0.75rem 1rem',
                    fontWeight: 700,
                    cursor: deletingId === deleteTarget.id ? 'not-allowed' : 'pointer',
                    opacity: deletingId === deleteTarget.id ? 0.85 : 1,
                    minWidth: '150px'
                  }}
                >
                  {deletingId === deleteTarget.id ? 'Deleting...' : 'Delete Document'}
                </button>
              </div>
            </div>
          </div>
        )}

        {toast && (
          <div
            role="status"
            aria-live="polite"
            style={{
              position: 'fixed',
              right: '1.25rem',
              bottom: '1.25rem',
              zIndex: 1100,
              minWidth: '260px',
              maxWidth: '360px',
              padding: '0.9rem 1rem',
              borderRadius: '12px',
              background: toast.type === 'success' ? '#166534' : '#991b1b',
              color: '#ffffff',
              boxShadow: '0 16px 40px rgba(15, 23, 42, 0.25)',
              fontWeight: 600
            }}
          >
            {toast.message}
          </div>
        )}

        <main className="page dashboard-shell">
          <div className="section-header">
            <div>
              <div className="eyebrow">Overview</div>
              <h1 className="page-title">Documents Repository</h1>
              <p className="subtle-copy mt-2">View and manage ingested logistics paperwork.</p>
            </div>
            <a href="/documents/upload" className="primary-btn">+ Upload New Document</a>
          </div>

          <div className="card table-card">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Filename</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Size</th>
                  <th>Uploaded At</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.length > 0 ? rows : <tr><td colSpan="6"><div className="empty-state">No documents found. Upload one to get started.</div></td></tr>}
              </tbody>
            </table>
          </div>
        </main>
      </>
    );
  };

  const renderUploadView = () => {
    const [selectedFiles, setSelectedFiles] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [statusText, setStatusText] = useState('');
    const [pageProgress, setPageProgress] = useState(null);

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
      setStatusText('Uploading & running AI extraction pipeline for all files...');

      const formData = new FormData();
      selectedFiles.forEach((file) => formData.append('file', file));

      try {
        const res = await fetch(`${API}/documents/upload`, { method: 'POST', body: formData });
        const data = await res.json();
        if (data.success && data.documentIds && data.documentIds.length > 0) {
          const totalPages = Object.values(data.pageCounts || {}).reduce((sum, count) => sum + count, 0);
          setPageProgress({ current: 0, total: totalPages || data.documentIds.length });
          setStatusText(`${totalPages || data.documentIds.length} pages detected. Processing 0/${totalPages || data.documentIds.length}`);

          const pollProgress = async () => {
            const statuses = await Promise.all(data.documentIds.map(async (documentId) => {
              const response = await fetch(`${API}/documents/${documentId}/status`);
              return response.json();
            }));
            const current = statuses.reduce((sum, status) => sum + (status.processedPages || 0), 0);
            const total = statuses.reduce((sum, status) => sum + (status.pageCount || 1), 0);
            setPageProgress({ current, total });
            setStatusText(current >= total ? `Extraction completed — ${total}/${total} pages processed` : `Processing ${current}/${total}`);
            if (current >= total || statuses.every((status) => status.isExtracted)) {
              setTimeout(() => { window.location.href = `/documents/${data.documentIds[0]}/review`; }, 800);
              return;
            }
            window.setTimeout(pollProgress, 1500);
          };
          window.setTimeout(pollProgress, 1000);
        } else {
          alert(data.error || 'Upload failed');
        }
      } catch (error) {
        alert(error.message || 'Network error');
      } finally {
        setUploading(false);
      }
    };

    return (
      <>
        {nav}
        <main className="page">
          <div className="section-header">
            <div>
              <div className="eyebrow">Workflow</div>
              <h1 className="page-title">Document Ingestion & AI Pipeline</h1>
              <p className="subtle-copy mt-2">Upload PDF, DOC, DOCX, or image logistics paperwork to trigger automated extraction.</p>
            </div>
            <a href="/documents" className="primary-btn">View All Documents</a>
          </div>

          <div className="card upload-panel">
            <div
              className="dropzone"
              onClick={() => document.getElementById('fileInput').click()}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
              }}
              onDragEnter={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleFiles(e.dataTransfer.files);
              }}
            >
              <input
                id="fileInput"
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,.avif"
                style={{ display: 'none' }}
                onChange={(e) => setSelectedFiles(Array.from(e.target.files || []))}
              />
              <div className="dropzone-icon">📤</div>
              <div className="dropzone-title">Click to upload or drag & drop document</div>
              <div className="dropzone-subtext">Supports PDF, DOC, DOCX, JPG, JPEG, PNG, WEBP, AVIF up to 25 MB</div>
              {selectedFiles.length > 0 && <div className="file-chip">Selected: {selectedFiles.length} file(s)</div>}
            </div>

            <button className="primary-btn w-full mt-4" onClick={handleUpload} disabled={uploading}>
              {uploading ? 'Uploading...' : 'Start Upload & AI Processing'}
            </button>
            {statusText && <div className="progress-box">{statusText}</div>}
            {pageProgress && <div className="subtle-copy mt-2">{pageProgress.current}/{pageProgress.total} pages processed</div>}
          </div>
        </main>
      </>
    );
  };

  const renderQueueView = () => {
    const [tasks, setTasks] = useState([]);
    const [loadingTasks, setLoadingTasks] = useState(true);

    useEffect(() => {
      fetch(`${API}/review-tasks`)
        .then((res) => res.json())
        .then((json) => setTasks(json.tasks || []))
        .catch((err) => console.error(err))
        .finally(() => setLoadingTasks(false));
    }, []);

    return (
      <>
        {nav}
        <main className="page">
          <div className="section-header">
            <div>
              <div className="eyebrow">Queue</div>
              <h1 className="page-title">Human-in-the-Loop Review Queue</h1>
              <p className="subtle-copy mt-2">Review low-confidence extractions and authorize submission.</p>
            </div>
          </div>

          <div className="card table-card">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Priority</th>
                  <th>Reason</th>
                  <th>Created Date</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {!loadingTasks && tasks.length === 0 && <tr><td colSpan="5"><div className="empty-state">All clear! No pending review tasks.</div></td></tr>}
                {tasks.map((task) => (
                  <tr key={task.id}>
                    <td>{task.document?.fileName || 'Document'}</td>
                    <td><span className="status-pill warning">Normal</span></td>
                    <td>{task.reason}</td>
                    <td>{new Date(task.createdAt).toLocaleDateString()}</td>
                    <td style={{ textAlign: 'right' }}>
                      <a href={`/documents/${task.documentId}/review`} className="primary-btn">Open Review</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </main>
      </>
    );
  };

  const renderReviewView = () => {
    const docId = path.split('/')[2];
    const [doc, setDoc] = useState(null);
    const [loadingDoc, setLoadingDoc] = useState(true);
    const [processing, setProcessing] = useState(false);

    useEffect(() => {
      let isMounted = true;
      const loadReview = async () => {
        try {
          const res = await fetch(`${API}/documents`);
          const json = await res.json();
          const found = (json.documents || []).find((item) => item.id === docId) || null;
          if (isMounted) setDoc(found);
        } catch (error) {
          console.error(error);
        } finally {
          if (isMounted) setLoadingDoc(false);
        }
      };
      loadReview();
      return () => { isMounted = false; };
    }, [docId]);

    useEffect(() => {
      if (!doc || !doc.extraction) {
        const interval = setInterval(async () => {
          try {
            const statusRes = await fetch(`${API}/documents/${docId}/status`);
            const statusJson = await statusRes.json();
            if (statusJson.isExtracted) {
              window.location.reload();
            }
          } catch (error) {
            console.error(error);
          }
        }, 2000);
        setProcessing(true);
        return () => clearInterval(interval);
      }
      setProcessing(false);
      return undefined;
    }, [doc, docId]);

    if (loadingDoc) return <><>{nav}</><main className="page"><div className="card upload-panel">Loading review...</div></main></>;

    if (!doc) return <><>{nav}</><main className="page"><div className="card upload-panel">Document not found.</div></main></>;

    let canonical = {};
    try {
      canonical = JSON.parse(doc.extraction?.finalSubmittedData || doc.extraction?.canonicalJson || '{}');
    } catch (error) {
      canonical = {};
    }

    const fieldEntries = Object.entries(canonical);
    const isEmpty = fieldEntries.length === 0;

    const renderFieldInputs = () => {
      if (isEmpty) {
        return (
          <div className="section-block">
            <div className="section-title">Processing</div>
            <div className="status-pill warning">Document Uploaded</div>
            <div className="status-pill warning mt-2">Extracting Information</div>
            <div className="status-pill neutral mt-2">Validating Data</div>
            <div className="status-pill neutral mt-2">Preparing Review</div>
          </div>
        );
      }
      return (
        <div className="field-grid">
          {fieldEntries.map(([key, value]) => (
            <div key={key} className="field-group">
              <label className="field-label">{key}</label>
              <input
                className="field-input"
                value={typeof value === 'object' ? JSON.stringify(value) : String(value ?? '')}
                onChange={() => {}}
              />
            </div>
          ))}
        </div>
      );
    };

    return (
      <>
        {nav}
        <main className="page">
          <div className="section-header">
            <div>
              <div className="eyebrow">Review</div>
              <h1 className="page-title">Dynamic Review & Edit</h1>
              <p className="subtle-copy mt-2">Edit the exact extracted key-value pairs before final generation.</p>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <a href="/documents" className="secondary-btn">Discard</a>
              {!isEmpty && <button className="primary-btn">Save & Approve</button>}
              {!isEmpty && <button className="secondary-btn">Generate Invoice</button>}
            </div>
          </div>

          <div className="review-page">
            <div className="card preview-panel">
              <h3 className="section-title" style={{ color: '#fff', letterSpacing: '0.1em' }}>Original Document</h3>
              <div className="preview-box">
                <img src={`/api/documents/${docId}/file`} alt="Document Preview" onError={(e) => { e.currentTarget.src = 'https://placehold.co/600x800/1e293b/475569?text=No+Preview+Available'; }} />
              </div>
            </div>

            <div className="card editor-panel">
              <h3 className="section-title" style={{ color: '#fff', letterSpacing: '0.1em' }}>Dynamically Extracted Fields</h3>
              {renderFieldInputs()}
              {processing && <div className="progress-box mt-4">The n8n workflow is extracting and validating document data automatically.</div>}
            </div>
          </div>
        </main>
      </>
    );
  };

  const renderInvoiceView = () => {
    const docId = path.split('/')[2];
    const [doc, setDoc] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
      async function load() {
        try {
          const res = await fetch(`${API}/documents`);
          const json = await res.json();
          setDoc((json.documents || []).find((item) => item.id === docId) || null);
        } catch (error) {
          console.error(error);
        } finally {
          setLoading(false);
        }
      }
      load();
    }, [docId]);

    if (loading) return <><>{nav}</><main className="page"><div className="card upload-panel">Loading invoice...</div></main></>;
    if (!doc) return <><>{nav}</><main className="page"><div className="card upload-panel">Invoice not found.</div></main></>;

    let canonical = {};
    try {
      canonical = JSON.parse(doc.extraction?.finalSubmittedData || doc.extraction?.canonicalJson || '{}');
    } catch (error) {
      canonical = {};
    }

    return (
      <>
        {nav}
        <main className="page">
          <div className="card upload-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
              <a href={`/documents/${docId}/review`} className="secondary-btn">← Back to Review</a>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button className="secondary-btn">Print</button>
                <button className="primary-btn">Download PDF</button>
              </div>
            </div>

            <div className="mt-4" style={{ background: '#fff', color: '#0F2033', borderRadius: '1rem', padding: '2rem' }}>
              <h1 style={{ margin: '0 0 1rem', fontSize: '2rem' }}>Processed Document</h1>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
                {Object.entries(canonical).map(([key, value]) => (
                  <div key={key} style={{ borderBottom: '1px solid #dfe7f0', paddingBottom: '0.5rem' }}>
                    <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#6b7280', marginBottom: '0.35rem' }}>{key}</div>
                    <div style={{ fontWeight: 700, wordBreak: 'break-word' }}>{typeof value === 'object' ? JSON.stringify(value) : String(value ?? '')}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </main>
      </>
    );
  };

  const renderInvoicesView = () => {
    const invoices = documents.filter((doc) => doc.status === 'INVOICE_GENERATED' || doc.extraction?.finalSubmittedData);

    return (
      <>
        {nav}
        <main className="page">
          <div className="section-header">
            <div>
              <div className="eyebrow">Invoices</div>
              <h1 className="page-title">Generated Invoices Dashboard</h1>
              <p className="subtle-copy mt-2">Browse, print, and download generated billing invoices.</p>
            </div>
            <a href="/documents/upload" className="primary-btn">+ New Invoice Upload</a>
          </div>

          <div className="card table-card">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Shipper</th>
                  <th>Consignee</th>
                  <th>Total Amount</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {invoices.length === 0 ? <tr><td colSpan="6"><div className="empty-state">No generated invoices found yet. Upload and generate one!</div></td></tr> : invoices.map((inv) => {
                  let payload = {};
                  try {
                    payload = JSON.parse(inv.extraction?.finalSubmittedData || inv.extraction?.canonicalJson || '{}');
                  } catch (error) {
                    payload = {};
                  }
                  const amount = Number(payload.totalAmount || 0).toFixed(2);
                  return (
                    <tr key={inv.id}>
                      <td>{payload.documentNumber || 'INV-001'}</td>
                      <td>{payload.shipperName || 'Apex Freight'}</td>
                      <td>{payload.consigneeName || 'Global Distribution'}</td>
                      <td style={{ color: '#7ae7ac', fontWeight: 700 }}>$ {amount} USD</td>
                      <td><span className="status-pill success">{inv.status || 'INVOICE_GENERATED'}</span></td>
                      <td style={{ textAlign: 'right' }}><a href={`/invoices/${inv.id}`} className="nav-link">View Invoice</a></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </main>
      </>
    );
  };

  if (loading) {
    return <div className="app-shell"><div className="card upload-panel">Loading dashboard...</div></div>;
  }

  switch (route) {
    case 'upload': return renderUploadView();
    case 'review': return renderReviewView();
    case 'invoice': return renderInvoiceView();
    case 'invoices': return renderInvoicesView();
    case 'queue': return renderQueueView();
    default: return renderDocumentsView();
  }
}

export default App;
