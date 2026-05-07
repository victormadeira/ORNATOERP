// Ornato ERP — Service Worker
// Estratégia: shell-first para operadores, network-first para API
const CACHE_VERSION = 'v3';
const CACHE_NAME = `ornato-erp-${CACHE_VERSION}`;

const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
];

// URLs que NUNCA devem ser cacheadas (SSE, WebSocket upgrade, auth)
const NO_CACHE_PATTERNS = [
  /\/api\/ws/,
  /\/api\/notificacoes\/stream/,
  /\/api\/sse/,
];

// Install: pré-cache do shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate: limpar caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('ornato-erp-') && k !== CACHE_NAME)
            .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignorar non-GET e padrões sem cache
  if (request.method !== 'GET') return;
  if (NO_CACHE_PATTERNS.some((p) => p.test(url.pathname))) return;

  // Nunca cachear arquivos internos do Vite dev server (/.vite/, /node_modules/)
  // Esses chunks rotacionam a cada re-pre-bundle e causam duas instâncias de React.
  if (url.pathname.includes('/.vite/') || url.pathname.includes('/node_modules/')) return;

  // API: network-first com fallback de cache (offline graceful)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Assets estáticos com hash (js, css, woff2, etc.): cache-first permanente
  if (/\.(js|css|woff2?|ttf|eot)$/i.test(url.pathname) || url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Imagens públicas: cache-first com network fallback
  if (/\.(png|jpg|jpeg|gif|svg|ico|webp|avif)$/i.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        }).catch(() => new Response('', { status: 404 }));
      })
    );
    return;
  }

  // Navegação HTML: network-first, fallback para index.html (SPA)
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() =>
        caches.match(request)
          .then((cached) => cached || caches.match('/index.html') || caches.match('/'))
      )
  );
});

// Mensagens do cliente (ex: skipWaiting forçado)
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
