// FinanceUber Service Worker — caching mínimo + notificações
const CACHE_NAME = 'financeuber-v1';
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json'
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.all(CORE_ASSETS.map(u => cache.add(u).catch(() => null)))
    )
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Network-first para HTML/JSON, cache-first para o resto
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  const isAsset = /\.(?:png|jpg|jpeg|svg|webp|woff2?|css|js)$/i.test(url.pathname);
  if (isAsset) {
    e.respondWith(caches.match(req).then(c => c || fetch(req).then(r => {
      const copy = r.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
      return r;
    })));
  } else {
    e.respondWith(fetch(req).catch(() => caches.match(req)));
  }
});

// Notificações agendadas via setTimeout dentro do SW (limitação: só funciona enquanto SW estiver ativo)
// Para lembretes confiáveis, o app principal agenda via window.setTimeout + Notification API
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window' }).then(list => {
    for (const c of list) {
      if (c.url.startsWith(location.origin) && 'focus' in c) return c.focus();
    }
    if (clients.openWindow) return clients.openWindow('/');
  }));
});
