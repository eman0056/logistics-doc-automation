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

const fetchJson = async (url, options = {}) => {
  const res = await fetch(url, { cache: 'no-store', ...options });
  return res;
};

const parseStoredInvoiceData = (invoice) => {
  if (invoice?.extractedData && typeof invoice.extractedData === 'object' && !Array.isArray(invoice.extractedData) && Object.keys(invoice.extractedData).length > 0) {
    return invoice.extractedData;
  }
  try {
    const stored = invoice?.canonicalJson || invoice?.finalSubmittedData;
    const parsed = typeof stored === 'string' ? JSON.parse(stored) : stored;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    return {};
  }
};

const hasStoredInvoiceData = (invoice) => Object.keys(parseStoredInvoiceData(invoice)).length > 0;

const getSingleInvoiceData = (document) => {
  const invoice = document?.invoices?.[0];
  const candidates = [
    invoice,
    document?.extraction,
  ];
  for (const candidate of candidates) {
    const data = parseStoredInvoiceData(candidate);
    if (Object.keys(data).length > 0) return data;
  }
  return {};
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
          fetchJson(`${API}/customer`),
          fetchJson(`${API}/documents?refresh=${Date.now()}`),
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

  const UploadView = () => {
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
        const res = await fetchJson(`${API}/documents/upload`, { method: 'POST', body: formData });
        const data = await res.json();
        if (data.success && data.documentIds && data.documentIds.length > 0) {
          const totalPages = Object.values(data.pageCounts || {}).reduce((sum, count) => sum + count, 0);
          setPageProgress({ current: 0, total: totalPages || data.documentIds.length });
          setStatusText(`${totalPages || data.documentIds.length} pages detected. Processing 0/${totalPages || data.documentIds.length}`);

          const pollProgress = async () => {
            const statuses = await Promise.all(data.documentIds.map(async (documentId) => {
              const response = await fetchJson(`${API}/documents/${documentId}/status?refresh=${Date.now()}`);
              return response.json();
            }));
            const current = statuses.reduce((sum, status) => sum + (status.processedPages || 0), 0);
            const total = statuses.reduce((sum, status) => sum + (status.pageCount || 1), 0);
            setPageProgress({ current, total });
            setStatusText(current >= total ? `Extraction completed — ${total}/${total} pages processed` : `Processing ${current}/${total}`);
            if (current >= total || statuses.every((status) => status.isExtracted)) {
              const firstCompletedDoc = data.documentIds.find((documentId, index) => statuses[index]?.isExtracted);
              setTimeout(() => { window.location.href = `/documents/${firstCompletedDoc || data.documentIds[0]}/review`; }, 800);
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

  const QueueView = () => {
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

  const ReviewView = () => {
    const docId = path.split('/')[2];
    const [doc, setDoc] = useState(null);
    const [loadingDoc, setLoadingDoc] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [selectedSection, setSelectedSection] = useState('header');
    const [invoiceDrafts, setInvoiceDrafts] = useState({});
    const [savingInvoice, setSavingInvoice] = useState(false);
    const [discarding, setDiscarding] = useState(false);
    const pollingRef = useRef({ cancelled: false, timeout: null, controller: null });

    useEffect(() => {
      let isMounted = true;
      const loadReview = async () => {
        try {
          const res = await fetchJson(`${API}/documents?refresh=${Date.now()}`);
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
      const hasRealExtraction = !!(
        hasStoredInvoiceData({
          extractedData: doc?.extraction?.extractedData,
          canonicalJson: doc?.extraction?.canonicalJson,
          finalSubmittedData: doc?.extraction?.finalSubmittedData,
        }) || doc?.invoices?.some(hasStoredInvoiceData)
      );
      const invoicesPending = doc?.invoices?.some((invoice) => !hasStoredInvoiceData(invoice) && invoice.extractionStatus !== 'EXTRACTED');
      const isDocReady = doc && hasRealExtraction;

      if (!doc || (!isDocReady && !invoicesPending)) {
        pollingRef.current.cancelled = false;
        const poll = async () => {
          if (pollingRef.current.cancelled) return;
          pollingRef.current.controller?.abort();
          pollingRef.current.controller = new AbortController();
          try {
            const requestOptions = { signal: pollingRef.current.controller.signal };
            const statusRes = await fetchJson(`${API}/documents/${docId}/status?refresh=${Date.now()}`, requestOptions);
            const status = await statusRes.json();
            const documentsRes = await fetchJson(`${API}/documents?refresh=${Date.now()}`, requestOptions);
            const documentsJson = await documentsRes.json();
            const latestDoc = (documentsJson.documents || []).find((item) => item.id === docId);
            if (pollingRef.current.cancelled) return;
            if (latestDoc) setDoc(latestDoc);
            if (status.status === 'FAILED') setProcessing(false);
          } catch (error) {
            if (error.name !== 'AbortError' && !pollingRef.current.cancelled) console.error(error);
          }
          if (!pollingRef.current.cancelled) {
            pollingRef.current.timeout = window.setTimeout(poll, 1500);
          }
        };
        poll();
        setProcessing(true);
        return () => {
          pollingRef.current.cancelled = true;
          if (pollingRef.current.timeout) window.clearTimeout(pollingRef.current.timeout);
          pollingRef.current.controller?.abort();
        };
      }
      setProcessing(false);
      return undefined;
    }, [doc, docId]);

    useEffect(() => () => {
      pollingRef.current.cancelled = true;
      if (pollingRef.current.timeout) window.clearTimeout(pollingRef.current.timeout);
      pollingRef.current.controller?.abort();
    }, []);

    useEffect(() => {
      if (!doc) return;
      const invoiceRecord = doc.invoices?.[0];
      const records = [{
        ...(invoiceRecord || {}),
        id: invoiceRecord?.id || `${doc.id}-extracted`,
        extractedData: getSingleInvoiceData(doc),
      }];
      setInvoiceDrafts((current) => {
        const next = { ...current };
        records.forEach((invoice) => {
          const latestData = parseStoredInvoiceData(invoice);
          const currentData = next[invoice.id];
          if (!currentData || Object.keys(currentData).length === 0 || Object.keys(latestData || {}).length > 0) {
            next[invoice.id] = latestData || {};
          }
        });
        return next;
      });
    }, [doc]);

    if (loadingDoc) return <><>{nav}</><main className="page"><div className="card upload-panel">Loading review...</div></main></>;

    if (!doc) return <><>{nav}</><main className="page"><div className="card upload-panel">Document not found.</div></main></>;

    const invoiceRecord = doc.invoices?.[0];
    const selectedInvoice = {
      ...(invoiceRecord || {}),
      id: invoiceRecord?.id || `${doc.id}-extracted`,
      extractedData: getSingleInvoiceData(doc),
    };
    const previewUrl = `${API}/documents/${docId}/file?ts=${Date.now()}`;
    const isPdfDocument = () => {
      const mimeType = (doc?.mimeType || '').toLowerCase();
      const fileName = (doc?.fileName || '').toLowerCase();
      const storagePath = (doc?.storagePath || '').toLowerCase();
      return (
        mimeType.includes('pdf') ||
        fileName.endsWith('.pdf') ||
        storagePath.endsWith('.pdf') ||
        fileName.endsWith('.pdf?') ||
        fileName.endsWith('.pdf#') ||
        mimeType.includes('application/pdf')
      );
    };
    const parseInvoiceData = (invoice) => {
      return parseStoredInvoiceData(invoice);
    };
    const canonical = invoiceDrafts[selectedInvoice?.id] || parseInvoiceData(selectedInvoice);
    const shipmentKey = Array.isArray(canonical.shipmentDetails) ? 'shipmentDetails' : 'shipmentDetail';
    const shipmentRecords = Array.isArray(canonical[shipmentKey]) ? canonical[shipmentKey] : [];
    const chargeRecords = [
      ...shipmentRecords.flatMap((shipment, shipmentIndex) => (
        Array.isArray(shipment?.chargeLineItems)
          ? shipment.chargeLineItems.map((charge, chargeIndex) => ({ charge, path: [shipmentKey, shipmentIndex, 'chargeLineItems', chargeIndex], label: `Shipment ${shipmentIndex + 1} Charge ${chargeIndex + 1}` }))
          : []
      )),
      ...(Array.isArray(canonical.chargeLineItems)
        ? canonical.chargeLineItems.map((charge, chargeIndex) => ({ charge, path: ['chargeLineItems', chargeIndex], label: `Charge ${chargeIndex + 1}` }))
        : []),
    ];
    const sectionDefinitions = [
      { id: 'header', label: 'Invoice Header', value: canonical.invoiceHeader && typeof canonical.invoiceHeader === 'object' && !Array.isArray(canonical.invoiceHeader) ? canonical.invoiceHeader : {} },
      { id: 'shipment', label: 'Shipments', value: shipmentRecords },
      { id: 'charges', label: 'Charge Line Items', value: chargeRecords },
    ];
    const activeSection = sectionDefinitions.find((section) => section.id === selectedSection) || sectionDefinitions[0];
    const isEmpty = Object.keys(canonical).length === 0;

    const updateInvoiceField = (key, value) => {
      setInvoiceDrafts((current) => ({
        ...current,
        [selectedInvoice.id]: { ...(current[selectedInvoice.id] || {}), [key]: value }
      }));
    };

    const updateInvoicePath = (path, value) => {
      setInvoiceDrafts((current) => {
        const next = JSON.parse(JSON.stringify(current[selectedInvoice.id] || {}));
        let target = next;
        path.slice(0, -1).forEach((part) => { target = target[part]; });
        target[path[path.length - 1]] = value;
        return { ...current, [selectedInvoice.id]: next };
      });
    };

    const saveInvoice = async () => {
      setSavingInvoice(true);
      try {
        const response = await fetch(`${API}/documents/${docId}/review`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ invoiceId: selectedInvoice.id, editedData: canonical })
        });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.error || 'Unable to save invoice.');
      } catch (error) {
        alert(error.message || 'Unable to save invoice.');
      } finally {
        setSavingInvoice(false);
      }
    };

    const discardDocument = async () => {
      if (discarding) return;
      setDiscarding(true);
      pollingRef.current.cancelled = true;
      if (pollingRef.current.timeout) window.clearTimeout(pollingRef.current.timeout);
      pollingRef.current.controller?.abort();

      try {
        const response = await fetch(`${API}/documents/${docId}`, { method: 'DELETE', cache: 'no-store' });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.error || 'Unable to discard document.');

        setDoc(null);
        setInvoiceDrafts({});
        setDocuments((current) => current.filter((item) => item.id !== docId));
        window.history.pushState({}, '', '/documents');
        setPath('/documents');
        try {
          const latestDocuments = await fetchJson(`${API}/documents?refresh=${Date.now()}`);
          const latestJson = await latestDocuments.json();
          if (latestDocuments.ok) setDocuments(latestJson.documents || []);
        } catch (refreshError) {
          console.error('Document list refresh failed after discard', refreshError);
        }
        setDiscarding(false);
      } catch (error) {
        if (error.name !== 'AbortError') alert(error.message || 'Unable to discard document.');
        setDiscarding(false);
      }
    };

    const renderEditableNode = (value, path, label, options = {}) => {
      if (Array.isArray(value)) {
        return (
          <div className="section-block" key={path.join('.') || label}>
            {label && <div className="section-title">{label}</div>}
            {value.length === 0 && <div className="subtle-copy">No records found</div>}
            {value.map((item, index) => (
              <div className="nested-record" key={`${path.join('.')}-${index}`}>
                <div className="field-label">{label ? `${label} ${index + 1}` : `Record ${index + 1}`}</div>
                {renderEditableNode(item, [...path, index], '')}
              </div>
            ))}
          </div>
        );
      }
      if (value && typeof value === 'object') {
        return (
          <div className="field-grid" key={path.join('.') || label}>
            {Object.entries(value)
              .filter(([key]) => !options.excludeKeys?.includes(key))
              .map(([key, child]) => renderEditableNode(child, [...path, key], key, options))}
          </div>
        );
      }
      return (
        <div className="field-group" key={path.join('.')}>
          <label className="field-label">{label || path[path.length - 1]}</label>
          <input
            className="field-input"
            value={value === null || value === undefined ? '' : String(value)}
            onChange={(event) => updateInvoicePath(path, event.target.value)}
          />
        </div>
      );
    };

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
      return <div className="invoice-sections">
        {activeSection.id === 'header' && renderEditableNode(activeSection.value, ['invoiceHeader'], activeSection.label)}
        {activeSection.id === 'shipment' && renderEditableNode(activeSection.value, [shipmentKey], activeSection.label, { excludeKeys: ['chargeLineItems'] })}
        {activeSection.id === 'charges' && (chargeRecords.length > 0
          ? chargeRecords.map((record) => <div className="nested-record" key={record.path.join('.')}><div className="field-label">{record.label}</div>{renderEditableNode(record.charge, record.path, '')}</div>)
          : <div className="subtle-copy">No records found</div>)}
      </div>;
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
              <button type="button" className="secondary-btn" onClick={discardDocument} disabled={discarding}>
                {discarding ? 'Discarding...' : 'Discard'}
              </button>
              {!isEmpty && <button className="primary-btn" onClick={saveInvoice} disabled={savingInvoice}>{savingInvoice ? 'Saving...' : 'Save & Approve'}</button>}
              {!isEmpty && <button className="secondary-btn">Generate Invoice</button>}
            </div>
          </div>

          <div className="review-page">
            <div className="card preview-panel">
              <h3 className="section-title" style={{ color: '#fff', letterSpacing: '0.1em' }}>Original Document</h3>
              <div className="invoice-preview-list">
                <div className="invoice-tab-bar">
                  <div className="invoice-preview-item active">
                    <span><strong>Original uploaded document</strong></span>
                    <small>{selectedInvoice.extractionComplete ? '✓ Extracted' : 'Document preview'}</small>
                  </div>
                </div>
                <div className="preview-box" key={selectedInvoice?.id || docId}>
                  {isPdfDocument() ? (
                    <>
                      <iframe className="document-scroll-viewer" src={`${previewUrl}#page=${selectedInvoice?.pageStart || 1}`} title="Original document preview" />
                      <a className="document-open-fallback" href={`${previewUrl}#page=${selectedInvoice?.pageStart || 1}`} target="_blank" rel="noreferrer">Open original document</a>
                    </>
                  ) : (
                    <img src={previewUrl} alt="Document Preview" onError={(e) => { e.currentTarget.src = 'https://placehold.co/600x800/1e293b/475569?text=No+Preview+Available'; }} />
                  )}
                </div>
              </div>
            </div>

            <div className="card editor-panel">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <h3 className="section-title" style={{ color: '#fff', letterSpacing: '0.1em', margin: 0 }}>Extracted Fields</h3>
              </div>
              <div className="invoice-section-tabs" role="tablist" aria-label="Extracted invoice sections">
                {sectionDefinitions.map((section) => (
                  <button key={section.id} type="button" role="tab" aria-selected={activeSection.id === section.id} className={activeSection.id === section.id ? 'primary-btn' : 'secondary-btn'} onClick={() => setSelectedSection(section.id)}>
                    {section.label}
                  </button>
                ))}
              </div>
              <div className="editor-scroll-content">
                {renderFieldInputs()}
                {processing && <div className="progress-box mt-4">The n8n workflow is extracting and validating document data automatically.</div>}
              </div>
            </div>
          </div>
        </main>
      </>
    );
  };

  const InvoiceView = () => {
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
    case 'upload': return <UploadView />;
    case 'review': return <ReviewView />;
    case 'invoice': return <InvoiceView />;
    case 'invoices': return renderInvoicesView();
    case 'queue': return <QueueView />;
    default: return renderDocumentsView();
  }
}

export default App;
