import test from 'node:test';
import assert from 'node:assert/strict';
import { getInvoiceQualityReasons, getInvoiceQualityState } from './invoiceQualityReasons.js';

test('clear image with a missing invoice number is a data issue, not a visual issue', () => {
  assert.deepEqual(getInvoiceQualityReasons({
    hasExtraction: true,
    hasInvoiceNumber: false,
    imageQuality: 0.9,
    status: 'POOR_IMAGE_QUALITY',
  }), ['missing-invoice-number']);
});

test('low visual quality is identified even when invoice data is complete', () => {
  assert.deepEqual(getInvoiceQualityReasons({
    hasExtraction: true,
    hasInvoiceNumber: true,
    imageQuality: 0.4,
    status: 'EXTRACTED',
  }), ['visual-quality']);
});

test('missing extraction data is identified separately from visual quality', () => {
  assert.deepEqual(getInvoiceQualityReasons({
    hasExtraction: false,
    hasInvoiceNumber: false,
    imageQuality: 0.9,
    status: 'POOR_IMAGE_QUALITY',
  }), ['incomplete-extraction']);
});

test('incomplete review data is not labeled as poor image quality', () => {
  assert.deepEqual(getInvoiceQualityReasons({
    hasExtraction: false,
    hasInvoiceNumber: false,
    imageQuality: 0.9,
    status: 'NEEDS_REVIEW',
  }), ['incomplete-extraction']);
});

test('normal invoice data with a clear image has no quality warning', () => {
  assert.deepEqual(getInvoiceQualityReasons({
    hasExtraction: true,
    hasInvoiceNumber: true,
    imageQuality: 0.9,
    status: 'EXTRACTED',
  }), []);
});

test('clear invoice missing its number needs review but is not poor quality', () => {
  assert.deepEqual(getInvoiceQualityState({
    hasExtraction: true,
    hasInvoiceNumber: false,
    imageQuality: 0.9,
    status: 'NEEDS_REVIEW',
  }), {
    poor: false,
    needsReview: true,
    qualityReasons: ['missing-invoice-number'],
  });
});

test('blurry invoice with its number is poor quality', () => {
  assert.deepEqual(getInvoiceQualityState({
    hasExtraction: true,
    hasInvoiceNumber: true,
    imageQuality: 0.4,
    status: 'EXTRACTED',
  }), {
    poor: true,
    needsReview: true,
    qualityReasons: ['visual-quality'],
  });
});

test('incomplete extraction needs review without a visual-quality classification', () => {
  assert.deepEqual(getInvoiceQualityState({
    hasExtraction: false,
    hasInvoiceNumber: false,
    imageQuality: 0.9,
    status: 'NEEDS_REVIEW',
  }), {
    poor: false,
    needsReview: true,
    qualityReasons: ['incomplete-extraction'],
  });
});
