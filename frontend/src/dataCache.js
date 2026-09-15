const API = '/api';
const originBase = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';

export const normalizeApiCacheUrl = (url) => {
  try {
    const u = new URL(url, originBase);
    if (u.pathname.startsWith('/api/')) {
      u.searchParams.delete('refresh');
      u.searchParams.delete('ts');
      u.searchParams.delete('cacheBust');
    }
    return `${u.pathname}${u.search ? `?${u.searchParams.toString()}` : ''}`;
  } catch (error) {
    return url.replace(/[?&](refresh|ts|cacheBust)=[^&]+/g, '').replace(/[?&]+$/, '');
  }
};

const cache = new Map();

export const apiGet = async (url, options = {}) => {
  const normalizedUrl = normalizeApiCacheUrl(url);
  const cacheKey = `${options.method || 'GET'}:${normalizedUrl}`;
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  const response = await fetch(normalizedUrl, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
    ...options,
  });

  const clone = response.clone();
  const json = await clone.json().catch(() => null);
  const payload = { response, json };
  cache.set(cacheKey, payload);
  return payload;
};

export const apiGetJson = async (url, options = {}) => {
  const result = await apiGet(url, options);
  return result.json;
};

export const requestDocumentReload = () => {
  const url = `${API}/documents`;
  return fetch(url, { cache: 'force-cache', headers: { Accept: 'application/json' } });
};
