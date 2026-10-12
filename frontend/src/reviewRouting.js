export const getDocumentReviewPath = (document, invoiceRecords = []) => {
  const recordCount = Array.isArray(invoiceRecords) ? invoiceRecords.length : 0;
  const embeddedCount = Array.isArray(document?.invoices) ? document.invoices.length : 0;
  const summaryCount = Number(document?.invoiceCount) || 0;
  const invoiceCount = Math.max(recordCount, embeddedCount, summaryCount);
  const fileName = String(document?.fileName || '').toLowerCase();
  const isPdf = fileName.endsWith('.pdf')
    || String(document?.mimeType || '').toLowerCase().includes('application/pdf');

  if (invoiceCount > 1 || (invoiceCount === 0 && isPdf)) {
    return `/documents/${encodeURIComponent(document.id)}/multi-workspace`;
  }
  return `/documents/${encodeURIComponent(document.id)}/review`;
};
