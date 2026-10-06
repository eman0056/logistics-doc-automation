import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist/build/pdf.js';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url';
import { apiGetJson, normalizeApiCacheUrl } from './dataCache.js';
import { EscalationModal } from './EscalationModal.jsx';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl || `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;

const API = '/api';

// ── FILE STATUS CONSTANTS ────────────────────────────────────────────────────
const FILE_STATUS = {
  READY: 'READY',
  UPLOADING: 'UPLOADING',
  EXTRACTING: 'EXTRACTING',
  COMPLETED: 'COMPLETED',
  NEEDS_REVIEW: 'NEEDS_REVIEW',
  FAILED: 'FAILED',
};

const MAX_FILE_SIZE_MB = 50;

// Accepted file types: PDFs and common invoice image formats
const ACCEPTED_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.tiff', '.tif', '.bmp', '.gif']);
const ACCEPTED_EXTENSIONS = new Set(['.pdf', ...ACCEPTED_IMAGE_EXTENSIONS]);
const ACCEPTED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
  'image/tiff', 'image/bmp', 'image/gif',
]);

/** Returns true if the invoice record represents an image file (not a PDF). */
const isImageFile = (invoice) => {
  if (!invoice) return false;
  const mime = (invoice.mimeType || '').toLowerCase();
  if (mime.startsWith('image/')) return true;
  const fname = (invoice.fileName || invoice.sourceFileName || '').toLowerCase();
  const ext = fname.includes('.') ? '.' + fname.split('.').pop() : '';
  return ACCEPTED_IMAGE_EXTENSIONS.has(ext);
};


function formatFileSize(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const MULTI_INVOICE_N8N_WEBHOOK_URL = 'https://n8n.provelopers.net/webhook/cfc18821-b562-4b0f-8d34-457f83e03f2e';

const localMultiInvoiceFiles = new Map();

export const rememberMultiInvoiceFile = (docId, fileObject) => {
  if (docId && fileObject) localMultiInvoiceFiles.set(docId, fileObject);
};

const invoiceDisplayLabel = (invoice, index = 0) => {
  const idx = Number(invoice?.invoiceIndex ?? index);
  const n = Number.isFinite(idx) ? idx + 1 : index + 1;
  return `Invoice ${String(n).padStart(2, '0')}`;
};

const invoicePageCount = (invoice) => {
  const start = Number(invoice?.pageStart || 1);
  const end = Number(invoice?.pageEnd || start);
  return Math.max(1, end - start + 1);
};

const invoicePagesList = (invoice) => {
  const start = Number(invoice?.pageStart || 1);
  const end = Number(invoice?.pageEnd || start);
  const pages = [];
  for (let p = start; p <= end; p += 1) pages.push(p);
  return pages;
};

const EXTRACTION_UI = {
  IDLE: 'idle',
  PREPARING: 'preparing',
  EXTRACTING: 'extracting',
  EXTRACTED: 'extracted',
  FAILED: 'failed',
};

const normalizeInvoiceExtractionUi = (invoice) => {
  if (!invoice) return EXTRACTION_UI.IDLE;
  if (invoice.extractionUi) return invoice.extractionUi;
  if (invoiceHasRealExtraction(invoice)) return EXTRACTION_UI.EXTRACTED;
  const status = String(invoice.status || invoice.extractionStatus || '').toUpperCase();
  if (['FAILED', 'EXTRACTION_FAILED', 'ERROR'].includes(status)) return EXTRACTION_UI.FAILED;
  if (['EXTRACTING', 'PROCESSING'].includes(status)) return EXTRACTION_UI.EXTRACTING;
  if (['PREPARING'].includes(status)) return EXTRACTION_UI.PREPARING;
  if (['EXTRACTED', 'IN_REVIEW', 'APPROVED', 'INVOICE_GENERATED', 'Ready for Review', 'READY FOR REVIEW'].includes(status)
    || ['EXTRACTED', 'IN_REVIEW', 'APPROVED', 'INVOICE_GENERATED'].includes(String(invoice.status || ''))) {
    if (invoiceHasRealExtraction(invoice)) return EXTRACTION_UI.EXTRACTED;
  }
  if (['POOR_IMAGE_QUALITY', 'POOR IMAGE QUALITY'].includes(status) && invoiceHasRealExtraction(invoice)) {
    return EXTRACTION_UI.EXTRACTED;
  }
  return EXTRACTION_UI.IDLE;
};

const humanInvoiceStatus = (invoice, index = 0) => {
  const ui = normalizeInvoiceExtractionUi(invoice);
  if (invoice?.poorImageQuality || ['POOR_IMAGE_QUALITY', 'Poor Image Quality'].includes(invoice?.status)) {
    return 'Poor Image Quality';
  }
  if (ui === EXTRACTION_UI.EXTRACTED) {
    if (invoice?.status === 'APPROVED') return 'Approved';
    return 'Extracted';
  }
  if (ui === EXTRACTION_UI.EXTRACTING) return 'Extracting';
  if (ui === EXTRACTION_UI.PREPARING) return 'Preparing';
  if (ui === EXTRACTION_UI.FAILED) return 'Extraction Failed';
  return 'Not Extracted';
};

/**
 * Triggers extraction for ONE invoice by asking the backend to slice ONLY that invoice's
 * page range and send the isolated PDF/pages payload to n8n.
 */
export const triggerInvoiceExtraction = async (invoice) => {
  const documentId = invoice?.documentId;
  const invoiceId = invoice?.id || invoice?.invoiceId;
  const invoiceIndex = invoice?.invoiceIndex ?? 0;
  const pageStart = Number(invoice?.pageStart || 1);
  const pageEnd = Number(invoice?.pageEnd || pageStart);
  const pages = invoicePagesList(invoice);

  if (!documentId) {
    throw new Error('Missing documentId for invoice extraction');
  }

  console.log('[Invoice Extraction] Starting isolated extraction:', {
    documentId,
    invoiceId,
    invoiceIndex,
    pageStart,
    pageEnd,
    pages,
  });

  const res = await fetch(`${API}/process-invoice`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      documentId,
      docId: documentId,
      invoiceId,
      invoiceIndex,
      pageStart,
      pageEnd,
      pages,
    }),
  });

  let data = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }

  console.log('[Invoice Extraction] Response:', {
    documentId,
    invoiceId,
    pageStart,
    pageEnd,
    httpStatus: res.status,
    success: res.ok && data.success !== false,
    error: data.error || null,
  });

  if (!res.ok || data.success === false) {
    const message = data.error || `Extraction failed (HTTP ${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    err.details = { documentId, invoiceId, pageStart, pageEnd };
    throw err;
  }

  return data;
};

/** @deprecated Use triggerInvoiceExtraction — kept only for any legacy imports. */
export const triggerMultiInvoiceExtraction = async (docId, fileObject = null) => {
  console.warn('[Multi-Invoice] Full-document n8n trigger is deprecated. Use per-invoice extraction.');
  throw new Error('Full-document n8n extraction is disabled. Select an invoice to extract.');
};


function buildFileEntry(file) {
  return {
    file,
    id: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    status: FILE_STATUS.READY,
    error: null,
    documentId: null,
    invoiceCount: 0,
    needsReview: false,
  };
}

const StatusBadge = ({ status, needsReview }) => {
  if (status === FILE_STATUS.READY)
    return <span className="bq-badge bq-badge--ready">Ready</span>;
  if (status === FILE_STATUS.UPLOADING)
    return <span className="bq-badge bq-badge--uploading"><span className="bq-spin" />Uploading</span>;
  if (status === FILE_STATUS.EXTRACTING)
    return <span className="bq-badge bq-badge--extracting"><span className="bq-spin" />Extracting</span>;
  if (status === FILE_STATUS.COMPLETED)
    return <span className="bq-badge bq-badge--completed">✓ Completed</span>;
  if (status === FILE_STATUS.NEEDS_REVIEW)
    return <span className="bq-badge bq-badge--review">⚠ Needs Review</span>;
  if (status === FILE_STATUS.FAILED)
    return <span className="bq-badge bq-badge--failed">✕ Failed</span>;
  return null;
};

