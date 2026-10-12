import test from 'node:test';
import assert from 'node:assert/strict';
import { getDocumentReviewPath } from './reviewRouting.js';

test('routes documents with multiple saved invoice records to the multi-workspace', () => {
  assert.equal(
    getDocumentReviewPath({ id: 'doc-1' }, [{ id: 'invoice-1' }, { id: 'invoice-2' }]),
    '/documents/doc-1/multi-workspace'
  );
});

test('uses a multi-invoice count from the dashboard summary', () => {
  assert.equal(
    getDocumentReviewPath({ id: 'doc-1', invoiceCount: 3 }),
    '/documents/doc-1/multi-workspace'
  );
});

test('keeps a single-invoice PDF on the single-invoice review route', () => {
  assert.equal(
    getDocumentReviewPath(
      { id: 'doc-1', fileName: 'invoice.pdf', invoiceCount: 1 },
      [{ id: 'invoice-1' }]
    ),
    '/documents/doc-1/review'
  );
});

test('uses the multi-workspace for a PDF with no saved count yet', () => {
  assert.equal(
    getDocumentReviewPath({ id: 'doc-1', fileName: 'combined.pdf' }),
    '/documents/doc-1/multi-workspace'
  );
});
