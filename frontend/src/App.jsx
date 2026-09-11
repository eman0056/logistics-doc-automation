import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';

const API = '/api';

class RouteErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    console.error('Route render error', error);
  }

  render() {
    if (this.state.hasError) {
      return <main className="page"><div className="card empty-state">Unable to render this page. Refresh and try again.</div></main>;
    }
    return this.props.children;
  }
}

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
  const unwrap = (value) => {
    let current = value;
    if (typeof current === 'string') {
      try { current = JSON.parse(current); } catch (error) { return {}; }
    }
    if (current && typeof current === 'object' && !Array.isArray(current) && current.extractedData && typeof current.extractedData === 'object') {
      return unwrap(current.extractedData);
    }
    return current && typeof current === 'object' && !Array.isArray(current) ? current : {};
  };

  const extractedData = unwrap(invoice?.extractedData);
  if (Object.keys(extractedData).length > 0) return extractedData;
  try {
    const stored = invoice?.canonicalJson || invoice?.finalSubmittedData;
    return unwrap(stored);
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

const getInvoiceHeader = (invoice) => {
  const data = parseStoredInvoiceData(invoice);
  return data.invoiceHeader && typeof data.invoiceHeader === 'object' && !Array.isArray(data.invoiceHeader)
    ? data.invoiceHeader
    : data;
};

const getInvoiceLabel = (invoice) => {
  const header = getInvoiceHeader(invoice);
  return invoice?.invoiceNumber || header.invoiceNumber || header.invoiceId || header.documentNumber || header.invoiceNo || 'Invoice details';
};

const getInvoiceTotal = (invoice) => {
  const header = getInvoiceHeader(invoice);
  return header.totalAmountDue ?? header.totalAmount ?? header.total ?? null;
};

const getInvoiceDate = (invoice) => {
  const header = getInvoiceHeader(invoice);
  return header.invoiceDate ?? header.date ?? null;
};

const getInvoiceCurrency = (invoice) => {
  const header = getInvoiceHeader(invoice);
  return header.currency ?? null;
};

const RouteSkeleton = ({ label = 'Loading page...' }) => (
  <main className="page route-skeleton" aria-busy="true">
    <div className="skeleton-line skeleton-line-wide" />
    <div className="skeleton-line" />
    <div className="skeleton-panel"><span>{label}</span></div>
  </main>
);

const invoiceSections = (data) => {
  const shipmentKey = Array.isArray(data?.shipmentDetails) ? 'shipmentDetails' : 'shipments';
  const shipments = Array.isArray(data?.[shipmentKey])
    ? data[shipmentKey]
    : (Array.isArray(data?.shipmentDetail) ? data.shipmentDetail : []);
  const nestedCharges = shipments.flatMap((shipment) => Array.isArray(shipment?.chargeLineItems) ? shipment.chargeLineItems : []);
  const charges = [...nestedCharges, ...(Array.isArray(data?.chargeLineItems) ? data.chargeLineItems : [])];
  return {
    header: data?.invoiceHeader && typeof data.invoiceHeader === 'object' ? data.invoiceHeader : {},
    shipments,
    charges,
  };
};

const InvoiceExtractionCard = ({ invoice, isActive, onSelect }) => {
  const initialData = parseStoredInvoiceData(invoice);
  const [draft, setDraft] = useState(initialData);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [activeSheet, setActiveSheet] = useState('header');
  const cardRef = useRef(null);
  const sections = useMemo(() => invoiceSections(draft), [draft]);
  const sheetDefinitions = [
    { id: 'header', label: 'Invoice Header', value: sections.header, path: ['invoiceHeader'] },
    { id: 'shipments', label: 'Shipments', value: sections.shipments, path: [Array.isArray(draft.shipmentDetails) ? 'shipmentDetails' : 'shipments'] },
    { id: 'charges', label: 'Charge Line Items', value: sections.charges, path: ['chargeLineItems'] },
  ];
  const activeSheetDefinition = sheetDefinitions.find((sheet) => sheet.id === activeSheet) || sheetDefinitions[0];

  useEffect(() => {
    setDraft(parseStoredInvoiceData(invoice));
    setActiveSheet('header');
  }, [invoice]);

  useEffect(() => {
    if (isActive) cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [isActive]);

  const updatePath = (parts, value) => {
    setDraft((current) => {
      const next = JSON.parse(JSON.stringify(current || {}));
      let target = next;
      parts.slice(0, -1).forEach((part) => { target = target[part]; });
      target[parts[parts.length - 1]] = value;
      return next;
    });
  };

  const renderEditable = (value, label, parts) => {
    if (Array.isArray(value)) {
      return <div className="invoice-card-record-list" key={parts.join('.')}>
        {value.length === 0 ? <div className="subtle-copy">No records found</div> : value.map((item, index) => (
          <div className="invoice-card-record" key={`${parts.join('.')}-${index}`}>
            <div className="field-label">{label} {index + 1}</div>
            {renderEditable(item, '', [...parts, index])}
          </div>
        ))}
      </div>;
    }
    if (value && typeof value === 'object') {
      return <div className="invoice-card-fields" key={parts.join('.')}>
        {Object.entries(value).map(([key, child]) => renderEditable(child, key, [...parts, key]))}
      </div>;
    }
    return <label className="invoice-card-field" key={parts.join('.')}>
      <span>{label || parts[parts.length - 1]}</span>
      <input value={value === null || value === undefined ? '' : String(value)} onChange={(event) => updatePath(parts, event.target.value)} />
    </label>;
  };

  const save = async () => {
    setSaving(true);
    setSaveError('');
    try {
      const response = await fetch(`${API}/documents/${invoice.documentId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId: invoice.id || invoice.invoiceId, editedData: draft }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Unable to save invoice.');
    } catch (error) {
      setSaveError(error.message || 'Unable to save invoice.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <article ref={cardRef} className={`invoice-extraction-card ${isActive ? 'is-active' : ''}`} data-invoice-card={invoice.invoiceIndex} onClick={onSelect}>
      <div className="invoice-card-heading">
        <div>
          <span className="eyebrow">Invoice {Number(invoice.invoiceIndex ?? 0) + 1}</span>
          <h2>{getInvoiceLabel({ ...invoice, extractedData: draft })}</h2>
          <span className="subtle-copy">Pages {invoice.pageStart ?? 'N/A'}-{invoice.pageEnd ?? 'N/A'}</span>
        </div>
        <div className="invoice-card-meta">
          <span className="status-pill success">{invoice.status || invoice.extractionStatus || 'EXTRACTED'}</span>
          <span className="confidence-badge">Confidence {invoice.overallConfidence ?? 'N/A'}</span>
          <button type="button" className="secondary-btn" onClick={(event) => { event.stopPropagation(); save(); }} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
        </div>
      </div>
      {saveError && <div className="invoice-card-error">{saveError}</div>}
      {Object.keys(draft).length === 0 ? <div className="empty-state">Extraction data unavailable.</div> : (
        <>
          <div className="invoice-card-tabs" role="tablist" aria-label={`Invoice ${Number(invoice.invoiceIndex ?? 0) + 1} sheets`}>
            {sheetDefinitions.map((sheet) => <button key={sheet.id} type="button" role="tab" aria-selected={activeSheet === sheet.id} className={activeSheet === sheet.id ? 'primary-btn' : 'secondary-btn'} onClick={(event) => { event.stopPropagation(); setActiveSheet(sheet.id); }}>{sheet.label}</button>)}
          </div>
          <div className="invoice-card-sections">
            <section><h3>{activeSheetDefinition.label}</h3>{renderEditable(activeSheetDefinition.value, activeSheetDefinition.label, activeSheetDefinition.path)}</section>
          </div>
        </>
      )}
      {invoice.confidenceScores && <div className="invoice-card-confidence"><strong>Confidence scores</strong><span>{Object.entries(invoice.confidenceScores).map(([key, value]) => `${key}: ${value}`).join(' | ')}</span></div>}
    </article>
  );
};

const DocumentPage = ({ docId, pageNumber, invoiceIndex, active, onVisible }) => {
  const pageRef = useRef(null);
  useEffect(() => {
    const node = pageRef.current;
    if (!node || !window.IntersectionObserver) return undefined;
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) onVisible(invoiceIndex); }, { threshold: 0.45 });
    observer.observe(node);
    return () => observer.disconnect();
  }, [invoiceIndex, onVisible]);
  return (
    <section ref={pageRef} className={`document-page ${active ? 'is-active' : ''}`} data-page-number={pageNumber}>
      <div className="document-page-label">Invoice {invoiceIndex + 1} - Page {pageNumber}</div>
      <iframe src={`${API}/documents/${docId}/file#page=${pageNumber}`} title={`Document page ${pageNumber}`} />
    </section>
  );
};

function App() {
  const [customer, setCustomer] = useState(defaultCustomer);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
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

        if (!customerRes.ok) {
          throw new Error('Unable to load customer data.');
        }
        if (!docsRes.ok) {
          throw new Error('Unable to load document data.');
        }

        const customerJson = await customerRes.json();
        const docsJson = await docsRes.json();

        if (customerJson.customer) setCustomer(customerJson.customer);
        setDocuments(docsJson.documents || []);
      } catch (error) {
        setLoadError(error.message || 'Unable to load application data.');
        console.error('Load error', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const route = useMemo(() => {
    if (path === '/documents/upload') return 'upload';
    if (path.startsWith('/review-multi/')) return 'review-multi';
    if (path.startsWith('/documents/') && path.includes('/invoices/')) return 'multi-invoice-detail';
    if (path.startsWith('/documents/') && path.endsWith('/invoices')) return 'multi-invoice-list';
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
            <a href={doc.invoiceCount > 1 ? `/documents/${doc.id}/invoices` : `/documents/${doc.id}/review`} className="nav-link" style={{ padding: '0.4rem 0.6rem', display: 'inline-flex' }}>
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
            {(doc.invoices || []).length > 1 && (
              <a href={`/documents/${doc.id}/invoices`} className="nav-link" style={{ padding: '0.4rem 0.6rem', display: 'inline-flex', marginLeft: '0.25rem' }}>
                View Invoices
              </a>
            )}
          </td>
        </tr>
      );
    });

    return (
      <>
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

      let redirectScheduled = false;
      let redirectAttempts = 0;
      const maxRedirectAttempts = 12;

      const scheduleRedirect = async (completedId) => {
        if (redirectScheduled) return;
        redirectScheduled = true;

        const tryResolveRoute = async () => {
          try {
            const documentsResponse = await fetchJson(`${API}/documents?refresh=${Date.now()}`);
            const documentsJson = await documentsResponse.json();
            const completedDocument = (documentsJson.documents || []).find((document) => document.id === completedId) || null;
            const invoiceCount = Number(completedDocument?.invoiceCount ?? completedDocument?.invoices?.length ?? 0);

            if (!completedDocument || invoiceCount < 1) {
              redirectAttempts += 1;
              if (redirectAttempts < maxRedirectAttempts) {
                window.setTimeout(() => tryResolveRoute(), 1500);
                return;
              }
              setUploading(false);
              setStatusText('Waiting for invoice count...');
              console.error('Upload redirect stalled because invoice count is missing or invalid for document', completedId);
              return;
            }

            const target = invoiceCount > 1
              ? `/documents/${completedId}/invoices`
              : `/documents/${completedId}/review`;

            setUploading(false);
            setStatusText('Redirecting...');

            if (window.location.pathname !== target) {
              window.location.assign(target);
            }
          } catch (error) {
            redirectAttempts += 1;
            if (redirectAttempts < maxRedirectAttempts) {
              window.setTimeout(() => tryResolveRoute(), 1500);
              return;
            }
            setUploading(false);
            setStatusText('Waiting for invoice count...');
            console.error('Upload redirect error', error);
          }
        };

        window.setTimeout(() => tryResolveRoute(), 800);
      };

      try {
        const res = await fetchJson(`${API}/documents/upload`, { method: 'POST', body: formData });
        const data = await res.json();
        if (data.success && data.documentIds && data.documentIds.length > 0) {
          const dispatchMap = {};
          (data.dispatches || []).forEach((d) => { dispatchMap[d.documentId] = d; });

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
              const completedId = firstCompletedDoc || data.documentIds[0];

              if (!redirectScheduled) {
                scheduleRedirect(completedId);
              }
              return;
            }

            if (!redirectScheduled) {
              window.setTimeout(pollProgress, 1500);
            }
          };

          window.setTimeout(pollProgress, 1000);
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
      <>
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
          console.log('REVIEW API RESPONSE', { status: res.status, response: json, documentId: docId });
          const found = (json.documents || []).find((item) => item.id === docId) || null;
          console.log('EXTRACTED DATA', found?.invoices?.[0]?.extractedData || found?.extraction?.extractedData);
          console.log('INVOICE HEADER', (found?.invoices?.[0]?.extractedData || found?.extraction?.extractedData)?.invoiceHeader);
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
      const hasRealExtraction = Object.keys(getSingleInvoiceData(doc)).length > 0;
      const invoicesPending = doc?.invoices?.some((invoice) => !hasStoredInvoiceData(invoice) && invoice.extractionStatus !== 'EXTRACTED');
      const isDocReady = doc && hasRealExtraction;
      const terminalStatuses = new Set(['FAILED', 'EXTRACTED', 'APPROVED', 'INVOICE_GENERATED', 'IN_REVIEW']);

      if (!doc) {
        setProcessing(false);
        return undefined;
      }

      if (terminalStatuses.has(doc.status)) {
        setProcessing(false);
        return undefined;
      }

      if (!isDocReady && !invoicesPending) {
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

            const terminalApiStatus = status?.status || '';
            const stopPolling = Boolean(status?.isExtracted || terminalStatuses.has(terminalApiStatus));
            if (stopPolling) {
              setProcessing(false);
              return;
            }

            if (latestDoc && status.extractedData && Object.keys(status.extractedData).length > 0) {
              latestDoc.extraction = {
                ...(latestDoc.extraction || {}),
                extractedData: status.extractedData,
                canonicalJson: JSON.stringify(status.extractedData),
              };
            }
            if (latestDoc) setDoc(latestDoc);
            if (status.status === 'FAILED') setProcessing(false);
          } catch (error) {
            if (error.name !== 'AbortError' && !pollingRef.current.cancelled) console.error(error);
            setProcessing(false);
            return;
          }
          if (!pollingRef.current.cancelled) {
            if (pollingRef.current.controller?.signal?.aborted) return;
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

    if (loadingDoc) return <RouteSkeleton label="Loading review..." />;

    if (!doc) return <main className="page"><div className="card upload-panel">Document not found.</div></main>;

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
    const selectedInvoiceData = selectedInvoice.extractedData || {};
    const draft = invoiceDrafts[selectedInvoice?.id];
    const canonical = draft && Object.keys(draft).length > 0 ? draft : selectedInvoiceData;
    console.log('REVIEW RENDER MAPPING', { documentId: docId, invoiceId: selectedInvoice.id, extractedData: selectedInvoiceData, invoiceHeader: selectedInvoiceData?.invoiceHeader });
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
            <div className="section-title">Extraction data unavailable</div>
            <div className="subtle-copy">The API response did not contain extracted invoice data.</div>
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

  const MultiInvoiceListView = () => {
    const docId = path.startsWith('/review-multi/') ? path.split('/')[2] : path.split('/')[2];
    const [doc, setDoc] = useState(null);
    const [invoices, setInvoices] = useState([]);
    const [loadingDoc, setLoadingDoc] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
      let active = true;
      setDoc(null);
      setLoadingDoc(true);
      const load = async () => {
        try {
          const [documentResponse, invoiceResponse] = await Promise.all([
            fetchJson(`${API}/documents?refresh=${Date.now()}`),
            fetchJson(`${API}/documents/${docId}/invoices?refresh=${Date.now()}`),
          ]);
          const documentJson = await documentResponse.json();
          const invoiceJson = await invoiceResponse.json();
          if (!documentResponse.ok || !invoiceResponse.ok) throw new Error(invoiceJson.error || documentJson.error || 'Unable to load invoices.');
          const found = (documentJson.documents || []).find((item) => item.id === docId) || null;
          if (active) {
            setDoc(found);
            setInvoices(Array.isArray(invoiceJson.invoices) ? invoiceJson.invoices : []);
          }
        } catch (error) {
          if (active) setError(error.message || 'Unable to load invoices.');
        } finally {
          if (active) setLoadingDoc(false);
        }
      };
      load();
      return () => { active = false; };
    }, [docId]);

    useEffect(() => {
      if (!doc || (doc.invoices || []).length > 0 || ['EXTRACTED', 'APPROVED', 'INVOICE_GENERATED', 'FAILED'].includes(doc.status)) {
        setProcessing(false);
        return undefined;
      }
      let cancelled = false;
      let timeout;
      const poll = async () => {
        try {
          const [documentResponse, invoiceResponse] = await Promise.all([
            fetchJson(`${API}/documents?refresh=${Date.now()}`),
            fetchJson(`${API}/documents/${docId}/invoices?refresh=${Date.now()}`),
          ]);
          const json = await documentResponse.json();
          const invoiceJson = await invoiceResponse.json();
          const latest = (json.documents || []).find((item) => item.id === docId);
          if (!cancelled && latest) {
            setDoc(latest);
            if (invoiceResponse.ok) setInvoices(Array.isArray(invoiceJson.invoices) ? invoiceJson.invoices : []);
          }
        } catch (error) {
          if (!cancelled) console.error(error);
        }
        if (!cancelled) timeout = window.setTimeout(poll, 1500);
      };
      setProcessing(true);
      poll();
      return () => {
        cancelled = true;
        window.clearTimeout(timeout);
      };
    }, [doc, docId]);

    if (loadingDoc) return <RouteSkeleton label="Loading invoices..." />;
    if (!doc) return <main className="page"><div className="card upload-panel">Document not found.</div></main>;

    return <MultiInvoiceSplitView doc={doc} invoices={invoices} docId={docId} error={error} processing={processing} />;
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // MultiInvoiceSplitView — isolated Left Sidebar + Right Editable Fields Panel
  // ReviewView (single-invoice /documents/:id/review) is completely untouched.
  // ─────────────────────────────────────────────────────────────────────────────
  const MultiInvoiceSplitView = ({ doc, invoices, docId, error, processing }) => {
    const [selectedInvoiceIndex, setSelectedInvoiceIndex] = useState(0);
    const [drafts, setDrafts] = useState(() => {
      const initial = {};
      invoices.forEach((inv, idx) => { initial[idx] = parseStoredInvoiceData(inv); });
      return initial;
    });
    const [activeTab, setActiveTab] = useState('header');
    const [savingIndex, setSavingIndex] = useState(null);
    const [saveError, setSaveError] = useState('');
    const [saveSuccess, setSaveSuccess] = useState(false);
    const rightPanelRef = useRef(null);

    // Seed new invoices into drafts when the invoices array changes (polling updates)
    useEffect(() => {
      setDrafts((current) => {
        const next = { ...current };
        invoices.forEach((inv, idx) => {
          if (!next[idx] || Object.keys(next[idx]).length === 0) {
            next[idx] = parseStoredInvoiceData(inv);
          }
        });
        return next;
      });
    }, [invoices]);

    // Reset tab + feedback when switching invoices
    useEffect(() => {
      setActiveTab('header');
      setSaveError('');
      setSaveSuccess(false);
      rightPanelRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }, [selectedInvoiceIndex]);

    const selectedInvoice = invoices[selectedInvoiceIndex] || null;
    const selectedDraft = drafts[selectedInvoiceIndex] || {};
    const sections = useMemo(() => invoiceSections(selectedDraft), [selectedDraft]);

    const tabDefs = [
      { id: 'header', label: 'Invoice Header', value: sections.header, path: ['invoiceHeader'] },
      { id: 'shipments', label: 'Shipments', value: sections.shipments, path: [Array.isArray(selectedDraft.shipmentDetails) ? 'shipmentDetails' : 'shipments'] },
      { id: 'charges', label: 'Charge Line Items', value: sections.charges, path: ['chargeLineItems'] },
    ];
    const activeTabDef = tabDefs.find((t) => t.id === activeTab) || tabDefs[0];

    // Deep path updater — mutates the draft for whichever invoice index owns the field card.
    const updateDraftPathForIndex = useCallback((invoiceIndex, parts, value) => {
      setDrafts((current) => {
        const next = JSON.parse(JSON.stringify(current[invoiceIndex] || {}));
        let target = next;
        parts.slice(0, -1).forEach((part) => { target = target[part]; });
        target[parts[parts.length - 1]] = value;
        return { ...current, [invoiceIndex]: next };
      });
    }, []);

    const updateDraftPath = useCallback((parts, value) => {
      updateDraftPathForIndex(selectedInvoiceIndex, parts, value);
    }, [selectedInvoiceIndex, updateDraftPathForIndex]);

    // Recursive editable field renderer bound to the invoice card being rendered.
    const renderEditable = useCallback((value, label, parts, invoiceIndex = selectedInvoiceIndex) => {
      if (Array.isArray(value)) {
        return (
          <div className="mir-record-list" key={parts.join('.')}>
            {value.length === 0
              ? <div className="subtle-copy">No records found</div>
              : value.map((item, idx) => (
                <div className="mir-record" key={`${parts.join('.')}-${idx}`}>
                  <div className="mir-record-label">{label} {idx + 1}</div>
                  {renderEditable(item, '', [...parts, idx], invoiceIndex)}
                </div>
              ))}
          </div>
        );
      }
      if (value && typeof value === 'object') {
        return (
          <div className="mir-field-grid" key={parts.join('.')}>
            {Object.entries(value).map(([key, child]) => renderEditable(child, key, [...parts, key], invoiceIndex))}
          </div>
        );
      }
      return (
        <label className="mir-field" key={parts.join('.')}>
          <span className="mir-field-label">{label || parts[parts.length - 1]}</span>
          <input
            className="mir-field-input"
            value={value === null || value === undefined ? '' : String(value)}
            onChange={(e) => updateDraftPathForIndex(invoiceIndex, parts, e.target.value)}
          />
        </label>
      );
    }, [selectedInvoiceIndex, updateDraftPathForIndex]);

    const saveCurrentInvoice = async () => {
      if (!selectedInvoice) return;
      setSavingIndex(selectedInvoiceIndex);
      setSaveError('');
      setSaveSuccess(false);
      try {
        const invoiceId = selectedInvoice.id || selectedInvoice.invoiceId;
        const response = await fetch(`${API}/documents/${docId}/review`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ invoiceId, editedData: selectedDraft }),
        });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.error || 'Unable to save invoice.');
        setSaveSuccess(true);
        window.setTimeout(() => setSaveSuccess(false), 2500);
      } catch (err) {
        setSaveError(err.message || 'Unable to save invoice.');
      } finally {
        setSavingIndex(null);
      }
    };

    const isSaving = savingIndex === selectedInvoiceIndex;
    const isEmpty = Object.keys(selectedDraft).length === 0;

    return (
      <>
        <main className="page">
          <div className="section-header">
            <div>
              <div className="eyebrow">Multi-Invoice Review</div>
              <h1 className="page-title">{doc.fileName}</h1>
              <p className="subtle-copy mt-2">
                {invoices.length > 0
                  ? <><strong style={{ color: 'var(--primary)' }}>{invoices.length}</strong> invoices extracted — select one to review and edit</>
                  : 'Invoices detected in this document will appear here.'}
              </p>
            </div>
            <a href="/documents" className="secondary-btn">← Back to Documents</a>
          </div>

          {error && <div className="card empty-state" style={{ marginBottom: '1rem' }}>{error}</div>}
          {!error && processing && (
            <div className="progress-box multi-invoice-progress">
              ⏳ The document is still being processed. This view will update automatically.
            </div>
          )}
          {!error && !processing && invoices.length === 0 && (
            <div className="card empty-state">No invoice records are available for this document yet.</div>
          )}

          {invoices.length > 0 && (
            <div className="mir-shell">

              {/* ── LEFT SIDEBAR: Invoice 1…N Selector ─────────────────── */}
              <aside className="mir-sidebar" aria-label="Invoice selector">
                <div className="mir-sidebar-header">
                  <span className="mir-sidebar-title">Invoices</span>
                  <span className="mir-count-badge">{invoices.length}</span>
                </div>
                <nav className="mir-invoice-list">
                  {invoices.map((inv, idx) => {
                    const label = getInvoiceLabel(inv);
                    const total = getInvoiceTotal(inv);
                    const currency = getInvoiceCurrency(inv);
                    const status = inv.status || inv.extractionStatus || 'EXTRACTED';
                    const isActive = selectedInvoiceIndex === idx;
                    return (
                      <button
                        key={inv.invoiceId || inv.id || idx}
                        type="button"
                        id={`invoice-selector-${idx}`}
                        className={`mir-invoice-item${isActive ? ' is-active' : ''}`}
                        onClick={() => setSelectedInvoiceIndex(idx)}
                        aria-pressed={isActive}
                      >
                        <div className="mir-invoice-item-top">
                          <span className="mir-invoice-index">Invoice {idx + 1}</span>
                          {isActive && <span className="mir-active-dot" aria-hidden="true" />}
                        </div>
                        <div className="mir-invoice-item-label">{label}</div>
                        <div className="mir-invoice-item-meta">
                          {total != null && <span className="mir-invoice-total">{currency || ''} {total}</span>}
                          <span className={`status-pill ${normalizeStatus(status)}`}>{status}</span>
                        </div>
                        {inv.pageStart != null && (
                          <div className="mir-invoice-pages">Pages {inv.pageStart}–{inv.pageEnd ?? inv.pageStart}</div>
                        )}
                        {inv.overallConfidence != null && (
                          <div className="mir-invoice-confidence">Confidence {inv.overallConfidence}</div>
                        )}
                      </button>
                    );
                  })}
                </nav>
              </aside>

              {/* ── RIGHT PANEL: Editable Extracted Fields ───────────────── */}
              <section className="mir-detail-panel" ref={rightPanelRef} aria-label="Invoice extracted fields">
                {selectedInvoice ? (
                  <>
                    <div className="mir-panel-header">
                      <div>
                        <div className="eyebrow" style={{ marginBottom: '0.25rem' }}>
                          Invoice {selectedInvoiceIndex + 1} of {invoices.length}
                        </div>
                        <div className="mir-panel-title">{getInvoiceLabel(selectedInvoice)}</div>
                        <div className="subtle-copy" style={{ fontSize: '0.8rem', marginTop: '0.2rem' }}>
                          All fields are editable — changes are isolated to this invoice only
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        {saveSuccess && <span className="mir-save-success" role="status">✓ Saved</span>}
                        {saveError && <span className="mir-save-error" role="alert">{saveError}</span>}
                        <button
                          id={`save-invoice-${selectedInvoiceIndex}`}
                          type="button"
                          className="primary-btn"
                          onClick={saveCurrentInvoice}
                          disabled={isSaving || isEmpty}
                        >
                          {isSaving ? 'Saving…' : 'Save Invoice'}
                        </button>
                      </div>
                    </div>

                    <div className="mir-tabs" role="tablist" aria-label={`Invoice ${selectedInvoiceIndex + 1} sections`}>
                      {tabDefs.map((tab) => (
                        <button
                          key={tab.id}
                          id={`tab-${tab.id}-${selectedInvoiceIndex}`}
                          type="button"
                          role="tab"
                          aria-selected={activeTab === tab.id}
                          className={`mir-tab${activeTab === tab.id ? ' is-active' : ''}`}
                          onClick={() => setActiveTab(tab.id)}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    <div className="mir-fields-body">
                      {invoices.length > 1 ? (
                        <div className="mir-field-cards">
                          {invoices.map((inv, idx) => {
                            const idxDraft = drafts[idx] || parseStoredInvoiceData(inv);
                            const idxSections = invoiceSections(idxDraft);
                            return (
                              <article className="mir-field-card" key={inv.id || inv.invoiceId || idx}>
                                <div className="mir-field-card-heading">
                                  <div>
                                    <span className="eyebrow">Invoice {idx + 1}</span>
                                    <div className="mir-panel-title">{getInvoiceLabel(inv)}</div>
                                  </div>
                                  <span className="status-pill success">{inv.status || inv.extractionStatus || 'EXTRACTED'}</span>
                                </div>
                                <div className="mir-field-card-sections">
                                  <section className="mir-field-card-section">
                                    <div className="mir-field-card-section-title">Invoice Header</div>
                                    {renderEditable(idxSections.header, 'Invoice Header', ['invoiceHeader'], idx)}
                                  </section>
                                  <section className="mir-field-card-section">
                                    <div className="mir-field-card-section-title">Shipment Details</div>
                                    {renderEditable(idxSections.shipments, 'Shipment Details', [Array.isArray(idxDraft.shipmentDetails) ? 'shipmentDetails' : 'shipments'], idx)}
                                  </section>
                                  <section className="mir-field-card-section">
                                    <div className="mir-field-card-section-title">Charge Line Items</div>
                                    {renderEditable(idxSections.charges, 'Charge Line Items', ['chargeLineItems'], idx)}
                                  </section>
                                </div>
                              </article>
                            );
                          })}
                        </div>
                      ) : (
                        isEmpty
                          ? <div className="empty-state">Extraction data unavailable for this invoice.</div>
                          : renderEditable(activeTabDef.value, activeTabDef.label, activeTabDef.path)
                      )}
                    </div>

                    {selectedInvoice.confidenceScores && (
                      <div className="mir-confidence-footer">
                        <strong>Confidence scores:</strong>{' '}
                        {Object.entries(selectedInvoice.confidenceScores).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="empty-state">Select an invoice on the left to view its details.</div>
                )}
              </section>

            </div>
          )}
        </main>
      </>
    );
  };


  const MultiInvoiceDetailView = () => {
    const routeParts = path.split('/');
    const docId = routeParts[2];
    const invoiceId = decodeURIComponent(routeParts[4] || '');
    const [doc, setDoc] = useState(null);
    const [selectedInvoice, setSelectedInvoice] = useState(null);
    const [loadingDoc, setLoadingDoc] = useState(true);
    const [error, setError] = useState('');
    const [draft, setDraft] = useState(null);
    const [saving, setSaving] = useState(false);
    const [selectedSection, setSelectedSection] = useState('header');

    useEffect(() => {
      let active = true;
      setDoc(null);
      setLoadingDoc(true);
      const load = async () => {
        try {
          const [documentResponse, invoiceResponse] = await Promise.all([
            fetchJson(`${API}/documents?refresh=${Date.now()}`),
            fetchJson(`${API}/documents/${docId}/invoices/${encodeURIComponent(invoiceId)}?refresh=${Date.now()}`),
          ]);
          const documentJson = await documentResponse.json();
          const invoiceJson = await invoiceResponse.json();
          console.log('MULTI INVOICE API RESPONSE', { status: invoiceResponse.status, response: invoiceJson, documentId: docId, invoiceId });
          if (!documentResponse.ok || !invoiceResponse.ok) throw new Error(invoiceJson.error || documentJson.error || 'Unable to load invoice.');
          const found = (documentJson.documents || []).find((item) => item.id === docId) || null;
          const invoice = invoiceJson.invoice;
          if (!found) throw new Error('Document not found.');
          if (!invoice || String(invoice.id) !== invoiceId || String(invoice.documentId) !== docId) throw new Error('Invoice does not belong to this document.');
          if (active) {
            setDoc(found);
            setSelectedInvoice(invoice);
            setDraft(parseStoredInvoiceData(invoice));
          }
        } catch (error) {
          if (active) setError(error.message || 'Unable to load invoice.');
        } finally {
          if (active) setLoadingDoc(false);
        }
      };
      load();
      return () => { active = false; };
    }, [docId, invoiceId]);

    useEffect(() => {
      setSelectedSection('header');
    }, [invoiceId]);

    if (loadingDoc) return <RouteSkeleton label="Loading invoice..." />;
    if (!doc) return <main className="page"><div className="card upload-panel">Document not found.</div></main>;

    if (error) return <main className="page"><div className="card upload-panel"><a href={`/documents/${docId}/invoices`} className="secondary-btn">Back to Invoices</a><p className="subtle-copy mt-4">{error}</p></div></main>;
    if (!selectedInvoice) return <main className="page"><div className="card upload-panel"><a href={`/documents/${docId}/invoices`} className="secondary-btn">Back to Invoices</a><p className="subtle-copy mt-4">Invoice not found in this document.</p></div></main>;

    const data = draft || parseStoredInvoiceData(selectedInvoice);
    console.log('MULTI INVOICE', invoiceId, selectedInvoice);
    console.log('MULTI EXTRACTED DATA', data);
    const header = getInvoiceHeader(selectedInvoice);
    const shipmentKey = Array.isArray(data.shipmentDetails) ? 'shipmentDetails' : 'shipmentDetail';
    const shipmentRecords = Array.isArray(data[shipmentKey]) ? data[shipmentKey] : [];
    const chargeRecords = [
      ...shipmentRecords.flatMap((shipment) => Array.isArray(shipment?.chargeLineItems) ? shipment.chargeLineItems : []),
      ...(Array.isArray(data.chargeLineItems) ? data.chargeLineItems : []),
    ];
    const sections = [
      { id: 'header', label: 'Invoice Header', value: header },
      { id: 'shipment', label: 'Shipment Details', value: shipmentRecords },
      { id: 'charges', label: 'Charge Line Items', value: chargeRecords },
      { id: 'other', label: 'All Available Fields', value: Object.fromEntries(Object.entries(data).filter(([key]) => !['invoiceHeader', 'shipmentDetails', 'shipmentDetail', 'chargeLineItems'].includes(key))) },
    ];
    const activeSection = sections.find((section) => section.id === selectedSection) || sections[0];

    const renderValue = (value, label, key) => {
      if (Array.isArray(value)) {
        return <div className="detail-record-list" key={key}><div className="field-label">{label}</div>{value.length === 0 ? <div className="subtle-copy">N/A</div> : value.map((item, index) => <div className="detail-record" key={`${key}-${index}`}>{renderValue(item, `${label} ${index + 1}`, `${key}-${index}`)}</div>)}</div>;
      }
      if (value && typeof value === 'object') {
        return <div className="detail-field-grid" key={key}>{Object.entries(value).map(([childKey, childValue]) => renderValue(childValue, childKey, `${key}-${childKey}`))}</div>;
      }
      return <div className="detail-field" key={key}><span>{label}</span><strong>{value === null || value === undefined || value === '' ? 'N/A' : String(value)}</strong></div>;
    };

    const updatePath = (parts, value) => {
      setDraft((current) => {
        const next = JSON.parse(JSON.stringify(current || {}));
        let target = next;
        parts.slice(0, -1).forEach((part) => { target = target[part]; });
        target[parts[parts.length - 1]] = value;
        return next;
      });
    };

    const renderEditableValue = (value, label, parts) => {
      if (Array.isArray(value)) {
        return <div className="detail-record-list" key={parts.join('.')}><div className="field-label">{label}</div>{value.length === 0 ? <div className="subtle-copy">No records found</div> : value.map((item, index) => <div className="detail-record" key={`${parts.join('.')}-${index}`}>{renderEditableValue(item, `${label} ${index + 1}`, [...parts, index])}</div>)}</div>;
      }
      if (value && typeof value === 'object') {
        return <div className="detail-field-grid" key={parts.join('.')}>{Object.entries(value).map(([childKey, childValue]) => renderEditableValue(childValue, childKey, [...parts, childKey]))}</div>;
      }
      return <label className="detail-field" key={parts.join('.')}><span>{label}</span><input className="field-input" value={value === null || value === undefined ? '' : String(value)} onChange={(event) => updatePath(parts, event.target.value)} /></label>;
    };

    const saveSelectedInvoice = async () => {
      setSaving(true);
      try {
        const response = await fetch(`${API}/documents/${docId}/review`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ invoiceId, editedData: draft }),
        });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.error || 'Unable to save invoice.');
        setSelectedInvoice((current) => ({ ...current, extractedData: draft, canonicalJson: JSON.stringify(draft), status: 'APPROVED' }));
      } catch (saveError) {
        setError(saveError.message || 'Unable to save invoice.');
      } finally {
        setSaving(false);
      }
    };

    return (
      <>
        <main className="page">
          <div className="section-header">
            <div>
              <div className="eyebrow">Invoice detail</div>
              <h1 className="page-title">{getInvoiceLabel(selectedInvoice)}</h1>
              <p className="subtle-copy mt-2">{doc.fileName} · {selectedInvoice.status || selectedInvoice.extractionStatus || 'PENDING'}</p>
            </div>
            <a href={`/documents/${docId}/invoices`} className="secondary-btn">← Back to Invoices</a>
          </div>
          <div className="invoice-detail-shell">
            <div className="card invoice-detail-summary">
              <span className="eyebrow">Selected invoice</span>
              <strong>{getInvoiceLabel(selectedInvoice)}</strong>
              <span className="subtle-copy">{getInvoiceDate(selectedInvoice) || 'Date unavailable'}</span>
              <span className="invoice-detail-total">{getInvoiceTotal(selectedInvoice) ?? 'N/A'} {getInvoiceCurrency(selectedInvoice) || ''}</span>
              <span className="subtle-copy">Pages {selectedInvoice.pageStart ?? 'N/A'}–{selectedInvoice.pageEnd ?? 'N/A'}</span>
              <span className="subtle-copy">Confidence {selectedInvoice.overallConfidence ?? 'N/A'}</span>
              <iframe className="document-scroll-viewer" style={{ height: '420px', minHeight: '420px', marginTop: '0.5rem' }} src={`${API}/documents/${docId}/file#page=${selectedInvoice.pageStart || 1}`} title="Selected invoice pages" />
            </div>
            <div className="card editor-panel multi-invoice-detail-panel">
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}><button type="button" className="primary-btn" onClick={saveSelectedInvoice} disabled={saving}>{saving ? 'Saving...' : 'Save Invoice'}</button></div>
              <div className="invoice-section-tabs" role="tablist" aria-label="Invoice detail sections">
                {sections.map((section) => <button key={section.id} type="button" role="tab" aria-selected={activeSection.id === section.id} className={activeSection.id === section.id ? 'primary-btn' : 'secondary-btn'} onClick={() => setSelectedSection(section.id)}>{section.label}</button>)}
              </div>
              <div className="detail-fields">{Object.keys(data).length === 0 ? <div className="empty-state">Extraction data unavailable.</div> : Object.keys(activeSection.value || {}).length === 0 && !Array.isArray(activeSection.value) ? <div className="empty-state">No extracted fields available.</div> : renderEditableValue(activeSection.value, activeSection.label, [activeSection.id === 'header' ? 'invoiceHeader' : activeSection.id === 'shipment' ? shipmentKey : activeSection.id === 'charges' ? 'chargeLineItems' : 'other'])}</div>
              {selectedInvoice.rawOcrText && <details className="raw-ocr-panel"><summary>Raw OCR text</summary><pre>{selectedInvoice.rawOcrText}</pre></details>}
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

    if (loading) return <RouteSkeleton label="Loading invoice..." />;
    if (!doc) return <main className="page"><div className="card upload-panel">Invoice not found.</div></main>;

    let canonical = {};
    try {
      canonical = JSON.parse(doc.extraction?.finalSubmittedData || doc.extraction?.canonicalJson || '{}');
    } catch (error) {
      canonical = {};
    }

    return (
      <>
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

  if (loading) return <><>{nav}</><RouteSkeleton label="Loading dashboard..." /></>;

  let renderedRoute;
  switch (route) {
    case 'upload': renderedRoute = <UploadView />; break;
    case 'review': renderedRoute = <ReviewView />; break;
    case 'review-multi': renderedRoute = <MultiInvoiceListView />; break;
    case 'multi-invoice-list': renderedRoute = <MultiInvoiceListView />; break;
    case 'multi-invoice-detail': renderedRoute = <MultiInvoiceDetailView />; break;
    case 'invoice': renderedRoute = <InvoiceView />; break;
    case 'invoices': renderedRoute = renderInvoicesView(); break;
    case 'queue': renderedRoute = <QueueView />; break;
    default: renderedRoute = renderDocumentsView();
  }
  return <><>{nav}{loadError && <div className="app-load-error" role="alert">{loadError}</div>}</><Suspense fallback={<RouteSkeleton />}><RouteErrorBoundary>{renderedRoute}</RouteErrorBoundary></Suspense></>;
}

export default App;
