const CACHE = 'life-circle-static-v6';
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
  if (!url.search && /\/(assets\/|icon-|lifeos-mark|site\.webmanifest|favicon)/.test(url.pathname)) {
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

/* ---------------- Notifications ---------------- */
// Tapping a notification (or one of its buttons) focuses Life OS and routes to the right page.
self.addEventListener('notificationclick', (event) => {
  const note = event.notification;
  const data = note.data || {};
  const action = event.action || 'open';
  note.close();
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const client = all.find((entry) => entry.url.startsWith(SHELL)) || all[0];
    if (action === 'done' && data.reminderId) {
      if (client) { client.postMessage({ type: 'lifeos-notification', action: 'done', reminderId: data.reminderId }); return; }
      await self.clients.openWindow(`${SHELL}#${data.url || '/'}${(data.url || '').includes('?') ? '&' : '?'}lifeos-done=${encodeURIComponent(data.reminderId)}`);
      return;
    }
    if (client) {
      try { await client.focus(); } catch { /* some browsers refuse focus; still route */ }
      client.postMessage({ type: 'lifeos-notification', action: 'open', url: data.url || '/' });
      return;
    }
    await self.clients.openWindow(`${SHELL}#${data.url || '/'}`);
  })());
});

// Server push (Web Push) — shows whatever the Life OS server sends, even when the app is closed.
self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = { body: event.data ? event.data.text() : '' }; }
  const title = payload.title || 'Life OS';
  event.waitUntil(self.registration.showNotification(title, {
    body: payload.body || '',
    tag: payload.tag || 'lifeos-push',
    icon: `${SHELL}icon-192.png`,
    badge: `${SHELL}notification-badge.png`,
    data: { url: payload.url || '/notifications', reminderId: payload.reminderId },
    vibrate: [120, 60, 120],
    renotify: true,
    actions: payload.reminderId ? [{ action: 'done', title: '✓ Mark done' }, { action: 'open', title: 'Open' }] : [{ action: 'open', title: 'Open' }],
  }));
});
