// FinanceUber Service Worker — funciona offline + notificações
const CACHE_NAME = 'financeuber-v2';
const CHART_JS = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  CHART_JS
];
// Bibliotecas/fontes de fora que podem ficar em cache (versões fixas)
const CDN_HOSTS = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

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

function putInCache(req, res) {
  if (res && (res.ok || res.type === 'opaque')) {
    const copy = res.clone();
    caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
  }
  return res;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // CDN (Chart.js, fonte Inter): cache primeiro
  if (url.origin !== location.origin) {
    if (!CDN_HOSTS.includes(url.hostname)) return;
    e.respondWith(caches.match(req).then(c => c || fetch(req).then(r => putInCache(req, r))));
    return;
  }

  const isAsset = /\.(?:png|jpg|jpeg|svg|webp|woff2?|css|js)$/i.test(url.pathname) && !url.pathname.endsWith('/sw.js');
  if (isAsset) {
    // Arquivos estáticos: cache primeiro
    e.respondWith(caches.match(req).then(c => c || fetch(req).then(r => putInCache(req, r))));
  } else {
    // Página/JSON: rede primeiro (sempre a versão mais nova), guarda cópia para usar offline
    e.respondWith(
      fetch(req).then(r => putInCache(req, r)).catch(() =>
        caches.match(req, { ignoreSearch: true }).then(c => c || (req.mode === 'navigate' ? caches.match('/') : undefined))
      )
    );
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
