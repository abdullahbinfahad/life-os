const CACHE = 'life-circle-static-v1';
const SHELL = './';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('life-circle-static-') && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Never cache Supabase, OAuth, or other API/account data.
  if (url.pathname.includes('/rest/v1/') || url.pathname.includes('/auth/v1/') || url.pathname.includes('/storage/v1/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then((response) => {
      if (response.ok) caches.open(CACHE).then((cache) => cache.put(SHELL, response.clone()));
      return response;
    }).catch(async () => (await caches.match(request)) || (await caches.match(SHELL)) || Response.error()));
    return;
  }

  if (/\/(assets\/|icon-|runner-mark|site\.webmanifest|favicon)/.test(url.pathname)) {
    event.respondWith(caches.match(request).then((cached) => {
      const update = fetch(request).then((response) => {
        if (response.ok) caches.open(CACHE).then((cache) => cache.put(request, response.clone()));
        return response;
      }).catch(() => cached || Response.error());
      return cached || update;
    }));
  }
});
