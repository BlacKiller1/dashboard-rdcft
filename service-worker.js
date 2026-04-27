/* ═══════════════════════════════════════════════════════════════════════
   service-worker.js
   PWA Service Worker — Dashboard Meteorológico RDCFT
   Estrategia: Cache First para assets estáticos, Network First para API
   ═══════════════════════════════════════════════════════════════════════ */

const CACHE_NAME = 'rdcft-20260427101213';
const CACHE_OFFLINE = 'rdcft-offline-v1';

// Solo el shell HTML para offline — los JS/CSS se sirven siempre frescos
const ASSETS_ESTATICOS = [
  '/index.html',
  '/manifest.json',
];

// JS, CSS y datos → Network First (siempre frescos, caché solo offline)
const NETWORK_FIRST_PATHS = ['/js/', '/css/', '/data/'];

// URLs de API — nunca se cachean (siempre red)
const API_URLS = [
  'api.open-meteo.com',
  'accounts.google.com',
  'basemaps.cartocdn.com',
  'server.arcgisonline.com',
];

/* ── Instalación: cachear assets estáticos ─────────────────────────── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS_ESTATICOS).catch(err => {
        console.warn('[SW] Error cacheando assets:', err);
      });
    })
  );
  self.skipWaiting();
});

/* ── Activación: limpiar caches antiguos ───────────────────────────── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME && key !== CACHE_OFFLINE)
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

/* ── Fetch: estrategia por tipo de recurso ─────────────────────────── */
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // API calls → siempre red, sin caché
  if (API_URLS.some(api => url.hostname.includes(api))) {
    event.respondWith(fetch(event.request));
    return;
  }

  // JS, CSS y datos → Network First (siempre frescos, caché solo offline)
  if (NETWORK_FIRST_PATHS.some(p => url.pathname.startsWith(p))) {
    event.respondWith(
      fetch(event.request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => caches.match(event.request))
    );
    return;
  }

  // Resto → Cache First con fallback a red
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        if (event.request.destination === 'document') return caches.match('/index.html');
      });
    })
  );
});

/* ── Mensaje de actualización disponible ───────────────────────────── */
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});