import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeApiCacheUrl } from './dataCache.js';

test('normalizeApiCacheUrl strips refresh and ts parameters for a consistent GET cache key', () => {
  assert.equal(
    normalizeApiCacheUrl('/api/documents?refresh=123456789&foo=bar'),
    '/api/documents?foo=bar'
  );
  assert.equal(
    normalizeApiCacheUrl('/api/documents?foo=bar&ts=987654321'),
    '/api/documents?foo=bar'
  );
});
