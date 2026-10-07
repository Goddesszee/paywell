const CACHE = 'nan-v1';
const PRECACHE = ['/', '/manifest.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() =>
        caches.match('/').then(r => r || fetch(e.request))
      )
    );
    return;
  }

  e.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(e.request);
      const networkPromise = fetch(e.request).then(res => {
        if (res.ok) cache.put(e.request, res.clone());
        return res;
      });
      return cached || networkPromise;
    })
  );
});

// ── Web Push ──────────────────────────────────────────────────────────────────
// Receives push messages from the server chain watcher and shows a native
// browser notification even when the app tab is closed.

self.addEventListener('push', (e) => {
  if (!e.data) return;

  let data = {};
  try { data = e.data.json(); } catch { data = { title: 'NAN', body: e.data.text() }; }

  const title   = data.title   || 'NAN Payment';
  const body    = data.body    || 'You have a new transaction';
  const txHash  = data.txHash  || '';
  const amount  = data.amount  || '';

  const options = {
    body,
    icon:  '/icon-192.png',
    badge: '/icon-192.png',
    tag:   txHash || `payment-${Date.now()}`,
    renotify: false,
    data: { txHash, amount, url: '/' },
    actions: [
      { action: 'view', title: 'View Activity' },
    ],
  };

  e.waitUntil(self.registration.showNotification(title, options));
});

// When the user taps the notification, open/focus the app and navigate to Activity.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();

  const targetUrl = e.notification.data?.url || '/';

  if (e.action === 'view' || !e.action) {
    e.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
        // If app is already open, focus it
        for (const client of windowClients) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.postMessage({ type: 'PUSH_NAV', view: 'activity' });
            return client.focus();
          }
        }
        // Otherwise open a new tab
        if (clients.openWindow) return clients.openWindow(targetUrl);
      })
    );
  }
});