export const UploadMultiView = () => {
  const [fileEntries, setFileEntries] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [batchDone, setBatchDone] = useState(false);
  const [batchResults, setBatchResults] = useState({ docs: 0, completed: 0, needsReview: 0, invoices: 0, failed: 0, poorQuality: 0, docIds: [] });
  const [validationErrors, setValidationErrors] = useState([]);
  const fileInputRef = useRef(null);
  const addMoreRef = useRef(null);

  const objectUrlsRef = useRef(new Map());

  const getObjectUrl = useCallback((file) => {
    if (!file) return '';
    if (!objectUrlsRef.current.has(file)) {
      objectUrlsRef.current.set(file, URL.createObjectURL(file));
    }
    return objectUrlsRef.current.get(file);
  }, []);

  useEffect(() => {
    const map = objectUrlsRef.current;
    return () => {
      map.forEach((url) => URL.revokeObjectURL(url));
      map.clear();
    };
  }, []);

  const checkIsImage = (file) => {
    if (!file) return false;
    if (file.type && file.type.startsWith('image/')) return true;
    const fname = (file.name || '').toLowerCase();
    const ext = fname.includes('.') ? '.' + fname.split('.').pop() : '';
    return ACCEPTED_IMAGE_EXTENSIONS.has('.' + ext.replace(/^\./, ''));
  };

  const validateAndAddFiles = (newFiles) => {
    const errors = [];
    const toAdd = [];
    Array.from(newFiles).forEach((file) => {
      const ext = file.name.includes('.') ? '.' + file.name.split('.').pop().toLowerCase() : '';
      if (!ACCEPTED_EXTENSIONS.has(ext) && !ACCEPTED_MIME_TYPES.has(file.type.toLowerCase())) {
        errors.push(`"${file.name}" — Unsupported file type. Please upload a PDF or image file (JPG, PNG, WEBP, etc.).`);
        return;
      }
      if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        errors.push(`"${file.name}" — File exceeds the ${MAX_FILE_SIZE_MB} MB maximum allowed size.`);
        return;
      }
      const isDuplicate = fileEntries.some(
        (e) => e.file.name === file.name && e.file.size === file.size
      ) || toAdd.some(
        (e) => e.file.name === file.name && e.file.size === file.size
      );
      if (isDuplicate) {
        errors.push(`"${file.name}" — Duplicate file detected, already in queue.`);
        return;
      }
      toAdd.push(buildFileEntry(file));
    });
    setValidationErrors(errors);
    if (toAdd.length > 0) setFileEntries((prev) => [...prev, ...toAdd]);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    validateAndAddFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e) => { e.preventDefault(); setIsDragging(false); };

  const handleFileInput = (e) => {
    validateAndAddFiles(e.target.files);
    e.target.value = '';
  };

  const removeEntry = (id) => setFileEntries((prev) => prev.filter((e) => e.id !== id));
  const clearAll = () => { setFileEntries([]); setValidationErrors([]); };

  const updateEntry = (id, patch) => setFileEntries((prev) => prev.map((e) => e.id === id ? { ...e, ...patch } : e));

  const processFile = async (entry) => {
    updateEntry(entry.id, { status: FILE_STATUS.UPLOADING, error: null });

    const formData = new FormData();
    formData.append('file', entry.file);

    let data;
    try {
      let res = await fetch(`${API}/upload-multi-invoice`, { method: 'POST', body: formData });
      if (!res.ok) res = await fetch(`${API}/documents/upload-multi`, { method: 'POST', body: formData });
      data = await res.json();
    } catch (netErr) {
      updateEntry(entry.id, { status: FILE_STATUS.FAILED, error: 'Network error — could not reach server.' });
      return { success: false };
    }

    if (!data.success) {
      updateEntry(entry.id, { status: FILE_STATUS.FAILED, error: data.error || 'Upload failed.' });
      return { success: false };
    }

    const docId = data.docId || (data.documentIds && data.documentIds[0]);
    const invoiceCount = data.totalInvoices || data.invoices?.length || 1;
    updateEntry(entry.id, { status: FILE_STATUS.COMPLETED, documentId: docId, invoiceCount });
    rememberMultiInvoiceFile(docId, entry.file);
    // Extraction is invoice-specific and starts automatically when the user selects an invoice
    // in the Multi-Invoice Review Workspace — do not send the full document to n8n here.
    return { success: true, docId, invoiceCount };
  };

  const handleProcessAll = async () => {
    if (!fileEntries.length) return;
    setIsProcessing(true);
    setBatchDone(false);
    setValidationErrors([]);

    let completed = 0, failed = 0, needsReview = 0, totalInvoices = 0, poorQuality = 0;
    const docIds = [];

    // Process sequentially with a small concurrency window (2 at a time) to avoid swamping the backend
    const CONCURRENCY = 2;
    const readyEntries = fileEntries.filter((e) => e.status === FILE_STATUS.READY || e.status === FILE_STATUS.FAILED);
    
    for (let i = 0; i < readyEntries.length; i += CONCURRENCY) {
      const batch = readyEntries.slice(i, i + CONCURRENCY);
      const results = await Promise.all(batch.map((e) => processFile(e)));
      results.forEach((r, idx) => {
        if (r.success) {
          if (r.needsReview) { needsReview++; poorQuality++; }
          else { completed++; }
          totalInvoices += r.invoiceCount || 0;
          if (r.docId) docIds.push(r.docId);
        } else {
          failed++;
        }
      });
    }

    // Include previously completed entries in batch results
    const prevCompleted = fileEntries.filter((e) => e.status === FILE_STATUS.COMPLETED || e.status === FILE_STATUS.NEEDS_REVIEW);
    prevCompleted.forEach((e) => {
      if (e.documentId && !docIds.includes(e.documentId)) docIds.push(e.documentId);
    });

    setBatchResults({ docs: fileEntries.length, completed, needsReview, failed, invoices: totalInvoices, poorQuality, docIds });
    setIsProcessing(false);
    setBatchDone(true);
  };

  const handleRetry = async (entry) => {
    updateEntry(entry.id, { status: FILE_STATUS.READY, error: null });
  };

  const handleReviewInvoices = () => {
    const { docIds } = batchResults;
    if (docIds.length === 0) return;
    if (docIds.length === 1) {
      window.location.assign(`/documents/${docIds[0]}/multi-workspace`);
    } else {
      window.location.assign(`/batch-workspace?ids=${docIds.join(',')}`);
    }
  };

  const totalFiles = fileEntries.length;
  const completedCount = fileEntries.filter((e) => [FILE_STATUS.COMPLETED, FILE_STATUS.NEEDS_REVIEW].includes(e.status)).length;
  const processingCount = fileEntries.filter((e) => [FILE_STATUS.UPLOADING, FILE_STATUS.EXTRACTING].includes(e.status)).length;

  if (batchDone) {
    return (
      <main className="page">
        <div className="section-header">
          <div>
            <div className="eyebrow">Batch Processing</div>
            <h1 className="page-title">Batch Processing Complete</h1>
          </div>
        </div>
        <div className="bq-summary-card">
          <div className="bq-summary-icon">✅</div>
          <h2 className="bq-summary-title">Processing Complete</h2>
          <div className="bq-summary-grid">
            <div className="bq-summary-stat">
              <div className="bq-summary-stat__value">{batchResults.docs}</div>
              <div className="bq-summary-stat__label">Documents</div>
            </div>
            <div className="bq-summary-stat bq-summary-stat--success">
              <div className="bq-summary-stat__value">{batchResults.completed}</div>
              <div className="bq-summary-stat__label">Successfully Processed</div>
            </div>
            <div className="bq-summary-stat bq-summary-stat--warning">
              <div className="bq-summary-stat__value">{batchResults.needsReview}</div>
              <div className="bq-summary-stat__label">Needs Review</div>
            </div>
            <div className="bq-summary-stat bq-summary-stat--primary">
              <div className="bq-summary-stat__value">{batchResults.invoices}</div>
              <div className="bq-summary-stat__label">Invoices Extracted</div>
            </div>
            <div className="bq-summary-stat bq-summary-stat--warning">
              <div className="bq-summary-stat__value">{batchResults.poorQuality}</div>
              <div className="bq-summary-stat__label">Poor Image Quality</div>
            </div>
            <div className="bq-summary-stat bq-summary-stat--danger">
              <div className="bq-summary-stat__value">{batchResults.failed}</div>
              <div className="bq-summary-stat__label">Failed</div>
            </div>
          </div>
          <div className="bq-summary-actions">
            {batchResults.docIds.length > 0 && (
              <button className="primary-btn" onClick={handleReviewInvoices}>
                📋 Review Invoices
              </button>
            )}
            <button className="secondary-btn" onClick={() => { setBatchDone(false); setFileEntries([]); setValidationErrors([]); }}>
              ⬆ Upload More Documents
            </button>
            <a className="secondary-btn" href="/documents">← Back to Documents</a>
          </div>
          {/* Show failed files with retry */}
          {fileEntries.some((e) => e.status === FILE_STATUS.FAILED) && (
            <div className="bq-failed-list">
              <div className="bq-failed-title">Failed Documents</div>
              {fileEntries.filter((e) => e.status === FILE_STATUS.FAILED).map((e) => (
                <div key={e.id} className="bq-failed-row">
                  <span className="bq-failed-name">📄 {e.file.name}</span>
                  <span className="bq-failed-error">{e.error || 'Extraction failed'}</span>
                  <button className="secondary-btn bq-retry-btn" onClick={() => { setBatchDone(false); updateEntry(e.id, { status: FILE_STATUS.READY, error: null }); }}>
                    ↺ Retry
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="section-header">
        <div>
          <div className="eyebrow">Workflow</div>
          <h1 className="page-title">Upload Multiple Documents</h1>
          <p className="subtle-copy mt-2">Upload multiple PDF documents at once. Each document can contain one or multiple invoices.</p>
        </div>
      </div>

      {/* ── DROPZONE ── */}
      <div
        className={`bq-dropzone${isDragging ? ' bq-dropzone--active' : ''}`}
        onClick={() => !isProcessing && fileInputRef.current?.click()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={!isProcessing ? handleDrop : (e) => e.preventDefault()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          multiple
          style={{ display: 'none' }}
          onChange={handleFileInput}
        />
        <div className="bq-dropzone__icon">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </div>
        <div className="bq-dropzone__title">Drag & drop your PDF files here</div>
        <div className="bq-dropzone__or">or</div>
        <button type="button" className="primary-btn bq-dropzone__browse" onClick={(e) => { e.stopPropagation(); !isProcessing && fileInputRef.current?.click(); }}>
          Browse Files
        </button>
        <div className="bq-dropzone__hint">Supports multiple PDFs. Each PDF can contain one or multiple invoices. Max {MAX_FILE_SIZE_MB} MB per file.</div>
      </div>

      {/* ── VALIDATION ERRORS ── */}
      {validationErrors.length > 0 && (
        <div className="bq-validation-errors">
          {validationErrors.map((err, i) => (
            <div key={i} className="bq-validation-error">⚠ {err}</div>
          ))}
          <button className="bq-validation-dismiss" onClick={() => setValidationErrors([])}>Dismiss</button>
        </div>
      )}

      {/* ── FILE QUEUE ── */}
      {fileEntries.length > 0 && (
        <div className="bq-queue-section">
          {/* Header row */}
          <div className="bq-queue-header">
            <div className="bq-queue-title">
              Selected Documents <span className="bq-queue-count">{totalFiles}</span>
              {isProcessing && <span className="bq-queue-processing-badge">Processing {processingCount > 0 ? processingCount + ' active' : '...'}</span>}
            </div>
            <div className="bq-queue-actions">
              {!isProcessing && (
                <>
                  <input ref={addMoreRef} type="file" accept=".pdf,application/pdf" multiple style={{ display: 'none' }} onChange={handleFileInput} />
                  <button type="button" className="secondary-btn bq-add-more-btn" onClick={() => addMoreRef.current?.click()}>
                    + Add More Files
                  </button>
                  <button type="button" className="secondary-btn bq-clear-btn" onClick={clearAll}>
                    Clear All
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Overall progress bar (when processing) */}
          {isProcessing && (
            <div className="bq-overall-progress">
              <div className="bq-op-label">
                <span>{completedCount} of {totalFiles} documents processed</span>
                <span className="bq-op-pct">{Math.round((completedCount / Math.max(totalFiles, 1)) * 100)}%</span>
              </div>
              <div className="bq-op-bar">
                <div className="bq-op-bar-fill" style={{ width: `${(completedCount / Math.max(totalFiles, 1)) * 100}%` }} />
              </div>
            </div>
          )}

          {/* File list */}
          <div className="bq-file-list">
            {fileEntries.map((entry) => {
              const isImg = checkIsImage(entry.file);
              const previewUrl = getObjectUrl(entry.file);

              return (
                <div key={entry.id} className={`bq-file-row${entry.status === FILE_STATUS.FAILED ? ' bq-file-row--failed' : ''}`}>
                  <div className="bq-file-icon" style={{ width: '48px', height: '48px', borderRadius: '8px', overflow: 'hidden', background: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {isImg ? (
                      <img
                        src={previewUrl}
                        alt={entry.file.name}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'contain',
                          objectPosition: 'center',
                          display: 'block',
                        }}
                      />
                    ) : (
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="9" y1="13" x2="15" y2="13" /><line x1="9" y1="17" x2="13" y2="17" />
                      </svg>
                    )}
                  </div>
                  <div className="bq-file-info">
                    <div className="bq-file-name">{entry.file.name}</div>
                    <div className="bq-file-meta">
                      {formatFileSize(entry.file.size)}
                      {entry.invoiceCount > 0 && ` · ${entry.invoiceCount} invoice${entry.invoiceCount !== 1 ? 's' : ''} detected`}
                      {entry.error && <span className="bq-file-error-msg"> · {entry.error}</span>}
                    </div>

                    {/* High-quality sharp document preview (object-fit: contain, no cropping) */}
                    {isImg && (
                      <div style={{ marginTop: '8px', maxWidth: '320px', maxHeight: '200px', width: 'auto', height: 'auto', background: 'rgba(2, 6, 23, 0.7)', borderRadius: '6px', padding: '6px', display: 'flex', justifyContent: 'center', alignItems: 'center', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <img
                          src={previewUrl}
                          alt={`${entry.file.name} preview`}
                          style={{
                            maxWidth: '100%',
                            maxHeight: '180px',
                            width: 'auto',
                            height: 'auto',
                            objectFit: 'contain',
                            objectPosition: 'center',
                            display: 'block',
                            borderRadius: '4px',
                          }}
                        />
                      </div>
                    )}
                  </div>
                  <div className="bq-file-status">
                    <StatusBadge status={entry.status} />
                  </div>
                  <div className="bq-file-actions">
                    {entry.status === FILE_STATUS.FAILED && !isProcessing && (
                      <button type="button" className="bq-retry-btn secondary-btn" onClick={() => handleRetry(entry)} title="Retry this document">
                        ↺ Retry
                      </button>
                    )}
                    {!isProcessing && entry.status === FILE_STATUS.READY && (
                      <button type="button" className="bq-remove-btn" onClick={() => removeEntry(entry.id)} title="Remove file" aria-label="Remove file">
                        ×
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Process button */}
          {!isProcessing && (
            <button
              type="button"
              className="primary-btn bq-process-btn"
              onClick={handleProcessAll}
              disabled={isProcessing || fileEntries.filter((e) => e.status === FILE_STATUS.READY || e.status === FILE_STATUS.FAILED).length === 0}
            >
              🚀 Process All Documents
            </button>
          )}
        </div>
      )}
    </main>
  );
};


// Helper to unwraps nested JSON strings or containers to extract real invoice object
export const extractRealInvoiceObject = (raw) => {
  if (!raw) return null;
  let parsed = raw;

  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch (e) {
      return null;
    }
  }

  if (!parsed || typeof parsed !== 'object') return null;

  const isRealInvoice = (obj) => obj && (
    obj.invoiceHeader || obj.shipmentDetails || obj.shipmentDetail || obj.shipment || obj.shippingDetails ||
    obj.chargeLineItems || obj.lineItems || obj.items || obj.charges || obj.header ||
    obj.invoiceNumber || obj.invoice_number || obj.vendorName || obj.totalAmount
  );

  if (parsed.extractedData) {
    const inner = extractRealInvoiceObject(parsed.extractedData);
    if (inner && isRealInvoice(inner)) {
      return inner;
    }
  }

  if (parsed.canonicalJson) {
    const inner = extractRealInvoiceObject(parsed.canonicalJson);
    if (inner && isRealInvoice(inner)) {
      return inner;
    }
  }

  if (parsed.data) {
    const inner = extractRealInvoiceObject(parsed.data);
    if (inner && isRealInvoice(inner)) {
      return inner;
    }
  }

  if (parsed.json) {
    const inner = extractRealInvoiceObject(parsed.json);
    if (inner && isRealInvoice(inner)) {
      return inner;
    }
  }

  if (isRealInvoice(parsed)) {
    const header = (parsed.invoiceHeader || parsed.header) && typeof (parsed.invoiceHeader || parsed.header) === 'object' && !Array.isArray(parsed.invoiceHeader || parsed.header) ? (parsed.invoiceHeader || parsed.header) : parsed;
    let shipments = parsed.shipmentDetails || parsed.shipmentDetail || parsed.shipments || parsed.shipment;
    if (!Array.isArray(shipments)) {
      shipments = shipments && typeof shipments === 'object' ? [shipments] : [];
    }
    let charges = parsed.chargeLineItems || parsed.lineItems || parsed.items || parsed.charges;
    if (!Array.isArray(charges)) {
      charges = charges && typeof charges === 'object' ? [charges] : [];
    }
    if (charges.length === 0 && shipments.length > 0) {
      charges = [...charges];
      shipments.forEach(s => {
        if (s && Array.isArray(s.chargeLineItems)) charges.push(...s.chargeLineItems);
      });
    }
    return {
      ...parsed,
      invoiceHeader: header,
      shipmentDetails: shipments,
      chargeLineItems: charges
    };
  }

  return null;
};

export const invoiceHasRealExtraction = (invoice) => Boolean(
  extractRealInvoiceObject(invoice?.extractedData || invoice?.canonicalJson)
);

// Data extractor helpers
const getInvoiceHeaderFields = (data) => {
  if (!data) return {};
  const header = data.invoiceHeader || data.header || data;
  return {
    invoiceNumber: header.invoiceNumber || header.invoice_number || header.invoiceNo || header.invoice_no || header.invoiceId || header.documentNumber || null,
    invoiceDate: header.invoiceDate || header.invoice_date || header.date || null,
    dueDate: header.dueDate || header.due_date || null,
    vendorName: header.vendorName || header.vendor_name || header.vendor || header.supplier || header.seller || header.shipperName || header.remitToCompanyName || null,
    customerName: header.customerName || header.customer_name || header.billTo || header.buyer || header.consigneeName || header.billToName || null,
    totalAmount: header.totalAmountDue || header.totalAmount || header.total_amount || header.total || header.amount || header.subtotalAmount || null,
    currency: header.currency || header.currencyCode || '$',
    paymentTerms: header.paymentTerms || header.payment_terms || null
  };
};

const getShipmentDetailsFields = (data) => {
  if (!data) return null;
  let ship = data.shipmentDetails || data.shipmentDetail || data.shipment || data.shippingDetails;
  if (Array.isArray(ship) && ship.length > 0) {
    ship = ship[0];
  }
  if (!ship || typeof ship !== 'object') return null;
  return {
    trackingNumber: ship.trackingNumber || ship.tracking_number || ship.tracking || ship.proNumber || ship.mawbHawb || ship.mblNumber || ship.hblNumber || null,
    carrier: ship.carrierName || ship.carrier || ship.carrierScacCode || ship.scac || null,
    shipDate: ship.pickupDate || ship.shipDate || ship.ship_date || ship.departureDate || ship.dispatchDepartureDate || null,
    deliveryDate: ship.deliveryArrivalDate || ship.deliveryDate || ship.delivery_date || ship.arrivalDate || null,
    origin: ship.originPortLocation || ship.origin || ship.shipperAddress || ship.originCity || ship.freightDispatchPlaceOfReceipt || null,
    destination: ship.destinationPortLocation || ship.destination || ship.consigneeAddress || ship.destCity || ship.freightFinalDeliveryPlaceOfDelivery || null
  };
};

const getLineItems = (data) => {
  if (!data) return [];
  const direct = data.chargeLineItems || data.lineItems || data.line_items || data.items || data.charges;
  if (Array.isArray(direct) && direct.length > 0) return direct;

  const ship = data.shipmentDetails || data.shipmentDetail || data.shipment;
  if (Array.isArray(ship)) {
    const all = [];
    ship.forEach(s => {
      if (s && Array.isArray(s.chargeLineItems)) {
        all.push(...s.chargeLineItems);
      }
    });
    if (all.length > 0) return all;
  } else if (ship && Array.isArray(ship.chargeLineItems)) {
    return ship.chargeLineItems;
  }
  return [];
};

export const InvoiceList = ({ invoiceGroups, selectedIndex, extractedData, processingStates, errorStates, onInvoiceClick }) => {
  return (
    <div className="invoice-selector-container">
      {invoiceGroups.length === 0 ? (
        <div style={{ color: 'var(--text-muted, #94a3b8)', fontSize: '13px' }}>No invoices detected.</div>
      ) : (
        invoiceGroups.map((group, idx) => {
          const targetIndex = group.invoiceIndex !== undefined ? Number(group.invoiceIndex) : idx;
          const isSelected = selectedIndex === targetIndex;
          const isError = Boolean(errorStates[targetIndex]) || (extractedData[targetIndex] && extractedData[targetIndex].status === 'Poor Image Quality') || (extractedData[targetIndex] && extractedData[targetIndex].status === 'Escalation Required');
          
          return (
            <div 
              key={targetIndex}
              className={`invoice-selector-tab ${isSelected ? 'selected' : ''} ${isError ? 'has-warning' : ''}`}
              onClick={() => onInvoiceClick(targetIndex, group)}
            >
              Invoice {targetIndex + 1}
              {isError && <span className="warning-icon">⚠</span>}
            </div>
          );
        })
      )}
    </div>
  );
};

export const PdfPageViewer = ({ pdfUrl, pageNumber = 1, zoomMode = 'fit', zoomLevel = 100, containerRef }) => {
  const canvasRef = useRef(null);
  const renderTaskRef = useRef(null);
  const loadingTaskRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pdfDoc, setPdfDoc] = useState(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setPdfDoc(null);

    if (loadingTaskRef.current) {
      try {
        loadingTaskRef.current.destroy();
      } catch (e) {}
    }

    const task = pdfjsLib.getDocument({
      url: pdfUrl,
      cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
      cMapPacked: true,
    });
    loadingTaskRef.current = task;

    task.promise
      .then((doc) => {
        if (active) {
          setPdfDoc(doc);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (active && err?.name !== 'RenderingCancelledException') {
          console.error('PDF loading error:', err);
          setError('Unable to load document preview');
          setLoading(false);
        }
      });

    return () => {
      active = false;
      if (loadingTaskRef.current) {
        try {
          loadingTaskRef.current.destroy();
        } catch (e) {}
      }
    };
  }, [pdfUrl]);

  const renderPage = useCallback(() => {
    if (!pdfDoc || !canvasRef.current || !containerRef?.current) return;

    const targetPageNum = Math.min(Math.max(1, pageNumber), pdfDoc.numPages);

    pdfDoc.getPage(targetPageNum).then((page) => {
      if (!canvasRef.current || !containerRef?.current) return;

      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch (e) {}
        renderTaskRef.current = null;
      }

      const container = containerRef.current;
      const padding = 24;
      const availWidth = Math.max(100, container.clientWidth - padding);
      const availHeight = Math.max(100, container.clientHeight - padding);

      const unscaledViewport = page.getViewport({ scale: 1.0 });
      const scaleX = availWidth / unscaledViewport.width;
      const scaleY = availHeight / unscaledViewport.height;
      const fitScale = Math.min(scaleX, scaleY);

      let finalScale = fitScale;
      if (zoomMode === 'manual') {
        finalScale = fitScale * (zoomLevel / 100);
      }

      const dpr = Math.max(2, window.devicePixelRatio || 1);
      const displayWidth = unscaledViewport.width * finalScale;
      const displayHeight = unscaledViewport.height * finalScale;

      const canvas = canvasRef.current;
      canvas.width = Math.floor(displayWidth * dpr);
      canvas.height = Math.floor(displayHeight * dpr);
      canvas.style.width = `${Math.floor(displayWidth)}px`;
      canvas.style.height = `${Math.floor(displayHeight)}px`;
      canvas.style.maxWidth = 'none'; // allow horizontal scrolling when zoomed
      canvas.style.maxHeight = 'none'; // scroll wrapper handles overflow; never clip the canvas
      canvas.style.objectFit = 'contain';
      canvas.style.display = 'block';
      canvas.style.margin = '0 auto';
      canvas.style.flexShrink = '0';

      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      const renderViewport = page.getViewport({ scale: finalScale * dpr });
      const renderTask = page.render({
        canvasContext: ctx,
        viewport: renderViewport,
      });
      renderTaskRef.current = renderTask;

      renderTask.promise
        .then(() => {
          renderTaskRef.current = null;
        })
        .catch((err) => {
          if (err?.name !== 'RenderingCancelledException') {
            console.error('PDF rendering error:', err);
          }
        });
    }).catch(err => console.error('getPage error:', err));
  }, [pdfDoc, pageNumber, zoomMode, zoomLevel, containerRef]);

  useEffect(() => {
    renderPage();
  }, [renderPage]);

  useEffect(() => {
    const el = containerRef?.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;

    let timer = null;
    const ro = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        renderPage();
      }, 50);
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      clearTimeout(timer);
    };
  }, [containerRef, renderPage]);

  if (loading) {
    return (
      <div className="pdf-viewer-status-box">
        <div style={{ fontSize: '24px' }}>🔄</div>
        <div style={{ fontSize: '13px', color: '#94a3b8' }}>Loading page...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="pdf-viewer-status-box" style={{ color: '#ef4444' }}>
        <div style={{ fontSize: '24px' }}>⚠️</div>
        <div style={{ fontSize: '13px' }}>{error}</div>
        <a href={pdfUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#60a5fa', textDecoration: 'underline', fontSize: '12px', marginTop: '6px' }}>
          Open PDF in new tab
        </a>
      </div>
    );
  }

  return (
    <div
      className="pdf-viewer-wrapper"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        width: '100%',
        height: '100%',
        maxHeight: '100%',
        overflowY: 'auto',
        overflowX: 'auto',
        boxSizing: 'border-box',
        padding: '16px',
      }}
    >
      <canvas ref={canvasRef} className="pdf-viewer-canvas" />
    </div>
  );
};

// ── MULTI-INVOICE DEDICATED PDF VIEWER ──────────────────────────────────────
// NOTE: This component is used EXCLUSIVELY inside MultiInvoiceWorkspace.
// Do NOT use for the single-invoice viewer (DocumentViewer uses PdfPageViewer above).
//
// Rendering rules (per product spec):
//  1. Viewport is built at fitScale — no DPR multiplication on the viewport itself.
//  2. Canvas width/height are set directly from viewport.width / viewport.height.
//  3. renderContext receives a clean identity transform [1, 0, 0, 1, 0, 0] so no
//     negative offsets or hardcoded restrictions can clip the top of the invoice.
export const MultiInvoicePageViewer = ({ pdfUrl, pageNumber = 1, zoomMode = 'fit', zoomLevel = 100, containerRef }) => {
  const canvasRef = useRef(null);
  const renderTaskRef = useRef(null);
  const loadingTaskRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pdfDoc, setPdfDoc] = useState(null);

  // ── Load document ──────────────────────────────────────────────────────────
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setPdfDoc(null);

    if (loadingTaskRef.current) {
      try { loadingTaskRef.current.destroy(); } catch (e) {}
    }

    const task = pdfjsLib.getDocument({
      url: pdfUrl,
      cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
      cMapPacked: true,
    });
    loadingTaskRef.current = task;

    task.promise
      .then((doc) => { if (active) { setPdfDoc(doc); setLoading(false); } })
      .catch((err) => {
        if (active && err?.name !== 'RenderingCancelledException') {
          console.error('[MultiInvoicePageViewer] PDF load error:', err);
          setError('Unable to load document preview');
          setLoading(false);
        }
      });

    return () => {
      active = false;
      if (loadingTaskRef.current) {
        try { loadingTaskRef.current.destroy(); } catch (e) {}
      }
    };
  }, [pdfUrl]);

  // ── Render page ───────────────────────────────────────────────────────────
  const renderPage = useCallback(() => {
    if (!pdfDoc || !canvasRef.current || !containerRef?.current) return;

    const targetPageNum = Math.min(Math.max(1, pageNumber), pdfDoc.numPages);

    pdfDoc.getPage(targetPageNum).then((page) => {
      if (!canvasRef.current || !containerRef?.current) return;

      // Cancel any in-flight render before starting a new one
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel(); } catch (e) {}
        renderTaskRef.current = null;
      }

      const container = containerRef.current;
      const padding = 24;
      const availWidth = Math.max(100, (container.clientWidth || 600) - padding);
      const availHeight = Math.max(100, (container.clientHeight || 700) - padding);

      const unscaledViewport = page.getViewport({ scale: 1.0 });
      const scaleX = availWidth / unscaledViewport.width;
      const scaleY = availHeight / unscaledViewport.height;
      const fitScale = Math.min(scaleX, scaleY);

      // Apply manual zoom on top of fit scale, if requested
      const finalScale = zoomMode === 'manual'
        ? fitScale * (zoomLevel / 100)
        : fitScale;

      // Use high DPR for ultra-sharp canvas backing store
      const dpr = Math.max(2.5, window.devicePixelRatio || 1);
      const viewport = page.getViewport({ scale: finalScale });

      const canvas = canvasRef.current;
      canvas.width  = Math.floor(viewport.width  * dpr);
      canvas.height = Math.floor(viewport.height * dpr);

      // CSS display size at CSS-pixel resolution
      canvas.style.width    = `${Math.floor(viewport.width)}px`;
      canvas.style.height   = `${Math.floor(viewport.height)}px`;
      canvas.style.maxWidth = 'none';
      canvas.style.maxHeight = 'none';
      canvas.style.display  = 'block';
      canvas.style.margin   = zoomMode === 'fit' ? 'auto' : '0 auto';
      canvas.style.flexShrink = '0';
      canvas.style.background = '#ffffff';
      canvas.style.boxShadow  = '0 8px 30px rgba(0,0,0,0.45)';
      canvas.style.borderRadius = '4px';

      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled  = true;
      ctx.imageSmoothingQuality  = 'high';

      const renderViewport = page.getViewport({ scale: finalScale * dpr });
      const renderTask = page.render({
        canvasContext: ctx,
        viewport:      renderViewport,
      });
      renderTaskRef.current = renderTask;

      renderTask.promise
        .then(() => { renderTaskRef.current = null; })
        .catch((err) => {
          if (err?.name !== 'RenderingCancelledException') {
            console.error('[MultiInvoicePageViewer] Render error:', err);
          }
        });
    }).catch((err) => console.error('[MultiInvoicePageViewer] getPage error:', err));
  }, [pdfDoc, pageNumber, zoomMode, zoomLevel, containerRef]);

  useEffect(() => { renderPage(); }, [renderPage]);

  // Re-render on container resize
  useEffect(() => {
    const el = containerRef?.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    let timer = null;
    const ro = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => { renderPage(); }, 50);
    });
    ro.observe(el);
    return () => { ro.disconnect(); clearTimeout(timer); };
  }, [containerRef, renderPage]);

  if (loading) {
    return (
      <div className="pdf-viewer-status-box">
        <div style={{ fontSize: '24px' }}>🔄</div>
        <div style={{ fontSize: '13px', color: '#94a3b8' }}>Loading page...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="pdf-viewer-status-box" style={{ color: '#ef4444' }}>
        <div style={{ fontSize: '24px' }}>⚠️</div>
        <div style={{ fontSize: '13px' }}>{error}</div>
        <a href={pdfUrl} target="_blank" rel="noopener noreferrer"
          style={{ color: '#60a5fa', textDecoration: 'underline', fontSize: '12px', marginTop: '6px' }}>
          Open PDF in new tab
        </a>
      </div>
    );
  }

  return (
    <div
      className="multi-invoice-pdf-wrapper"
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: zoomMode === 'fit' ? 'center' : 'flex-start',
        overflowY: 'auto',
        overflowX: 'auto',
        padding: '16px',
        boxSizing: 'border-box',
        width: '100%',
        height: '100%',
      }}
    >
      <canvas ref={canvasRef} />
    </div>
  );
};
// ── END MultiInvoicePageViewer ───────────────────────────────────────────────

