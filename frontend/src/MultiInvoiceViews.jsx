import React, { useState, useEffect, useRef } from 'react';
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
      let res = await fetch(`${API}/upload-multi-invoice`, { method: 'POST', body: formData });
      if (!res.ok) {
        res = await fetch(`${API}/documents/upload-multi`, { method: 'POST', body: formData });
      }
      const data = await res.json();
      const docId = data.docId || (data.documentIds && data.documentIds[0]);
      if (data.success && docId) {
        setStatusText('Upload complete! Displaying workspace...');
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
          <p className="subtle-copy mt-2">Upload a single PDF containing multiple invoices. You can select and process each invoice independently.</p>
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
          <div className="dropzone-subtext">Must be a PDF file containing multiple invoices</div>
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
    return parsed;
  }

  return null;
};

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

/* Component 1: InvoiceList (Left Sidebar Column 1) */
export const InvoiceList = ({ invoiceGroups, selectedIndex, extractedData, processingStates, errorStates, onInvoiceClick }) => {
  return (
    <div className="multi-sidebar">
      <div className="invoice-list-header">
        <h2>Invoices</h2>
        <span className="invoice-count">({invoiceGroups.length})</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {invoiceGroups.length === 0 ? (
          <div style={{ color: 'var(--text-muted, #94a3b8)', fontSize: '13px' }}>No invoices detected.</div>
        ) : (
          invoiceGroups.map((group, idx) => {
            const isSelected = selectedIndex === idx;
            const isDone = Boolean(extractedData[idx]);
            const isLoading = Boolean(processingStates[idx]);
            const isError = Boolean(errorStates[idx]);

            let stateClass = 'ready';
            let badgeSymbol = '☐';
            let statusText = 'Not Processed';

            if (isLoading) {
              stateClass = 'loading';
              badgeSymbol = '↻';
              statusText = 'Processing';
            } else if (isDone) {
              stateClass = 'extracted';
              badgeSymbol = '✓';
              statusText = 'Completed';
            } else if (isError) {
              stateClass = 'error';
              badgeSymbol = '⚠️';
              statusText = 'Error';
            }

            return (
              <div 
                key={idx}
                className={`invoice-item ${stateClass} ${isSelected ? 'selected' : ''}`}
                onClick={() => onInvoiceClick(idx, group)}
                data-index={idx}
              >
                <div className="invoice-item-content">
                  <span className={`invoice-badge ${isLoading ? 'rotating' : ''}`}>{badgeSymbol}</span>
                  <span className="invoice-name">
                    Invoice {idx + 1}
                    {group && (
                      <span style={{ fontSize: '11px', color: 'var(--text-muted, #94a3b8)', marginLeft: '4px' }}>
                        (Pages {group.pageStart}{group.pageEnd !== group.pageStart ? `\u2013${group.pageEnd}` : ''})
                      </span>
                    )}
                  </span>
                </div>
                <span className="invoice-status-badge">{statusText}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

/* Component 2: DocumentViewer (Center Panel Column 2) */
export const DocumentViewer = ({ docId }) => {
  return (
    <div className="multi-viewer-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '600', color: 'var(--text-primary, #f8fafc)' }}>Original Document</h3>
          <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--text-muted, #94a3b8)' }}>Complete PDF (All pages visible)</p>
        </div>
      </div>
      <div className="document-viewer-container">
        <iframe 
          className="pdf-viewer-iframe"
          src={`${API}/documents/${docId}/file`}
          title="Original Document"
        />
      </div>
    </div>
  );
};

/* Component: ExtractionProcessingPanel (Production-Grade AI Document Processing waiting state) */
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

        {/* Subtle Animated Progress Bar */}
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

        {/* Processing Steps */}
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

/* Component 3: InvoiceCard (Tabbed Editable Extracted Fields UI in Right Panel) */
export const InvoiceCard = ({ idx, group, data, isLoading, errorMsg, isSelected, onRetry, onSave }) => {
  const [draft, setDraft] = useState(data || {});
  const [selectedSection, setSelectedSection] = useState('header');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveErr, setSaveErr] = useState('');

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

  // Determine correct shipment key (support multiple possible names)
  const possibleShipmentKeys = ['shipmentDetails', 'shipmentDetail', 'shipments', 'shipment'];
  const shipmentKey = possibleShipmentKeys.find(k => Array.isArray(draft[k]));
  const shipmentRecords = shipmentKey && Array.isArray(draft[shipmentKey]) ? draft[shipmentKey] : [];

  // Build charge line items list, preserving shipment association when present
  const chargeRecords = [];
  // First, collect any chargeLineItems nested under shipments
  shipmentRecords.forEach((shipment, shipmentIdx) => {
    if (Array.isArray(shipment?.chargeLineItems)) {
      shipment.chargeLineItems.forEach((charge, chargeIdx) => {
        chargeRecords.push({
          charge,
          path: [shipmentKey, shipmentIdx, 'chargeLineItems', chargeIdx],
          label: `Shipment ${shipmentIdx + 1} Charge ${chargeIdx + 1}`
        });
      });
    }
  });
  // Then, include any top-level chargeLineItems (or other line item aliases) using the helper
  const topLevelItems = getLineItems(draft);
  topLevelItems.forEach((item, idx) => {
    chargeRecords.push({
      charge: item,
      path: ['chargeLineItems', idx],
      label: `Charge ${idx + 1}`
    });
  });

  const sectionDefinitions = [
    { id: 'header', label: 'Invoice Header', value: draft.invoiceHeader && typeof draft.invoiceHeader === 'object' && !Array.isArray(draft.invoiceHeader) ? draft.invoiceHeader : {} },
    { id: 'shipment', label: 'Shipments', value: shipmentRecords },
    { id: 'charges', label: 'Charge Line Items', value: chargeRecords },
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

  return (
    <div 
      id={`invoice-card-${idx}`}
      className={`card editor-panel ${isSelected ? 'selected-card' : ''} ${errorMsg ? 'error' : ''}`}
      data-invoice-index={idx}
      style={{ margin: 0 }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        <h3 className="section-title" style={{ color: '#fff', letterSpacing: '0.1em', margin: 0 }}>EXTRACTED FIELDS</h3>
        {onSave && (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {saveSuccess && <span style={{ color: 'var(--success, #1FC991)', fontSize: '0.8rem', fontWeight: 600 }}>✓ Saved</span>}
            {saveErr && <span style={{ color: 'var(--danger, #EA6A6A)', fontSize: '0.8rem' }}>{saveErr}</span>}
            <button type="button" className="primary-btn" onClick={handleSave} disabled={saving || isEmpty} style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        )}
      </div>

      {errorMsg && !isLoading && (
        <div className="error-message" style={{ marginBottom: '1rem' }}>
          <p>Failed to process invoice: {errorMsg}</p>
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
              >
                {section.label}
              </button>
            ))}
          </div>

          <div className={`editor-scroll-content ${activeSection.id === 'shipment' ? 'single-invoice-shipment-content' : ''}`}>
            <div className="invoice-sections">
              {activeSection.id === 'header' && renderEditableNode(activeSection.value, ['invoiceHeader'], activeSection.label)}
              {activeSection.id === 'shipment' && renderEditableNode(activeSection.value, [shipmentKey], activeSection.label, { excludeKeys: ['chargeLineItems'] })}
              {activeSection.id === 'charges' && (chargeRecords.length > 0
                ? chargeRecords.map((record) => <div className="nested-record" key={record.path.join('.')}><div className="field-label">{record.label}</div>{renderEditableNode(record.charge, record.path, '')}</div>)
                : <div className="subtle-copy">No records found</div>)}
            </div>
          </div>
        </>
      )}

      {isEmpty && !errorMsg && (
        <div className="subtle-copy" style={{ padding: '1rem' }}>Extraction data unavailable for this invoice.</div>
      )}
    </div>
  );
};

/* Component 4: ExtractedDataPanel (Accumulative Right Panel Column 3) */
export const ExtractedDataPanel = ({ selectedIndex, invoiceGroups, extractedData, processingStates, errorStates, onRetry }) => {
  const hasData = selectedIndex !== null && extractedData[selectedIndex];
  const isLoading = selectedIndex !== null && Boolean(processingStates[selectedIndex]);
  const errorMsg = selectedIndex !== null ? errorStates[selectedIndex] : null;
  const selectedGroup = selectedIndex !== null ? invoiceGroups[selectedIndex] : null;

  return (
    <div className="multi-extracted-panel">
      {/* Empty Placeholder */}
      {(selectedIndex === null || (!hasData && !isLoading && !errorMsg)) && (
        <div className="extracted-data-empty">
          <div className="empty-icon">📋</div>
          <h3>Select an invoice to extract its data.</h3>
        </div>
      )}

      {/* Production-Grade AI Processing Panel */}
      {selectedIndex !== null && isLoading && (
        <ExtractionProcessingPanel 
          invoiceIndex={selectedIndex}
          pageStart={selectedGroup?.pageStart || (selectedGroup?.pages ? selectedGroup.pages[0] : 1)}
          pageEnd={selectedGroup?.pageEnd || (selectedGroup?.pages ? selectedGroup.pages[1] : 1)}
        />
      )}

      {/* Extracted Invoice Card */}
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

/* Main Layout Component: MultiInvoiceWorkspace */
export const MultiInvoiceWorkspace = () => {
  const path = window.location.pathname;
  const docId = path.split('/')[2];
  
  const [invoiceGroups, setInvoiceGroups] = useState([]);
  const [selectedInvoiceIndex, setSelectedInvoiceIndex] = useState(null);

  const [extractedData, setExtractedData] = useState({});
  const [processingStates, setProcessingStates] = useState({});
  const [errorStates, setErrorStates] = useState({});
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

    // Also check backend for any pre-extracted invoice data for this document
    fetch(`${API}/documents/${docId}/invoices?refresh=${Date.now()}`)
      .then(res => res.json())
      .then(data => {
        if (data.success && Array.isArray(data.invoices) && data.invoices.length > 0) {
          const loaded = {};
          data.invoices.forEach(inv => {
            const index = inv.invoiceIndex;
            const realObj = extractRealInvoiceObject(inv.extractedData || inv.canonicalJson || inv);
            if (realObj) {
              loaded[index] = realObj;
            }
          });
          if (Object.keys(loaded).length > 0) {
            setExtractedData(prev => ({ ...loaded, ...prev }));
          }
        }
      })
      .catch(console.error);
  }, [docId]);

  const fetchBackendExtractedData = async (targetDocId, index, reviewUrl) => {
    let targetEndpoint = `${API}/documents/${targetDocId}/invoices?refresh=${Date.now()}`;
    if (reviewUrl && typeof reviewUrl === 'string') {
      const rawPath = reviewUrl.replace(/^\/api/, '');
      if (rawPath.includes('/invoices')) {
        targetEndpoint = `${API}${rawPath.startsWith('/') ? '' : '/'}${rawPath}?refresh=${Date.now()}`;
      }
    }

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const invRes = await fetch(targetEndpoint, { cache: 'no-store' });
        if (invRes.ok) {
          const invJson = await invRes.json();
          const invoiceList = invJson.invoices || [];
          const matchingInvoice = invoiceList.find(inv => Number(inv.invoiceIndex) === Number(index)) || invoiceList[index];
          if (matchingInvoice) {
            const realObj = extractRealInvoiceObject(matchingInvoice.extractedData || matchingInvoice.canonicalJson || matchingInvoice);
            if (realObj) {
              return realObj;
            }
          }
        }
      } catch (err) {
        console.warn('Attempt', attempt, 'fetching extracted invoice data failed:', err);
      }

      try {
        const docsRes = await fetch(`${API}/documents?refresh=${Date.now()}`, { cache: 'no-store' });
        if (docsRes.ok) {
          const docsJson = await docsRes.json();
          const foundDoc = (docsJson.documents || []).find(d => d.id === targetDocId);
          if (foundDoc) {
            const invoiceList = foundDoc.invoices || [];
            const matchingInvoice = invoiceList.find(inv => Number(inv.invoiceIndex) === Number(index)) || invoiceList[index];
            if (matchingInvoice) {
              const realObj = extractRealInvoiceObject(matchingInvoice.extractedData || matchingInvoice.canonicalJson || matchingInvoice);
              if (realObj) {
                return realObj;
              }
            }
            if (foundDoc.extraction) {
              const realObj = extractRealInvoiceObject(foundDoc.extraction.canonicalJson || foundDoc.extraction.extractedData || foundDoc.extraction);
              if (realObj) {
                return realObj;
              }
            }
          }
        }
      } catch (err) {
        console.warn('Fallback docs fetch failed:', err);
      }

      await new Promise(r => setTimeout(r, 800));
    }

    return null;
  };

  const processInvoice = async (index, group) => {
    if (processingStates[index] || extractedData[index]) return;

    setProcessingStates(prev => ({ ...prev, [index]: true }));
    setErrorStates(prev => ({ ...prev, [index]: null }));

    try {
      const pageStart = group?.pageStart || (group?.pages ? group.pages[0] : 1);
      const pageEnd = group?.pageEnd || (group?.pages ? group.pages[1] : 1);

      const res = await fetch(`${API}/process-invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          docId,
          invoiceIndex: index,
          pages: [pageStart, pageEnd],
          pageStart,
          pageEnd
        })
      });

      const data = await res.json();
      
      const directExtracted = extractRealInvoiceObject(data?.extractedData) || extractRealInvoiceObject(data);

      if (directExtracted) {
        setExtractedData(prev => ({ ...prev, [index]: directExtracted }));
      } else if (data && (data.success || data.complete || data.reviewUrl)) {
        // n8n workflow executed successfully returning success: true, complete: true, reviewUrl
        // Load actual extracted invoice data from backend
        const backendData = await fetchBackendExtractedData(docId, index, data.reviewUrl);
        if (backendData) {
          setExtractedData(prev => ({ ...prev, [index]: backendData }));
        } else {
          setErrorStates(prev => ({ ...prev, [index]: 'Unable to load extracted invoice data from backend.' }));
        }
      } else if (data && data.error) {
        // Even if HTTP/n8n connection timed out, n8n may have finished in background and sent callback to backend DB
        const backendData = await fetchBackendExtractedData(docId, index);
        if (backendData) {
          setExtractedData(prev => ({ ...prev, [index]: backendData }));
        } else {
          setErrorStates(prev => ({ ...prev, [index]: data.error }));
        }
      } else {
        const backendData = await fetchBackendExtractedData(docId, index);
        if (backendData) {
          setExtractedData(prev => ({ ...prev, [index]: backendData }));
        } else {
          setErrorStates(prev => ({ ...prev, [index]: 'Invalid response from invoice extraction pipeline.' }));
        }
      }
    } catch (e) {
      const backendData = await fetchBackendExtractedData(docId, index);
      if (backendData) {
        setExtractedData(prev => ({ ...prev, [index]: backendData }));
      } else {
        setErrorStates(prev => ({ ...prev, [index]: e.message }));
      }
    } finally {
      setProcessingStates(prev => ({ ...prev, [index]: false }));
    }
  };

  const handleInvoiceClick = (index, group) => {
    setSelectedInvoiceIndex(index);

    if (extractedData[index]) {
      // Data already extracted, just scroll to its card
      setTimeout(() => {
        const cardElem = document.getElementById(`invoice-card-${index}`);
        if (cardElem) {
          cardElem.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 50);
    } else {
      processInvoice(index, group);
      setTimeout(() => {
        const cardElem = document.getElementById(`invoice-card-${index}`);
        if (cardElem) {
          cardElem.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    }
  };

  if (loading) return <main className="page"><div style={{ padding: '2rem' }}>Loading detected invoices...</div></main>;

  return (
    <main className="page" style={{ padding: '0', height: 'calc(100vh - 80px)', overflow: 'hidden' }}>
      <div className="multi-workspace-shell">
        <InvoiceList 
          invoiceGroups={invoiceGroups}
          selectedIndex={selectedInvoiceIndex}
          extractedData={extractedData}
          processingStates={processingStates}
          errorStates={errorStates}
          onInvoiceClick={handleInvoiceClick}
        />
        <DocumentViewer docId={docId} />
        <ExtractedDataPanel 

          invoiceGroups={invoiceGroups}
          extractedData={extractedData}
          processingStates={processingStates}
          errorStates={errorStates}
          selectedIndex={selectedInvoiceIndex}
          onRetry={processInvoice}
        />
      </div>
    </main>
  );
};


