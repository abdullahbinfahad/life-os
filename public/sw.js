const CACHE = 'life-circle-static-v2';
const SHELL = new URL('./', self.location.href).href;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE);
      try { await cache.add(SHELL); } catch { /* The online app must still install when offline storage is unavailable. */ }
    } catch { /* Network remains available even when CacheStorage is disabled. */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('life-circle-static-') && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Never cache Supabase, OAuth, signed-media, or other account/API data.
  if (url.pathname.includes('/rest/v1/') || url.pathname.includes('/auth/v1/') || url.pathname.includes('/storage/v1/')) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      let cache;
      try { cache = await caches.open(CACHE); } catch { /* Continue with network when storage is unavailable. */ }
      try {
        const response = await fetch(request);
        // A query can contain OAuth codes or other transient credentials; never persist it.
        if (cache && response.ok && !url.search) {
          try { await cache.put(request, response.clone()); } catch { /* A cache quota must not block navigation. */ }
        }
        return response;
      } catch {
        if (cache && !url.search) {
          const exactPage = await cache.match(request).catch(() => undefined);
          if (exactPage) return exactPage;
        }
        const shell = cache ? await cache.match(SHELL).catch(() => undefined) : undefined;
        return shell || Response.error();
      }
    })());
    return;
  }

  // Hashed Vite assets are immutable; query-bearing URLs are deliberately network-only.
  if (!url.search && /\/(assets\/|icon-|runner-mark|site\.webmanifest|favicon)/.test(url.pathname)) {
    event.respondWith((async () => {
      let cache;
      try { cache = await caches.open(CACHE); } catch { /* Continue with network when storage is unavailable. */ }
      const cached = cache ? await cache.match(request).catch(() => undefined) : undefined;
      if (cached) {
        const activeCache = cache;
        if (activeCache) void fetch(request).then((response) => {
          if (response.ok) return activeCache.put(request, response.clone()).catch(() => undefined);
        }).catch(() => undefined);
        return cached;
      }
      try {
        const response = await fetch(request);
        if (cache && response.ok) void cache.put(request, response.clone()).catch(() => undefined);
        return response;
      } catch {
        return Response.error();
      }
    })());
  }
});