export const DocumentViewer = ({ docId, selectedGroup }) => {
  const containerRef = useRef(null);
  const pageStart = selectedGroup?.pageStart || (selectedGroup?.pages ? selectedGroup.pages[0] : 1);
  return (
    <div className="multi-viewer-panel" style={{ flex: 1, padding: 0, border: 'none', background: 'transparent' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '600', color: 'var(--text-primary, #f8fafc)' }}>Original Document</h3>
          <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--text-muted, #94a3b8)' }}>{selectedGroup ? `Invoice Pages ${pageStart}${selectedGroup?.pageEnd !== pageStart ? `–${selectedGroup?.pageEnd}` : ''}` : 'Complete PDF'}</p>
        </div>
      </div>
      <div className="document-viewer-container" ref={containerRef} style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', width: '100%', height: '100%', overflowY: 'auto', boxSizing: 'border-box' }}>
        <PdfPageViewer
          pdfUrl={`${API}/documents/${docId}/file`}
          pageNumber={pageStart}
          zoomMode="fit"
          zoomLevel={100}
          containerRef={containerRef}
        />
      </div>
    </div>
  );
};

export const ExtractionProcessingPanel = ({ invoiceIndex, pageStart, pageEnd, isSingleInvoice = false }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [progress, setProgress] = useState(25);

  useEffect(() => {
    setCurrentStep(1);
    setProgress(25);

    const t1 = setTimeout(() => {
      setCurrentStep(2);
      setProgress(52);
    }, 1100);

    const t2 = setTimeout(() => {
      setCurrentStep(3);
      setProgress(82);
    }, 2600);

    const t3 = setTimeout(() => {
      setProgress(94);
    }, 5500);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [invoiceIndex]);

  const steps = isSingleInvoice ? [
    { id: 1, label: 'Document uploaded', detail: 'Document received & queued for AI extraction' },
    { id: 2, label: 'Reading invoice content', detail: 'Optical character recognition (OCR)' },
    { id: 3, label: 'Extracting invoice data', detail: 'Analyzing fields, headers & line items' },
    { id: 4, label: 'Preparing results', detail: 'Structuring JSON payload & schema validation' }
  ] : [
    { id: 1, label: 'Document received', detail: 'Page isolated & sent to AI engine' },
    { id: 2, label: 'Reading invoice content', detail: 'Optical character recognition (OCR)' },
    { id: 3, label: 'Extracting invoice data', detail: 'Analyzing fields, headers & line items' },
    { id: 4, label: 'Preparing results', detail: 'Structuring JSON payload & schema validation' }
  ];

  return (
    <div className="extraction-processing-card">
      <div className="processing-card-header">
        <div className="processing-badge">
          <span className="processing-spark-icon">✨</span>
          <span className="processing-badge-text">DOCUMENT AI</span>
        </div>
        <div className="processing-status-tag">
          <span className="processing-live-dot" />
          <span>Processing</span>
        </div>
      </div>

      <div className="processing-card-body">
        <div className="processing-title-section">
          <h3 className="processing-title">Extracting Invoice Data</h3>
          <p className="processing-subtitle">
            {isSingleInvoice
              ? 'AI is analyzing your invoice and preparing the extracted information.'
              : 'AI is analyzing your document and preparing the extracted information.'}
          </p>
        </div>

        <div className="processing-bar-wrapper">
          <div className="processing-bar-background">
            <div 
              className="processing-bar-fill"
              style={{ width: `${progress}%` }}
            >
              <div className="processing-bar-shimmer" />
            </div>
          </div>
          <div className="processing-bar-info">
            <span>{isSingleInvoice ? 'Single Document Extraction' : `Invoice #${invoiceIndex !== undefined ? invoiceIndex + 1 : '1'} (Pages ${pageStart || 1}${pageEnd && pageEnd !== pageStart ? `–${pageEnd}` : ''})`}</span>
            <span className="processing-percent-text">{progress}%</span>
          </div>
        </div>

        <div className="processing-steps-container">
          {steps.map((step) => {
            const isDone = step.id < currentStep;
            const isActive = step.id === currentStep;
            const isPending = step.id > currentStep;

            return (
              <div 
                key={step.id}
                className={`proc-step-row ${isDone ? 'is-done' : ''} ${isActive ? 'is-active' : ''} ${isPending ? 'is-pending' : ''}`}
              >
                <div className="proc-step-indicator">
                  {isDone && (
                    <span className="proc-icon proc-icon-check">✓</span>
                  )}
                  {isActive && (
                    <span className="proc-icon proc-icon-dot">
                      <span className="proc-dot-pulse" />
                      ●
                    </span>
                  )}
                  {isPending && (
                    <span className="proc-icon proc-icon-circle">○</span>
                  )}
                </div>

                <div className="proc-step-text">
                  <div className="proc-step-title">{step.label}</div>
                  <div className="proc-step-desc">{step.detail}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export const InvoiceCard = ({ idx, group, data, isLoading, errorMsg, isSelected, onRetry, onSave }) => {
  const [draft, setDraft] = useState(data || {});
  const [selectedSection, setSelectedSection] = useState('all');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveErr, setSaveErr] = useState('');
  const [showEscalationModal, setShowEscalationModal] = useState(false);

  useEffect(() => {
    setDraft(data || {});
  }, [data]);

  if (isLoading) {
    return (
      <ExtractionProcessingPanel 
        invoiceIndex={idx}
        pageStart={group?.pageStart || (group?.pages ? group.pages[0] : 1)}
        pageEnd={group?.pageEnd || (group?.pages ? group.pages[1] : 1)}
      />
    );
  }

  const updatePath = (path, value) => {
    setDraft((current) => {
      const next = JSON.parse(JSON.stringify(current || {}));
      let target = next;
      path.slice(0, -1).forEach((part) => { target = target[part]; });
      target[path[path.length - 1]] = value;
      return next;
    });
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
              {renderEditableNode(item, [...path, index], '', options)}
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
          onChange={(event) => updatePath(path, event.target.value)}
        />
      </div>
    );
  };

  const normalizeToArray = (val) => {
    if (Array.isArray(val)) return val;
    if (val && typeof val === 'object') return [val];
    return [];
  };

  const possibleShipmentKeys = ['shipmentDetails', 'shipmentDetail', 'shipments', 'shipment'];
  let shipmentKey = possibleShipmentKeys.find(k => draft && Array.isArray(draft[k]) && draft[k].length > 0);
  if (!shipmentKey) shipmentKey = possibleShipmentKeys.find(k => draft && draft[k] && typeof draft[k] === 'object' && Object.keys(draft[k]).length > 0);
  if (!shipmentKey) shipmentKey = possibleShipmentKeys.find(k => draft && draft[k] != null);
  
  const rawShipmentData = shipmentKey ? draft[shipmentKey] : undefined;
  const shipmentRecords = normalizeToArray(rawShipmentData);

  const chargeRecords = [];
  shipmentRecords.forEach((shipment, shipmentIdx) => {
    let nestedChargeKey = 'chargeLineItems';
    if (shipment && !shipment.chargeLineItems && shipment.chargeLineItem) nestedChargeKey = 'chargeLineItem';
    const nestedCharges = normalizeToArray(shipment?.[nestedChargeKey]);
    nestedCharges.forEach((charge, chargeIdx) => {
      chargeRecords.push({
        charge,
        path: [shipmentKey, shipmentIdx, nestedChargeKey, chargeIdx],
        label: `Shipment ${shipmentIdx + 1} Charge ${chargeIdx + 1}`
      });
    });
  });
  
  let topChargeKey = 'chargeLineItems';
  if (draft && Array.isArray(draft.chargeLineItem) && draft.chargeLineItem.length > 0 && (!draft.chargeLineItems || draft.chargeLineItems.length === 0)) {
    topChargeKey = 'chargeLineItem';
  }
  const topLevelItems = normalizeToArray(draft?.[topChargeKey] || draft?.chargeLineItems || draft?.chargeLineItem);
  topLevelItems.forEach((item, idx) => {
    chargeRecords.push({
      charge: item,
      path: [topChargeKey, idx],
      label: `Charge ${idx + 1}`
    });
  });

  const knownKeys = ['invoiceHeader', 'shipmentDetails', 'shipmentDetail', 'shipments', 'shipment', 'chargeLineItems', 'chargeLineItem', 'status', 'poorImageQuality', 'error', 'invoiceIndex', 'documentId'];
  const headerObj = draft.invoiceHeader && typeof draft.invoiceHeader === 'object' && !Array.isArray(draft.invoiceHeader) ? draft.invoiceHeader : {};
  const extraTopKeys = Object.keys(draft || {}).filter(k => !knownKeys.includes(k));
  const extraTopObj = {};
  extraTopKeys.forEach(k => {
    if (typeof draft[k] !== 'object' || draft[k] === null) extraTopObj[k] = draft[k];
  });

  const sectionDefinitions = [
    { id: 'all', label: 'All Fields' },
    { id: 'header', label: 'Invoice Header' },
    { id: 'shipment', label: 'Shipments' },
    { id: 'charges', label: 'Charge Line Items' },
  ];
  const activeSection = sectionDefinitions.find((section) => section.id === selectedSection) || sectionDefinitions[0];
  const isEmpty = Object.keys(draft).length === 0;

  const handleSave = async () => {
    if (!onSave) return;
    setSaving(true);
    setSaveErr('');
    setSaveSuccess(false);
    try {
      await onSave(idx, draft);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err) {
      setSaveErr(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  // NEW REQUIREMENTS: STATUS DISPLAY
  const status = draft.status || 'Ready for Review';
  const hasPoorQuality = draft.status === 'Poor Image Quality' || draft.poorImageQuality;

  return (
    <div 
      id={`invoice-card-${idx}`}
      className={`card editor-panel ${isSelected ? 'selected-card' : ''} ${errorMsg || hasPoorQuality ? 'error' : ''}`}
      data-invoice-index={idx}
      style={{ margin: 0 }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.4rem' }}>
        <h3 className="section-title" style={{ color: '#fff', letterSpacing: '0.1em', margin: 0 }}>EXTRACTED FIELDS</h3>
        
        {/* Status indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span className={`status-pill ${hasPoorQuality ? 'warning-strong' : errorMsg ? 'danger' : 'success'}`}>
                {hasPoorQuality ? '📸 Poor Image Quality' : status}
            </span>
        </div>

        {onSave && (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {saveSuccess && <span style={{ color: 'var(--success, #1FC991)', fontSize: '0.8rem', fontWeight: 600 }}>✓ Saved</span>}
            {saveErr && <span style={{ color: 'var(--danger, #EA6A6A)', fontSize: '0.8rem' }}>{saveErr}</span>}
            <button type="button" className="primary-btn" onClick={handleSave} disabled={saving || isEmpty} style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        )}
        {hasPoorQuality && (
          <button
            type="button"
            id={`escalate-btn-${idx}`}
            className="escalate-btn"
            onClick={() => setShowEscalationModal(true)}
            title="Open escalation dialog for this flagged invoice"
          >
            🚨 Escalate
          </button>
        )}
      </div>

      {hasPoorQuality && (
          <div className="error-message" style={{ marginBottom: '0.5rem', background: 'rgba(234, 106, 106, 0.2)', padding: '8px', borderRadius: '4px' }}>
            <p style={{ margin: 0, fontSize: '0.8rem' }}><strong>⚠ Poor Image Quality</strong> - The source image is unclear and requires manual review.</p>
          </div>
      )}

      {errorMsg && !isLoading && !hasPoorQuality && (
        <div className="error-message" style={{ marginBottom: '0.5rem' }}>
          <p style={{ margin: 0, fontSize: '0.8rem' }}>Failed to process invoice: {errorMsg}</p>
          <button className="retry-button" onClick={onRetry}>Retry</button>
        </div>
      )}

      {!isEmpty && (
        <>
          <div className="invoice-section-tabs" role="tablist" aria-label="Extracted invoice sections">
            {sectionDefinitions.map((section) => (
              <button 
                key={section.id} 
                type="button" 
                role="tab" 
                aria-selected={activeSection.id === section.id} 
                className={activeSection.id === section.id ? 'primary-btn' : 'secondary-btn'} 
                onClick={() => setSelectedSection(section.id)}
                style={{ padding: '4px 10px', fontSize: '0.75rem' }}
              >
                {section.label}
              </button>
            ))}
          </div>

          <div className="editor-scroll-content">
            <div className="invoice-sections" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {/* 1. INVOICE HEADER */}
              {(selectedSection === 'all' || selectedSection === 'header') && (
                <div className="section-block" style={{ margin: 0 }}>
                  <div className="section-title" style={{ fontSize: '0.72rem', color: 'var(--primary, #6366f1)', marginBottom: '6px' }}>📄 INVOICE HEADER</div>
                  {Object.keys(headerObj).length > 0 ? (
                    renderEditableNode(headerObj, ['invoiceHeader'], '')
                  ) : Object.keys(extraTopObj).length > 0 ? (
                    renderEditableNode(extraTopObj, [], '')
                  ) : (
                    <div className="subtle-copy">No header fields found</div>
                  )}
                </div>
              )}

              {/* 2. GENERAL / EXTRA FIELDS */}
              {(selectedSection === 'all' || selectedSection === 'header') && Object.keys(headerObj).length > 0 && Object.keys(extraTopObj).length > 0 && (
                <div className="section-block" style={{ margin: 0 }}>
                  <div className="section-title" style={{ fontSize: '0.72rem', color: 'var(--primary, #6366f1)', marginBottom: '6px' }}>⚙️ GENERAL DETAILS</div>
                  {renderEditableNode(extraTopObj, [], '')}
                </div>
              )}

              {/* 3. SHIPMENT DETAILS */}
              {(selectedSection === 'all' || selectedSection === 'shipment') && (
                <div className="section-block" style={{ margin: 0 }}>
                  <div className="section-title" style={{ fontSize: '0.72rem', color: 'var(--primary, #6366f1)', marginBottom: '6px' }}>
                    🚚 SHIPMENT DETAILS {shipmentRecords.length > 0 ? `(${shipmentRecords.length})` : ''}
                  </div>
                  {shipmentRecords.length > 0 ? (
                    renderEditableNode(shipmentRecords, [shipmentKey || 'shipmentDetails'], '', { excludeKeys: ['chargeLineItems', 'chargeLineItem'] })
                  ) : (
                    <div className="subtle-copy">No shipment records found</div>
                  )}
                </div>
              )}

              {/* 4. CHARGE LINE ITEMS */}
              {(selectedSection === 'all' || selectedSection === 'charges') && (
                <div className="section-block" style={{ margin: 0 }}>
                  <div className="section-title" style={{ fontSize: '0.72rem', color: 'var(--primary, #6366f1)', marginBottom: '6px' }}>
                    💳 CHARGE LINE ITEMS {chargeRecords.length > 0 ? `(${chargeRecords.length})` : ''}
                  </div>
                  {chargeRecords.length > 0 ? (
                    chargeRecords.map((record) => (
                      <div className="nested-record" key={record.path.join('.')} style={{ marginBottom: '4px' }}>
                        <div className="field-label" style={{ color: 'var(--primary, #6366f1)', fontSize: '0.68rem', marginBottom: '2px' }}>{record.label}</div>
                        {renderEditableNode(record.charge, record.path, '')}
                      </div>
                    ))
                  ) : (
                    <div className="subtle-copy">No line items found</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {isEmpty && !errorMsg && !hasPoorQuality && (
        <div className="subtle-copy" style={{ padding: '1rem' }}>No extraction result found for this invoice.</div>
      )}

      {showEscalationModal && (
        <EscalationModal
          docId={draft.documentId || ''}
          invoiceId={draft.invoiceId || String(idx)}
          invoiceLabel={`Invoice ${idx + 1}`}
          onClose={() => setShowEscalationModal(false)}
          onSuccess={() => {
            setShowEscalationModal(false);
          }}
        />
      )}
    </div>
  );
};

export const ExtractedDataPanel = ({ selectedIndex, invoiceGroups, extractedData, processingStates, errorStates, onRetry }) => {
  const hasData = selectedIndex !== null && extractedData[selectedIndex];
  const isLoading = selectedIndex !== null && Boolean(processingStates[selectedIndex]);
  const errorMsg = selectedIndex !== null ? errorStates[selectedIndex] : null;
  const selectedGroup = selectedIndex !== null ? invoiceGroups[selectedIndex] : null;

  return (
    <div className="multi-extracted-panel">
      {(selectedIndex === null || (!hasData && !isLoading && !errorMsg)) && (
        <div className="extracted-data-empty">
          <div className="empty-icon">📋</div>
          <h3>Select an invoice to extract its data.</h3>
        </div>
      )}

      {selectedIndex !== null && isLoading && (
        <ExtractionProcessingPanel 
          invoiceIndex={selectedIndex}
          pageStart={selectedGroup?.pageStart || (selectedGroup?.pages ? selectedGroup.pages[0] : 1)}
          pageEnd={selectedGroup?.pageEnd || (selectedGroup?.pages ? selectedGroup.pages[1] : 1)}
        />
      )}

      {selectedIndex !== null && !isLoading && (hasData || errorMsg) && (
        <InvoiceCard
          idx={selectedIndex}
          group={selectedGroup}
          data={extractedData[selectedIndex]}
          isLoading={false}
          errorMsg={errorMsg}
          isSelected={true}
          onRetry={() => onRetry(selectedIndex, selectedGroup)}
        />
      )}
    </div>
  );
};


export const MultiInvoiceWorkspace = ({ docId: propDocId, docIds: propDocIds }) => {
  const path = window.location.pathname;
  const searchParams = new URLSearchParams(window.location.search);
  // Support batch mode: ids= query param takes precedence over path-based docId
  const idsParam = searchParams.get('ids');
  const docIds = propDocIds || (idsParam ? idsParam.split(',').filter(Boolean) : null);
  const primaryDocId = propDocId || (docIds ? docIds[0] : null) || path.split('/')[2];
  const isBatchMode = docIds && docIds.length > 1;

  const [doc, setDoc] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [selectedInvoiceIndex, setSelectedInvoiceIndex] = useState(0);
  const [drafts, setDrafts] = useState({});
  const [activeTab, setActiveTab] = useState('header');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [showDiscardModal, setShowDiscardModal] = useState(false);
  const [showEscalationModal, setShowEscalationModal] = useState(false);
  const [pageOffset, setPageOffset] = useState(0);
  const [zoomMode, setZoomMode] = useState('fit'); // 'fit' | 'manual'
  const [zoomLevel, setZoomLevel] = useState(100);
  const [viewerSize, setViewerSize] = useState({ width: 0, height: 0 });
  const viewerBodyRef = useRef(null);
  const extractionInFlightRef = useRef(new Set());
  // Batch review filters
  const [filterDoc, setFilterDoc] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const patchInvoiceAt = (index, patch) => {
    setInvoices((prev) => prev.map((inv, idx) => (idx === index ? { ...inv, ...patch } : inv)));
  };

  const refreshInvoiceFromServer = async (targetDocId, invoiceKey, index) => {
    try {
      const invRes = await fetch(`${API}/documents/${targetDocId}/invoices?refresh=${Date.now()}`);
      if (!invRes.ok) return null;
      const invData = await invRes.json();
      const list = Array.isArray(invData.invoices) ? invData.invoices : [];
      const match = list.find((inv) => (inv.id || inv.invoiceId) === invoiceKey)
        || list.find((inv) => Number(inv.invoiceIndex) === Number(index))
        || null;
      if (!match) return null;
      setInvoices((prev) => prev.map((inv, idx) => {
        if (idx !== index) return inv;
        return {
          ...inv,
          ...match,
          extractionUi: invoiceHasRealExtraction(match) ? EXTRACTION_UI.EXTRACTED : (inv.extractionUi || EXTRACTION_UI.IDLE),
          extractionError: invoiceHasRealExtraction(match) ? null : inv.extractionError,
        };
      }));
      if (invoiceHasRealExtraction(match)) {
        setDrafts((prev) => ({
          ...prev,
          [index]: extractRealInvoiceObject(match.extractedData || match.canonicalJson) || {},
        }));
      }
      return match;
    } catch {
      return null;
    }
  };

  const runInvoiceExtraction = async (index, { force = false } = {}) => {
    const invoice = invoices[index];
    if (!invoice) return;

    const invoiceKey = invoice.id || invoice.invoiceId || `${invoice.documentId || primaryDocId}-${index}`;
    const ui = normalizeInvoiceExtractionUi(invoice);

    if (!force) {
      if (ui === EXTRACTION_UI.EXTRACTED || invoiceHasRealExtraction(invoice)) return;
      if (ui === EXTRACTION_UI.EXTRACTING || ui === EXTRACTION_UI.PREPARING) return;
      if (extractionInFlightRef.current.has(invoiceKey)) return;
    }

    if (extractionInFlightRef.current.has(invoiceKey) && !force) return;
    extractionInFlightRef.current.add(invoiceKey);

    patchInvoiceAt(index, {
      extractionUi: EXTRACTION_UI.PREPARING,
      extractionError: null,
      status: 'PREPARING',
      extractionStatus: 'PREPARING',
    });

    // Brief preparing state for professional UX, then extracting
    await new Promise((r) => setTimeout(r, 350));
    patchInvoiceAt(index, {
      extractionUi: EXTRACTION_UI.EXTRACTING,
      status: 'EXTRACTING',
      extractionStatus: 'EXTRACTING',
    });

    try {
      const result = await triggerInvoiceExtraction({
        ...invoice,
        documentId: invoice.documentId || primaryDocId,
      });

      const extractedPayload = result?.extractedData;
      const realObj = extractRealInvoiceObject(extractedPayload) || extractRealInvoiceObject(extractedPayload?.extractedData);
      if (realObj) {
        patchInvoiceAt(index, {
          extractionUi: EXTRACTION_UI.EXTRACTED,
          status: 'EXTRACTED',
          extractionStatus: 'EXTRACTED',
          extractedData: realObj,
          canonicalJson: realObj,
          extractionError: null,
        });
        setDrafts((prev) => ({ ...prev, [index]: realObj }));
      } else {
        // Webhook accepted but structured data may arrive via callback — poll briefly
        patchInvoiceAt(index, {
          extractionUi: EXTRACTION_UI.EXTRACTING,
          status: 'EXTRACTING',
          extractionStatus: 'EXTRACTING',
        });
        let found = null;
        for (let i = 0; i < 20; i += 1) {
          await new Promise((r) => setTimeout(r, 2000));
          found = await refreshInvoiceFromServer(invoice.documentId || primaryDocId, invoiceKey, index);
          if (found && invoiceHasRealExtraction(found)) break;
        }
        if (!found || !invoiceHasRealExtraction(found)) {
          patchInvoiceAt(index, {
            extractionUi: EXTRACTION_UI.FAILED,
            status: 'FAILED',
            extractionStatus: 'FAILED',
            extractionError: 'We couldn\'t extract the data from this invoice. Please try again.',
          });
        }
      }
    } catch (err) {
      console.error('[Invoice Extraction] Failed:', {
        invoiceId: invoiceKey,
        documentId: invoice.documentId || primaryDocId,
        pageStart: invoice.pageStart,
        pageEnd: invoice.pageEnd,
        status: err?.status,
        message: err?.message,
      });
      patchInvoiceAt(index, {
        extractionUi: EXTRACTION_UI.FAILED,
        status: 'FAILED',
        extractionStatus: 'FAILED',
        extractionError: 'We couldn\'t extract the data from this invoice. Please try again.',
      });
    } finally {
      extractionInFlightRef.current.delete(invoiceKey);
    }
  };

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        let invoiceList = [];
        let foundDoc = null;

        if (isBatchMode) {
          const idsQuery = docIds.join(',');
          const [docsRes, invRes] = await Promise.all([
            fetch(`${API}/documents?refresh=${Date.now()}`),
            fetch(`${API}/documents/${primaryDocId}/invoices?ids=${encodeURIComponent(idsQuery)}&refresh=${Date.now()}`)
          ]);
          const docsData = await docsRes.json();
          const invData = await invRes.json();
          foundDoc = (docsData.documents || []).find(d => d.id === primaryDocId) || null;
          invoiceList = Array.isArray(invData.invoices) ? invData.invoices : [];
        } else {
          const docId = primaryDocId;
          const [docRes, invRes] = await Promise.all([
            fetch(`${API}/documents?refresh=${Date.now()}`),
            fetch(`${API}/documents/${docId}/invoices?refresh=${Date.now()}`)
          ]);
          const docData = await docRes.json();
          const invData = await invRes.json();
          foundDoc = (docData.documents || []).find(d => d.id === docId) || null;
          invoiceList = Array.isArray(invData.invoices) ? invData.invoices : [];

          if (invoiceList.length === 0) {
            try {
              const detectRes = await fetch(`${API}/documents/${docId}/detect-invoices`);
              const detectData = await detectRes.json();
              if (detectData.success && Array.isArray(detectData.invoiceGroups)) {
                invoiceList = detectData.invoiceGroups.map((grp, idx) => ({
                  id: `${docId}-invoice-${idx + 1}`,
                  invoiceId: `${docId}-invoice-${idx + 1}`,
                  documentId: docId,
                  sourceFileName: foundDoc?.fileName || docId,
                  fileName: foundDoc?.fileName || docId,
                  invoiceIndex: grp.invoiceIndex !== undefined ? grp.invoiceIndex : idx,
                  pageStart: grp.pageStart || 1,
                  pageEnd: grp.pageEnd || grp.pageStart || 1,
                  status: 'Not Extracted',
                  extractionStatus: 'idle',
                  extractionUi: EXTRACTION_UI.IDLE,
                  overallConfidence: null,
                  extractedData: null
                }));
              }
            } catch (e) {
              console.warn('Invoice detection fallback error:', e);
            }
          }

          if (invoiceList.length === 0) {
            invoiceList = [{
              id: `${docId}-invoice-1`,
              invoiceId: `${docId}-invoice-1`,
              documentId: docId,
              sourceFileName: foundDoc?.fileName || docId,
              fileName: foundDoc?.fileName || docId,
              invoiceIndex: 0,
              pageStart: 1,
              pageEnd: 1,
              status: 'Not Extracted',
              extractionStatus: 'idle',
              extractionUi: EXTRACTION_UI.IDLE,
              overallConfidence: null,
              extractedData: null
            }];
          }
        }

        if (active) {
          const normalized = invoiceList.map((inv, idx) => ({
            ...inv,
            id: inv.id || inv.invoiceId || `${inv.documentId || primaryDocId}-invoice-${idx + 1}`,
            invoiceId: inv.invoiceId || inv.id || `${inv.documentId || primaryDocId}-invoice-${idx + 1}`,
            documentId: inv.documentId || primaryDocId,
            pageStart: inv.pageStart || 1,
            pageEnd: inv.pageEnd || inv.pageStart || 1,
            extractionUi: invoiceHasRealExtraction(inv)
              ? EXTRACTION_UI.EXTRACTED
              : (['FAILED', 'EXTRACTION_FAILED'].includes(String(inv.status || '').toUpperCase())
                ? EXTRACTION_UI.FAILED
                : EXTRACTION_UI.IDLE),
            extractionError: null,
          }));
          setDoc(foundDoc);
          setInvoices(normalized);

          const params = new URLSearchParams(window.location.search);
          const initialIndex = params.has('invoiceIndex') ? parseInt(params.get('invoiceIndex'), 10) : 0;
          const validIndex = (!isNaN(initialIndex) && initialIndex >= 0 && initialIndex < normalized.length) ? initialIndex : 0;
          setSelectedInvoiceIndex(validIndex);

          const initialDrafts = {};
          normalized.forEach((inv, idx) => {
            const realObj = extractRealInvoiceObject(inv.extractedData || inv.canonicalJson) || {};
            initialDrafts[idx] = realObj;
          });
          setDrafts(initialDrafts);
        }
      } catch (err) {
        console.error('Failed loading multi invoice workspace:', err);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [primaryDocId]);

  useEffect(() => {
    setPageOffset(0);
    setZoomMode('fit');
    setZoomLevel(100);
    setSaveSuccess(false);
    setSaveError('');
  }, [selectedInvoiceIndex]);

  // Keep fit-to-page viewer sized to available panel area
  useEffect(() => {
    const el = viewerBodyRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setViewerSize({ width: Math.floor(width), height: Math.floor(height) });
    });
    ro.observe(el);
    const rect = el.getBoundingClientRect();
    setViewerSize({ width: Math.floor(rect.width), height: Math.floor(rect.height) });
    return () => ro.disconnect();
  }, [loading, selectedInvoiceIndex]);

  const selectedInvoice = invoices[selectedInvoiceIndex] || null;
  const currentDraft = drafts[selectedInvoiceIndex] || {};

  const pageStart = selectedInvoice?.pageStart || 1;
  const pageEnd = selectedInvoice?.pageEnd || pageStart;
  const invoicePagesTotal = Math.max(1, pageEnd - pageStart + 1);
  const relativePage = Math.min(invoicePagesTotal, Math.max(1, pageOffset + 1));
  const currentPageNumber = pageStart + relativePage - 1;

  const updateDraftPath = (parts, value) => {
    setDrafts((prev) => {
      const currentInvoiceDraft = JSON.parse(JSON.stringify(prev[selectedInvoiceIndex] || {}));
      let target = currentInvoiceDraft;
      parts.slice(0, -1).forEach((part) => {
        if (!target[part]) target[part] = {};
        target = target[part];
      });
      target[parts[parts.length - 1]] = value;
      return { ...prev, [selectedInvoiceIndex]: currentInvoiceDraft };
    });
  };

  const handleSaveSelectedInvoice = async () => {
    if (!selectedInvoice) return;
    setSaving(true);
    setSaveError('');
    setSaveSuccess(false);
    try {
      const invoiceId = selectedInvoice.id || selectedInvoice.invoiceId;
      // Use the invoice's own documentId for data isolation (critical for multi-PDF batches)
      const saveDocId = selectedInvoice.documentId || primaryDocId;
      const res = await fetch(`${API}/documents/${saveDocId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          docId: saveDocId,
          invoiceId,
          invoiceIndex: selectedInvoice.invoiceIndex ?? selectedInvoiceIndex,
          editedData: currentDraft,
          editedExtractedData: currentDraft
        })
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to save invoice changes');
      
      setSaveSuccess(true);
      setInvoices((prev) => prev.map((inv, idx) => idx === selectedInvoiceIndex ? { ...inv, status: 'APPROVED' } : inv));
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setSaveError(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDiscard = () => {
    if (!selectedInvoice) return;
    const originalExtracted = extractRealInvoiceObject(selectedInvoice.extractedData || selectedInvoice.canonicalJson) || {};
    setDrafts((prev) => ({ ...prev, [selectedInvoiceIndex]: originalExtracted }));
    setShowDiscardModal(false);
  };

  if (loading) {
    return (
      <main className="emir-page">
        <div className="emir-empty-box">
          <div className="emir-empty-icon">🔄</div>
          <div className="emir-empty-text">Loading multi-invoice review workspace...</div>
        </div>
      </main>
    );
  }

  // ── FILTER LOGIC ─────────────────────────────────────────────────────────
  const uniqueDocNames = [...new Set(invoices.map(inv => inv.sourceFileName || inv.fileName || inv.documentId || primaryDocId).filter(Boolean))];
  const filteredInvoices = invoices.filter((inv, idx) => {
    const srcName = inv.sourceFileName || inv.fileName || inv.documentId || primaryDocId;
    const status = inv.status || inv.extractionStatus || '';
    const isPoor = inv.poorImageQuality || status === 'POOR_IMAGE_QUALITY' || status === 'Poor Image Quality';
    if (filterDoc !== 'all' && srcName !== filterDoc) return false;
    
    if (filterStatus === 'ready') {
      const ui = normalizeInvoiceExtractionUi(inv);
      if (isPoor || (ui !== EXTRACTION_UI.EXTRACTED && !['EXTRACTED', 'IN_REVIEW', 'APPROVED', 'Ready for Review'].includes(status))) return false;
    } else if (filterStatus === 'review') {
      if (isPoor || (status !== 'NEEDS_REVIEW' && status !== 'Needs Review')) return false;
    } else if (filterStatus === 'poor') {
      if (!isPoor) return false;
    } else if (filterStatus === 'approved') {
      if (status !== 'APPROVED' && status !== 'Approved') return false;
    } else if (filterStatus === 'failed') {
      const ui = normalizeInvoiceExtractionUi(inv);
      if (status !== 'FAILED' && ui !== EXTRACTION_UI.FAILED) return false;
    }
    
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const invNum = String(inv.invoiceNumber || '').toLowerCase();
      const fName = String(srcName || '').toLowerCase();
      if (!invNum.includes(q) && !fName.includes(q)) return false;
    }
    return true;
  });
  // Map filtered back to global indices for selection
  const filteredWithIndex = filteredInvoices.map(inv => ({ inv, globalIdx: invoices.indexOf(inv) }));

  const headerObj = currentDraft.invoiceHeader || currentDraft.header || currentDraft || {};
  const hasExtractedData = invoiceHasRealExtraction(selectedInvoice) || Boolean(extractRealInvoiceObject(currentDraft));
  const rawInvNum = hasExtractedData
    ? (headerObj.invoiceNumber || headerObj.invoice_number || currentDraft.invoiceNumber || selectedInvoice?.invoiceNumber)
    : null;
  const extractedInvNum = rawInvNum ? String(rawInvNum) : 'Not extracted';
  
  const hasConfidence = hasExtractedData && selectedInvoice?.overallConfidence != null;
  const confidencePercent = hasConfidence ? Math.round(selectedInvoice.overallConfidence * 100) : null;

  const selectedExtractionUi = normalizeInvoiceExtractionUi(selectedInvoice);
  const isPreparing = selectedExtractionUi === EXTRACTION_UI.PREPARING;
  const isExtracting = selectedExtractionUi === EXTRACTION_UI.EXTRACTING;
  const isExtractionFailed = selectedExtractionUi === EXTRACTION_UI.FAILED;
  const isWaitingForExtraction = isPreparing || isExtracting || (selectedExtractionUi === EXTRACTION_UI.IDLE && !hasExtractedData);
  const invoiceStatusLabel = humanInvoiceStatus(selectedInvoice, selectedInvoiceIndex);
  const selectedInvoiceLabel = invoiceDisplayLabel(selectedInvoice, selectedInvoiceIndex);
  const isPoorQuality = selectedInvoice?.poorImageQuality || selectedInvoice?.status === 'Poor Image Quality' || selectedInvoice?.status === 'POOR_IMAGE_QUALITY';
  // Use selected invoice's own documentId for PDF preview
  const activeDocId = selectedInvoice?.documentId || primaryDocId;

  const invoiceInfoFields = [
    { label: 'Invoice Number', key: 'invoiceNumber', value: headerObj.invoiceNumber || currentDraft.invoiceNumber },
    { label: 'Invoice Date', key: 'invoiceDate', value: headerObj.invoiceDate || currentDraft.invoiceDate },
    { label: 'Due Date', key: 'dueDate', value: headerObj.dueDate || currentDraft.dueDate },
    { label: 'Payment Terms', key: 'paymentTerms', value: headerObj.paymentTerms || currentDraft.paymentTerms },
    { label: 'PO / Ref Number', key: 'poNumber', value: headerObj.poNumber || currentDraft.poNumber || headerObj.purchaseOrderNumber }
  ];

  const carrierInfoFields = [
    { label: 'Carrier / Vendor Name', key: 'vendorName', value: headerObj.vendorName || currentDraft.vendorName || headerObj.carrierName },
    { label: 'SCAC Code', key: 'carrierScacCode', value: headerObj.carrierScacCode || currentDraft.scac || headerObj.scac },
    { label: 'Transport Mode', key: 'mode', value: headerObj.mode || currentDraft.transportMode },
    { label: 'Service Level', key: 'serviceLevel', value: headerObj.serviceLevel || currentDraft.serviceLevel }
  ];

  const billingInfoFields = [
    { label: 'Customer / Bill To Name', key: 'customerName', value: headerObj.customerName || currentDraft.customerName || headerObj.billTo },
    { label: 'Account Number', key: 'accountNumber', value: headerObj.accountNumber || currentDraft.accountNumber },
    { label: 'Billing Address', key: 'billToAddress', value: headerObj.billToAddress || currentDraft.billToAddress }
  ];

  const financialInfoFields = [
    { label: 'Subtotal Amount', key: 'subtotalAmount', value: headerObj.subtotalAmount || currentDraft.subtotalAmount },
    { label: 'Tax Amount', key: 'taxAmount', value: headerObj.taxAmount || currentDraft.taxAmount },
    { label: 'Total Amount Due', key: 'totalAmount', value: headerObj.totalAmount || headerObj.totalAmountDue || currentDraft.totalAmount },
    { label: 'Currency', key: 'currency', value: headerObj.currency || currentDraft.currency || '$' }
  ];

  const paymentInfoFields = [
    { label: 'Remit To Name', key: 'remitToCompanyName', value: headerObj.remitToCompanyName || currentDraft.remitToCompanyName || headerObj.remitTo },
    { label: 'Remit Address', key: 'remitToAddress', value: headerObj.remitToAddress || currentDraft.remitToAddress },
    { label: 'Payment Method / Bank', key: 'paymentMethod', value: headerObj.paymentMethod || currentDraft.paymentMethod }
  ];

  let shipmentData = currentDraft.shipmentDetails || currentDraft.shipmentDetail || currentDraft.shipments || currentDraft.shipment;
  if (!Array.isArray(shipmentData)) {
    shipmentData = shipmentData && typeof shipmentData === 'object' ? [shipmentData] : [];
  }

  let lineItemsData = currentDraft.chargeLineItems || currentDraft.lineItems || currentDraft.items || currentDraft.charges;
  if (!Array.isArray(lineItemsData)) {
    lineItemsData = lineItemsData && typeof lineItemsData === 'object' ? [lineItemsData] : [];
  }
  if (lineItemsData.length === 0 && shipmentData.length > 0) {
    lineItemsData = [...lineItemsData];
    shipmentData.forEach(s => {
      if (s && Array.isArray(s.chargeLineItems)) lineItemsData.push(...s.chargeLineItems);
    });
  }

  const relativePageLabel = relativePage;
  // Isolated invoice pages only — never the full multi-invoice document
  const pdfSourceUrl = `${API}/documents/${activeDocId}/page-range?start=${pageStart}&end=${pageEnd}`;
  // Append #view=FitH so the browser native/PDF.js viewer initializes in Fit Height mode
  const pdfIframeSrc = `${pdfSourceUrl}#page=${relativePage}&view=FitH&zoom=page-fit`;
  const fitZoomPercent = zoomMode === 'fit' ? 100 : zoomLevel;

  return (
    <main className="emir-page">
      {/* ── A. TOP HEADER ─────────────────────────────────────────────────── */}
      <header className="emir-header">
        <div className="emir-header-left">
          <div className="emir-breadcrumbs">
            <span>Document Review</span>
            <span>/</span>
            <span>{isBatchMode ? 'Batch Multi-Invoice Processing' : 'Multi-Invoice Processing'}</span>
            {!isBatchMode && <span className="emir-file-badge">{doc?.fileName || 'Combined_Invoice.pdf'}</span>}
            {isBatchMode && <span className="emir-file-badge">{uniqueDocNames.length} documents</span>}
          </div>
          <h1 className="emir-title">{isBatchMode ? 'Batch Invoice Review Workspace' : 'Multi-Invoice Review Workspace'}</h1>
          <p className="emir-subtitle">
            {isBatchMode
              ? <><strong style={{ color: 'var(--primary, #6366f1)' }}>Documents: {uniqueDocNames.length}</strong> &nbsp;·&nbsp; <strong style={{ color: 'var(--primary, #6366f1)' }}>Invoices: {invoices.length}</strong> · Select an invoice below to review</>  
              : <><strong style={{ color: 'var(--primary, #6366f1)' }}>{invoices.length}</strong> invoices detected • Select an invoice below to review original pages and extracted data</>  
            }
          </p>
        </div>

        <div className="emir-header-actions">
          {saveSuccess && <span style={{ color: 'var(--success, #1FC991)', fontWeight: 600, fontSize: '0.88rem' }}>✓ Saved & Approved</span>}
          {saveError && <span style={{ color: 'var(--danger, #EA6A6A)', fontSize: '0.85rem' }}>{saveError}</span>}

          <button
            type="button"
            className="escalate-btn"
            onClick={() => setShowEscalationModal(true)}
          >
            🚨 Escalate Invoice
          </button>

          <button
            type="button"
            className="emir-btn-discard"
            onClick={() => setShowDiscardModal(true)}
          >
            ✕ Discard
          </button>

          <button
            type="button"
            className="emir-btn-save"
            onClick={handleSaveSelectedInvoice}
            disabled={saving}
          >
            {saving ? 'Saving...' : '✓ Save & Approve'}
          </button>
        </div>
      </header>

      {/* ── B. MAIN REVIEW WORKSPACE (2-COLUMN GRID) ───────────────────────── */}
      <div className="emir-workspace">
        {/* LEFT COLUMN — ORIGINAL DOCUMENT VIEWER */}
        <section className="emir-doc-card">
          <div className="emir-card-header">
            <div className="emir-card-title">
              <span>📄 ORIGINAL DOCUMENT</span>
            </div>
            <div className="emir-range-tag">
              {selectedInvoiceLabel} · Pages 1–{invoicePagesTotal}
            </div>
          </div>

          <div className="emir-doc-toolbar">
            <div className="emir-toolbar-group">
              <button
                type="button"
                className="emir-tb-btn"
                onClick={() => setPageOffset(p => Math.max(0, p - 1))}
                disabled={relativePage <= 1}
                title="Previous page in this invoice"
              >
                ◀ Prev
              </button>
              <span className="emir-tb-text">{selectedInvoiceLabel} · Page {relativePageLabel} / {invoicePagesTotal}</span>
              <button
                type="button"
                className="emir-tb-btn"
                onClick={() => setPageOffset(p => (p + 1 < invoicePagesTotal ? p + 1 : p))}
                disabled={relativePage >= invoicePagesTotal}
                title="Next page in this invoice"
              >
                Next ▶
              </button>
            </div>

            <div className="emir-toolbar-group">
              <button
                type="button"
                className="emir-tb-btn"
                onClick={() => {
                  setZoomMode('manual');
                  setZoomLevel(z => Math.max(50, z - 25));
                }}
                title="Zoom out"
              >
                −
              </button>
              <span className="emir-tb-text">{zoomMode === 'fit' ? 'Fit' : `${zoomLevel}%`}</span>
              <button
                type="button"
                className="emir-tb-btn"
                onClick={() => {
                  setZoomMode('manual');
                  setZoomLevel(z => Math.min(200, z + 25));
                }}
                title="Zoom in"
              >
                +
              </button>
              <button
                type="button"
                className="emir-tb-btn"
                onClick={() => {
                  setZoomMode('fit');
                  setZoomLevel(100);
                }}
                title="Fit to page"
              >
                Fit
              </button>
              <a
                href={`${pdfSourceUrl}#view=FitH`}
                target="_blank"
                rel="noopener noreferrer"
                className="emir-tb-btn"
                title="Open invoice pages in new tab"
              >
                ↗ New Tab
              </a>
            </div>
          </div>

          <div
            className="emir-doc-body"
            ref={viewerBodyRef}
            style={{
              height: '100%',
              maxHeight: '100%',
              overflowY: 'auto',
              /* auto (not hidden) so zoomed pages can be scrolled horizontally */
              overflowX: 'auto',
            }}
          >
            {isImageFile(selectedInvoice) ? (
              <div
                className="emir-doc-fit-stage"
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: zoomMode === 'fit' ? 'center' : 'flex-start',
                  overflowY: 'auto',
                  overflowX: 'auto',
                  boxSizing: 'border-box',
                  padding: '16px',
                }}
              >
                <img
                  key={`img-${activeDocId}-inv-${selectedInvoiceIndex}`}
                  className="emir-doc-fit-media"
                  src={`${API}/documents/${activeDocId}/file`}
                  alt={`${selectedInvoiceLabel} original document`}
                  style={{
                    width: zoomMode === 'fit' ? 'auto' : `${zoomLevel}%`,
                    height: zoomMode === 'fit' ? 'auto' : 'auto',
                    maxWidth: zoomMode === 'fit' ? '100%' : 'none',
                    maxHeight: zoomMode === 'fit' ? '100%' : 'none',
                    objectFit: 'contain',
                    display: 'block',
                    margin: zoomMode === 'fit' ? 'auto' : '0 auto',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                    flexShrink: 0,
                  }}
                />
              </div>
            ) : (
              <MultiInvoicePageViewer
                key={`multi-doc-${activeDocId}-inv-${selectedInvoiceIndex}`}
                pdfUrl={pdfSourceUrl}
                pageNumber={relativePage}
                zoomMode={zoomMode}
                zoomLevel={zoomLevel}
                containerRef={viewerBodyRef}
              />
            )}
          </div>
        </section>

        {/* RIGHT COLUMN — EXTRACTED INFORMATION */}
        <section className="emir-extracted-card">
          <div className="emir-summary-bar">
            <div className="emir-summary-info">
              <div className="emir-card-tag">EXTRACTED DATA</div>
              <div className="emir-summary-number">
                {selectedInvoiceLabel}
              </div>
              <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: '0.15rem' }}>
                {hasExtractedData
                  ? (extractedInvNum !== 'Not extracted' ? `Invoice Number: ${extractedInvNum}` : 'Extracted')
                  : (isPreparing ? 'Preparing…' : isExtracting ? 'Extracting…' : isExtractionFailed ? 'Extraction Failed' : 'Not Extracted')}
              </div>
            </div>

            <div className="emir-summary-meta">
              {hasConfidence ? (
                <span className={`emir-confidence-badge ${confidencePercent < 80 ? 'warning' : ''}`}>
                  🎯 Confidence {confidencePercent}%
                </span>
              ) : (
                <span className="emir-confidence-badge warning" style={{ background: '#334155', color: '#94a3b8' }}>
                  🎯 Confidence N/A
                </span>
              )}
              <span className={`status-pill ${isPoorQuality ? 'warning-strong' : selectedInvoice?.status === 'APPROVED' ? 'success' : isExtractionFailed ? 'danger' : (isPreparing || isExtracting) ? 'warning' : 'primary'}`}>
                {isPoorQuality ? '⚠ Poor Image Quality' : invoiceStatusLabel}
              </span>
            </div>
          </div>

          {/* WARNING BANNER FOR POOR IMAGE QUALITY */}
          {isPoorQuality && (
            <div className="emir-warning-banner">
              <div className="emir-warning-title">⚠ Poor Image Quality · Review Required</div>
              <div className="emir-warning-desc">
                The image for this isolated invoice is low quality or blurry. All extracted data fields are rendered below for manual verification.
              </div>
            </div>
          )}

          {/* TAB SELECTOR */}
          <div className="emir-tabs">
            <button
              type="button"
              className={`emir-tab-btn ${activeTab === 'header' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('header')}
            >
              📄 Invoice Info
            </button>
            <button
              type="button"
              className={`emir-tab-btn ${activeTab === 'shipments' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('shipments')}
            >
              🚚 Shipments {shipmentData.length > 0 ? `(${shipmentData.length})` : ''}
            </button>
            <button
              type="button"
              className={`emir-tab-btn ${activeTab === 'charges' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('charges')}
            >
              💳 Charge Line Items {lineItemsData.length > 0 ? `(${lineItemsData.length})` : ''}
            </button>
            <button
              type="button"
              className={`emir-tab-btn ${activeTab === 'confidence' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('confidence')}
            >
              🎯 Extraction Info
            </button>
          </div>

          {/* TAB CONTENT PANEL */}
          <div className="emir-tab-panel">
            {isExtractionFailed ? (
              <div className="emir-extraction-state">
                <div className="emir-extraction-state__icon emir-extraction-state__icon--error">⚠</div>
                <h3 className="emir-extraction-state__title">Extraction Failed</h3>
                <p className="emir-extraction-state__desc">
                  We couldn&apos;t extract the data from {selectedInvoiceLabel}. Please try again.
                </p>
                <button
                  type="button"
                  className="emir-btn-save emir-extraction-retry"
                  onClick={() => runInvoiceExtraction(selectedInvoiceIndex, { force: true })}
                >
                  Retry Extraction
                </button>
              </div>
            ) : isPreparing ? (
              <div className="emir-extraction-state">
                <div className="emir-extraction-spinner" aria-hidden="true" />
                <h3 className="emir-extraction-state__title">Preparing Invoice</h3>
                <p className="emir-extraction-state__desc">
                  Preparing {selectedInvoiceLabel} for secure data extraction...
                </p>
              </div>
            ) : isExtracting ? (
              <div className="emir-extraction-state">
                <div className="emir-extraction-spinner" aria-hidden="true" />
                <h3 className="emir-extraction-state__title">Extracting {selectedInvoiceLabel}</h3>
                <p className="emir-extraction-state__desc">
                  Analyzing invoice details and extracting structured data...
                </p>
              </div>
            ) : isWaitingForExtraction ? (
              <div className="emir-extraction-state">
                <div className="emir-extraction-spinner" aria-hidden="true" />
                <h3 className="emir-extraction-state__title">Preparing Invoice</h3>
                <p className="emir-extraction-state__desc">
                  Preparing {selectedInvoiceLabel} for secure data extraction...
                </p>
              </div>
            ) : (
              <>
            {/* 1. INVOICE HEADER TAB */}
            {activeTab === 'header' && (
              <>
                <div className="emir-field-section">
                  <h3 className="emir-section-title">📋 INVOICE INFORMATION</h3>
                  <div className="emir-field-grid">
                    {invoiceInfoFields.map(f => (
                      <div className="emir-field-group" key={f.key}>
                        <label className="emir-field-label">{f.label}</label>
                        <input
                          className="emir-field-input"
                          value={f.value === null || f.value === undefined ? '' : String(f.value)}
                          placeholder="Not extracted"
                          onChange={(e) => updateDraftPath(['invoiceHeader', f.key], e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="emir-field-section">
                  <h3 className="emir-section-title">🚛 CARRIER INFORMATION</h3>
                  <div className="emir-field-grid">
                    {carrierInfoFields.map(f => (
                      <div className="emir-field-group" key={f.key}>
                        <label className="emir-field-label">{f.label}</label>
                        <input
                          className="emir-field-input"
                          value={f.value === null || f.value === undefined ? '' : String(f.value)}
                          placeholder="Not extracted"
                          onChange={(e) => updateDraftPath(['invoiceHeader', f.key], e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="emir-field-section">
                  <h3 className="emir-section-title">🏢 BILLING & CUSTOMER INFORMATION</h3>
                  <div className="emir-field-grid">
                    {billingInfoFields.map(f => (
                      <div className="emir-field-group" key={f.key}>
                        <label className="emir-field-label">{f.label}</label>
                        <input
                          className="emir-field-input"
                          value={f.value === null || f.value === undefined ? '' : String(f.value)}
                          placeholder="Not extracted"
                          onChange={(e) => updateDraftPath(['invoiceHeader', f.key], e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="emir-field-section">
                  <h3 className="emir-section-title">💰 FINANCIAL SUMMARY</h3>
                  <div className="emir-field-grid">
                    {financialInfoFields.map(f => (
                      <div className="emir-field-group" key={f.key}>
                        <label className="emir-field-label">{f.label}</label>
                        <input
                          className="emir-field-input"
                          value={f.value === null || f.value === undefined ? '' : String(f.value)}
                          placeholder="Not extracted"
                          onChange={(e) => updateDraftPath(['invoiceHeader', f.key], e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="emir-field-section">
                  <h3 className="emir-section-title">🏦 PAYMENT & REMITTANCE INFORMATION</h3>
                  <div className="emir-field-grid">
                    {paymentInfoFields.map(f => (
                      <div className="emir-field-group" key={f.key}>
                        <label className="emir-field-label">{f.label}</label>
                        <input
                          className="emir-field-input"
                          value={f.value === null || f.value === undefined ? '' : String(f.value)}
                          placeholder="Not extracted"
                          onChange={(e) => updateDraftPath(['invoiceHeader', f.key], e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* 2. SHIPMENTS TAB */}
            {activeTab === 'shipments' && (
              <>
                {shipmentData.length === 0 ? (
                  <div className="emir-empty-box">
                    <div className="emir-empty-icon">🚚</div>
                    <div className="emir-empty-text">No shipment records extracted for this invoice.</div>
                    <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>If missing due to unreadable text, you can enter details manually.</div>
                  </div>
                ) : (
                  <div className="emir-table-container">
                    <table className="emir-table">
                      <thead>
                        <tr>
                          <th>Shipment #</th>
                          <th>Tracking / PRO</th>
                          <th>Carrier</th>
                          <th>Mode</th>
                          <th>Origin</th>
                          <th>Destination</th>
                          <th>Ship Date</th>
                          <th>Delivery Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {shipmentData.map((ship, idx) => (
                          <tr key={idx}>
                            <td>
                              <input
                                className="emir-table-input"
                                value={ship.shipmentNumber || idx + 1}
                                placeholder="Not extracted"
                                onChange={(e) => updateDraftPath(['shipmentDetails', idx, 'shipmentNumber'], e.target.value)}
                              />
                            </td>
                            <td>
                              <input
                                className="emir-table-input"
                                value={ship.trackingNumber || ship.proNumber || ''}
                                placeholder="Not extracted"
                                onChange={(e) => updateDraftPath(['shipmentDetails', idx, 'trackingNumber'], e.target.value)}
                              />
                            </td>
                            <td>
                              <input
                                className="emir-table-input"
                                value={ship.carrierName || ship.carrier || ''}
                                placeholder="Not extracted"
                                onChange={(e) => updateDraftPath(['shipmentDetails', idx, 'carrierName'], e.target.value)}
                              />
                            </td>
                            <td>
                              <input
                                className="emir-table-input"
                                value={ship.mode || ''}
                                placeholder="Not extracted"
                                onChange={(e) => updateDraftPath(['shipmentDetails', idx, 'mode'], e.target.value)}
                              />
                            </td>
                            <td>
                              <input
                                className="emir-table-input"
                                value={ship.origin || ship.originCity || ''}
                                placeholder="Not extracted"
                                onChange={(e) => updateDraftPath(['shipmentDetails', idx, 'origin'], e.target.value)}
                              />
                            </td>
                            <td>
                              <input
                                className="emir-table-input"
                                value={ship.destination || ship.destCity || ''}
                                placeholder="Not extracted"
                                onChange={(e) => updateDraftPath(['shipmentDetails', idx, 'destination'], e.target.value)}
                              />
                            </td>
                            <td>
                              <input
                                className="emir-table-input"
                                value={ship.shipDate || ship.pickupDate || ''}
                                placeholder="Not extracted"
                                onChange={(e) => updateDraftPath(['shipmentDetails', idx, 'shipDate'], e.target.value)}
                              />
                            </td>
                            <td>
                              <input
                                className="emir-table-input"
                                value={ship.deliveryDate || ''}
                                placeholder="Not extracted"
                                onChange={(e) => updateDraftPath(['shipmentDetails', idx, 'deliveryDate'], e.target.value)}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            {/* 3. CHARGE LINE ITEMS TAB */}
            {activeTab === 'charges' && (
              <>
                {lineItemsData.length === 0 ? (
                  <div className="emir-empty-box">
                    <div className="emir-empty-icon">💳</div>
                    <div className="emir-empty-text">No charge line items extracted for this invoice.</div>
                    <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>If missing due to unreadable text, you can enter details manually.</div>
                  </div>
                ) : (
                  <div className="emir-table-container">
                    <table className="emir-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Description</th>
                          <th>Code / Category</th>
                          <th>Quantity</th>
                          <th>Rate</th>
                          <th>Amount</th>
                          <th>Currency</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lineItemsData.map((item, idx) => (
                          <tr key={idx}>
                            <td>{idx + 1}</td>
                            <td>
                              <input
                                className="emir-table-input"
                                value={item.description || item.chargeDescription || ''}
                                placeholder="Not extracted"
                                onChange={(e) => updateDraftPath(['chargeLineItems', idx, 'description'], e.target.value)}
                              />
                            </td>
                            <td>
                              <input
                                className="emir-table-input"
                                value={item.chargeCode || item.code || ''}
                                placeholder="Not extracted"
                                onChange={(e) => updateDraftPath(['chargeLineItems', idx, 'chargeCode'], e.target.value)}
                              />
                            </td>
                            <td>
                              <input
                                className="emir-table-input"
                                value={item.quantity ?? item.qty ?? 1}
                                placeholder="1"
                                onChange={(e) => updateDraftPath(['chargeLineItems', idx, 'quantity'], e.target.value)}
                              />
                            </td>
                            <td>
                              <input
                                className="emir-table-input"
                                value={item.rate || item.unitPrice || ''}
                                placeholder="Not extracted"
                                onChange={(e) => updateDraftPath(['chargeLineItems', idx, 'rate'], e.target.value)}
                              />
                            </td>
                            <td>
                              <input
                                className="emir-table-input"
                                value={item.amount || item.chargeAmount || ''}
                                placeholder="Not extracted"
                                onChange={(e) => updateDraftPath(['chargeLineItems', idx, 'amount'], e.target.value)}
                              />
                            </td>
                            <td>
                              <input
                                className="emir-table-input"
                                value={item.currency || '$'}
                                placeholder="$"
                                onChange={(e) => updateDraftPath(['chargeLineItems', idx, 'currency'], e.target.value)}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            {/* 4. EXTRACTION / CONFIDENCE TAB */}
            {activeTab === 'confidence' && (
              <div className="emir-field-section">
                <h3 className="emir-section-title">🎯 EXTRACTION & CONFIDENCE METRICS</h3>
                <div className="emir-field-grid">
                  <div className="emir-field-group">
                    <label className="emir-field-label">Document ID</label>
                    <input className="emir-field-input" value={activeDocId || ''} readOnly style={{ opacity: 0.8 }} />
                  </div>
                  <div className="emir-field-group">
                    <label className="emir-field-label">Invoice Index</label>
                    <input className="emir-field-input" value={`Invoice ${selectedInvoiceIndex + 1}`} readOnly style={{ opacity: 0.8 }} />
                  </div>
                  <div className="emir-field-group">
                    <label className="emir-field-label">Isolated Page Range</label>
                    <input className="emir-field-input" value={`Pages 1–${invoicePagesTotal} of ${selectedInvoiceLabel}`} readOnly style={{ opacity: 0.8 }} />
                  </div>
                  <div className="emir-field-group">
                    <label className="emir-field-label">Overall Confidence Score</label>
                    <input className="emir-field-input" value={confidencePercent != null ? `${confidencePercent}%` : 'N/A'} readOnly style={{ opacity: 0.8 }} />
                  </div>
                  <div className="emir-field-group">
                    <label className="emir-field-label">Image Quality Flag</label>
                    <input className="emir-field-input" value={isPoorQuality ? 'Poor Image Quality (Needs Review)' : 'Normal Image Quality'} readOnly style={{ opacity: 0.8, color: isPoorQuality ? 'var(--danger, #EA6A6A)' : 'var(--success, #1FC991)' }} />
                  </div>
                  <div className="emir-field-group">
                    <label className="emir-field-label">Processing Status</label>
                    <input className="emir-field-input" value={invoiceStatusLabel} readOnly style={{ opacity: 0.8 }} />
                  </div>
                </div>
              </div>
            )}
            </>
          )}
        </div>
      </section>
      </div>

      {/* ── C. INVOICE NAVIGATOR with Filters & Document Grouping ────────── */}
      <section className="emir-invoices-section">
        <div className="emir-invoices-header">
          <h2 className="emir-invoices-title">
            <span>INVOICES</span>
          </h2>
          <span className="emir-invoices-count">{filteredWithIndex.length} of {invoices.length} invoices</span>
        </div>

        {/* Document grouping tabs */}
        {isBatchMode && uniqueDocNames.length > 1 && (
          <div className="bq-doc-tabs">
            <button
              type="button"
              className={`bq-doc-tab${filterDoc === 'all' ? ' bq-doc-tab--active' : ''}`}
              onClick={() => { setFilterDoc('all'); setSelectedInvoiceIndex(0); }}
            >
              All Documents ({invoices.length})
            </button>
            {uniqueDocNames.map((name) => (
              <button
                key={name}
                type="button"
                className={`bq-doc-tab${filterDoc === name ? ' bq-doc-tab--active' : ''}`}
                onClick={() => { 
                  setFilterDoc(name); 
                  const foundIdx = invoices.findIndex(inv => (inv.sourceFileName || inv.fileName || inv.documentId || primaryDocId) === name);
                  setSelectedInvoiceIndex(foundIdx !== -1 ? foundIdx : 0); 
                }}
              >
                📄 {name.length > 24 ? name.slice(0, 22) + '…' : name}
              </button>
            ))}
          </div>
        )}

        {/* Status filters + Search */}
        <div className="bq-filter-bar">
          <div className="bq-filter-tabs">
            {[['all','All'],['ready','Ready'],['review','Needs Review'],['poor','Poor Image'],['approved','Approved'],['failed','Failed']].map(([val, label]) => (
              <button key={val} type="button" className={`bq-filter-tab${filterStatus === val ? ' bq-filter-tab--active' : ''}`} onClick={() => setFilterStatus(val)}>{label}</button>
            ))}
          </div>
          <div className="bq-search-wrap">
            <input
              type="text"
              className="bq-search-input"
              placeholder="Search invoice # or filename…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && <button className="bq-search-clear" onClick={() => setSearchQuery('')}>×</button>}
          </div>
        </div>

        <div className="emir-cards-grid">
          {filteredWithIndex.length === 0 && (
            <div className="emir-empty-box" style={{ gridColumn: '1 / -1' }}>
              <div className="emir-empty-icon">🔍</div>
              <div className="emir-empty-text">No invoices match the current filters.</div>
            </div>
          )}
          {filteredWithIndex.map(({ inv, globalIdx }) => {
            const isSelected = selectedInvoiceIndex === globalIdx;
            const invDraft = drafts[globalIdx] || {};
            const invHeader = invDraft.invoiceHeader || invDraft.header || {};
            const hasReal = invoiceHasRealExtraction(inv) || Boolean(extractRealInvoiceObject(invDraft));
            const invNumberVal = hasReal ? (invHeader.invoiceNumber || invDraft.invoiceNumber || inv.invoiceNumber) : null;
            const displayNum = invNumberVal ? String(invNumberVal) : 'Not extracted';
            const conf = hasReal && inv.overallConfidence != null ? Math.round(inv.overallConfidence * 100) : null;
            const statusLabel = humanInvoiceStatus(inv, globalIdx);
            const ui = normalizeInvoiceExtractionUi(inv);
            const poor = inv.poorImageQuality || inv.status === 'Poor Image Quality' || inv.status === 'POOR_IMAGE_QUALITY';
            const srcName = inv.sourceFileName || inv.fileName || '';
            const invLabel = invoiceDisplayLabel(inv, globalIdx);
            const invPageCount = invoicePageCount(inv);

            return (
              <div
                key={inv.id || globalIdx}
                className={`emir-card ${isSelected ? 'is-selected' : ''}`}
                onClick={() => {
                  setSelectedInvoiceIndex(globalIdx);
                  runInvoiceExtraction(globalIdx, { force: false });
                }}
              >
                <div className="emir-card-top">
                  <span className="emir-card-tag">{invLabel.toUpperCase()}</span>
                  {isSelected && <span className="emir-selected-pill">● SELECTED</span>}
                </div>

                <div className="emir-card-number" style={{ fontStyle: displayNum === 'Not extracted' ? 'italic' : 'normal', opacity: displayNum === 'Not extracted' ? 0.7 : 1 }}>
                  {displayNum}
                </div>

                {srcName && (
                  <div className="emir-card-source" title={srcName}>
                    📄 {srcName.length > 26 ? srcName.slice(0, 24) + '…' : srcName}
                  </div>
                )}

                <div className="emir-card-meta">
                  <span>Pages 1–{invPageCount}</span>
                  <span>{conf != null ? `${conf}% confidence` : 'Confidence N/A'}</span>
                </div>

                <div className="emir-card-footer">
                  <span className={`status-pill ${poor ? 'warning-strong' : statusLabel === 'Approved' ? 'success' : ui === EXTRACTION_UI.FAILED ? 'danger' : (ui === EXTRACTION_UI.EXTRACTING || ui === EXTRACTION_UI.PREPARING) ? 'warning' : 'primary'}`}>
                    {poor ? '⚠ Poor Image' : statusLabel}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── D. CUSTOM DISCARD CONFIRMATION MODAL ─────────────────────────── */}
      {showDiscardModal && (
        <div className="emir-modal-overlay">
          <div className="emir-modal-card">
            <div className="emir-modal-header">
              <div className="emir-modal-icon">⚠️</div>
              <h3 className="emir-modal-title">Discard Invoice Changes?</h3>
            </div>
            <div className="emir-modal-body">
              This will remove all unsaved modifications made to the currently selected invoice (<strong>Invoice {selectedInvoiceIndex + 1}</strong>).
            </div>
            <div className="emir-modal-footer">
              <button
                type="button"
                className="secondary-btn"
                onClick={() => setShowDiscardModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="emir-btn-discard"
                onClick={handleConfirmDiscard}
              >
                Discard Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── E. ESCALATION MODAL ───────────────────────────────────────────── */}
      {showEscalationModal && (
        <EscalationModal
          docId={activeDocId}
          invoiceId={selectedInvoice?.id || String(selectedInvoiceIndex)}
          invoiceLabel={`Invoice ${selectedInvoiceIndex + 1}`}
          onClose={() => setShowEscalationModal(false)}
          onSuccess={() => {
            setShowEscalationModal(false);
            setInvoices(prev => prev.map((inv, i) => i === selectedInvoiceIndex ? { ...inv, status: 'Escalation Required' } : inv));
          }}
        />
      )}
    </main>
  );
};

