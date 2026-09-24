import os
import re

base = "/home/provelopers/Downloads/docs/logistics-doc-automation/frontend/src"

# 1. UPDATE styles.css
styles_path = os.path.join(base, "styles.css")
with open(styles_path, "r") as f:
    css = f.read()

# Change Extracted Fields layout to 4 columns
css = re.sub(r'(\.invoice-card-fields\s*{[^}]*grid-template-columns:\s*)repeat\(2,\s*minmax\(0,\s*1fr\)\);', r'\1repeat(4, minmax(0, 1fr));', css)
css = re.sub(r'(\.detail-field-grid\s*{[^}]*grid-template-columns:\s*)repeat\(2,\s*minmax\(0,\s*1fr\)\);', r'\1repeat(4, minmax(0, 1fr));', css)
css = re.sub(r'(\.field-grid\s*{[^}]*grid-template-columns:\s*)repeat\(2,\s*minmax\(0,\s*1fr\)\);', r'\1repeat(4, minmax(0, 1fr));', css)

# We also need to add styles for the horizontal invoice selector
selector_styles = """
/* Horizontal Invoice Selector */
.invoice-selector-container {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 10px 0;
  margin-top: 10px;
}

.invoice-selector-tab {
  flex: 0 0 auto;
  padding: 8px 12px;
  background: var(--panel-bg, #273449);
  border: 1px solid var(--border, #334155);
  border-radius: 6px;
  color: var(--text-primary, #f8fafc);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.2s ease;
}

.invoice-selector-tab:hover {
  background: var(--panel-alt, #334155);
  border-color: var(--primary, #6366f1);
}

.invoice-selector-tab.selected {
  background: rgba(99, 102, 241, 0.18);
  border-color: var(--primary, #6366f1);
  color: #fff;
}

.invoice-selector-tab.has-warning {
  border-color: rgba(234, 106, 106, 0.5);
}

.invoice-selector-tab .warning-icon {
  color: #EA6A6A;
  font-size: 14px;
}

/* Two-Panel Layout */
.multi-left-column {
  flex: 1 1 50%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--card-bg, #1e293b);
  border-radius: 8px;
  padding: 16px;
  border: 1px solid var(--border, #334155);
}
"""
if ".invoice-selector-container" not in css:
    css += "\n" + selector_styles

with open(styles_path, "w") as f:
    f.write(css)

# 2. UPDATE MultiInvoiceViews.jsx
views_path = os.path.join(base, "MultiInvoiceViews.jsx")
with open(views_path, "r") as f:
    views = f.read()

# Replace InvoiceList component
new_invoice_list = """export const InvoiceList = ({ invoiceGroups, selectedIndex, extractedData, processingStates, errorStates, onInvoiceClick }) => {
  return (
    <div className="invoice-selector-container">
      {invoiceGroups.length === 0 ? (
        <div style={{ color: 'var(--text-muted, #94a3b8)', fontSize: '13px' }}>No invoices detected.</div>
      ) : (
        invoiceGroups.map((group, idx) => {
          const isSelected = selectedIndex === idx;
          const isError = Boolean(errorStates[idx]) || (extractedData[idx] && extractedData[idx].status === 'Poor Image Quality') || (extractedData[idx] && extractedData[idx].status === 'Escalation Required');
          
          return (
            <div 
              key={idx}
              className={`invoice-selector-tab ${isSelected ? 'selected' : ''} ${isError ? 'has-warning' : ''}`}
              onClick={() => onInvoiceClick(idx, group)}
            >
              Invoice {idx + 1}
              {isError && <span className="warning-icon">⚠</span>}
            </div>
          );
        })
      )}
    </div>
  );
};"""
views = re.sub(r'export const InvoiceList =.*?\}\);.*?\}\);.*?\}', new_invoice_list, views, flags=re.DOTALL)

# Modify DocumentViewer to take selectedGroup and use it in URL
new_document_viewer = """export const DocumentViewer = ({ docId, selectedGroup }) => {
  const pageStart = selectedGroup?.pageStart || (selectedGroup?.pages ? selectedGroup.pages[0] : 1);
  return (
    <div className="multi-viewer-panel" style={{ flex: 1, padding: 0, border: 'none', background: 'transparent' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '600', color: 'var(--text-primary, #f8fafc)' }}>Original Document</h3>
          <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--text-muted, #94a3b8)' }}>{selectedGroup ? `Invoice Pages ${pageStart}${selectedGroup?.pageEnd !== pageStart ? `–${selectedGroup?.pageEnd}` : ''}` : 'Complete PDF'}</p>
        </div>
      </div>
      <div className="document-viewer-container">
        <iframe 
          className="pdf-viewer-iframe"
          src={`${API}/documents/${docId}/file#page=${pageStart}`}
          title="Original Document"
        />
      </div>
    </div>
  );
};"""
views = re.sub(r'export const DocumentViewer =.*?\}\);.*?\}', new_document_viewer, views, flags=re.DOTALL)

# Modify MultiInvoiceWorkspace return
workspace_layout = """  return (
    <main className="page" style={{ padding: '0', height: 'calc(100vh - 80px)', overflow: 'hidden' }}>
      <div className="multi-workspace-shell">
        <div className="multi-left-column">
          <DocumentViewer docId={docId} selectedGroup={invoiceGroups[selectedInvoiceIndex]} />
          <InvoiceList 
            invoiceGroups={invoiceGroups}
            selectedIndex={selectedInvoiceIndex}
            extractedData={extractedData}
            processingStates={processingStates}
            errorStates={errorStates}
            onInvoiceClick={handleInvoiceClick}
          />
        </div>
        <ExtractedDataPanel 
          selectedIndex={selectedInvoiceIndex}
          invoiceGroups={invoiceGroups}
          extractedData={extractedData}
          processingStates={processingStates}
          errorStates={errorStates}
          onRetry={processInvoice}
        />
      </div>
    </main>
  );"""
views = re.sub(r'  return \(\n    <main className="page".*?</main>\n  \);', workspace_layout, views, flags=re.DOTALL)

with open(views_path, "w") as f:
    f.write(views)

print("Done views")
