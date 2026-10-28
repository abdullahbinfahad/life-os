const CACHE = 'life-circle-static-v2';
const CACHE_PREFIX = 'life-circle-static-';
const MAX_NAVIGATION_ENTRIES = 40;
const SCOPE_URL = new URL(self.registration.scope);
const ROOT_URL = new URL('./', SCOPE_URL).href;
const MANIFEST_URL = new URL('asset-manifest.json', SCOPE_URL).href;

function isPrivateOrApi(url) {
  const path = url.pathname.toLowerCase();
  return /\/(?:rest\/v1|auth\/v1|storage\/v1|functions\/v1|graphql\/v1)(?:\/|$)/.test(path)
    || /\/(?:api|oauth|account|private)(?:\/|$)/.test(path);
}

function isCacheableResponse(response) {
  if (!response || !response.ok || response.type === 'opaque') return false;
  const control = response.headers.get('Cache-Control') || '';
  return !/(?:^|,)\s*(?:no-store|private)\b/i.test(control);
}

function isSafeStaticAsset(url) {
  if (url.origin !== SCOPE_URL.origin || !url.pathname.startsWith(SCOPE_URL.pathname) || isPrivateOrApi(url)) return false;
  const relative = url.pathname.slice(SCOPE_URL.pathname.length);
  if (!relative.startsWith('assets/')) return false;
  return /-[A-Za-z0-9_-]{8,}\.(?:js|mjs|css|png|jpe?g|webp|avif|svg|woff2?|ttf|otf)$/i.test(relative);
}

async function cacheManifestAssets(cache) {
  try {
    const response = await fetch(new Request(MANIFEST_URL, { cache: 'reload' }));
    if (!response.ok) return;
    const manifest = await response.json();
    const files = new Set();
    for (const entry of Object.values(manifest || {})) {
      if (!entry || typeof entry !== 'object') continue;
      for (const file of [entry.file, ...(Array.isArray(entry.css) ? entry.css : []), ...(Array.isArray(entry.assets) ? entry.assets : [])]) {
        if (typeof file !== 'string') continue;
        const url = new URL(file, SCOPE_URL);
        if (isSafeStaticAsset(url)) files.add(url.href);
      }
    }
    await Promise.all([...files].map(async (href) => {
      try {
        const response = await fetch(new Request(href, { cache: 'reload' }));
        if (isCacheableResponse(response)) await cache.put(href, response);
      } catch {
        // Optional assets must not block service-worker installation.
      }
    }));
  } catch {
    // A missing or malformed manifest must not block shell installation.
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    try {
      const shell = await fetch(new Request(ROOT_URL, { cache: 'reload' }));
      if (isCacheableResponse(shell)) await cache.put(ROOT_URL, shell);
    } catch {
      // Installation can still complete if the root is unavailable.
    }
    await cacheManifestAssets(cache);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== SCOPE_URL.origin || !url.pathname.startsWith(SCOPE_URL.pathname) || isPrivateOrApi(url)) return;
  // OAuth callbacks and search/share links may carry one-time or personal query data.
  // Let those requests use the browser network without storing the URL in Cache Storage.
  if (url.search) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(new Request(request, { cache: 'reload' }));
        if (isCacheableResponse(response)) {
          const cache = await caches.open(CACHE);
          await cache.put(request, response.clone());
          // Keep exact navigation snapshots bounded; never alias one URL to another.
          const keys = await cache.keys();
          const navigations = keys.filter((key) => {
            const keyUrl = new URL(key.url);
            return keyUrl.origin === SCOPE_URL.origin && keyUrl.pathname.startsWith(SCOPE_URL.pathname) && !isSafeStaticAsset(keyUrl) && keyUrl.pathname !== new URL(MANIFEST_URL).pathname;
          });
          if (navigations.length > MAX_NAVIGATION_ENTRIES) {
            await Promise.all(navigations.slice(0, navigations.length - MAX_NAVIGATION_ENTRIES).map((key) => cache.delete(key)));
          }
        }
        return response;
      } catch {
        return (await caches.match(request)) || (await caches.match(ROOT_URL)) || Response.error();
      }
    })());
    return;
  }

  if (!isSafeStaticAsset(url)) return;
  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (isCacheableResponse(response)) await (await caches.open(CACHE)).put(request, response.clone());
      return response;
    } catch {
      return Response.error();
    }
  })());
});
