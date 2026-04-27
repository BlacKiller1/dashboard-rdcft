/* ═══════════════════════════════════════════════════════════════════════
   service-worker.js
   PWA Service Worker — Dashboard Meteorológico RDCFT
   Estrategia: Cache First para assets estáticos, Network First para API
   ═══════════════════════════════════════════════════════════════════════ */

const CACHE_NAME = 'rdcft-20260427060647' + '{{CACHE_VERSION}}';
const CACHE_OFFLINE = 'rdcft-offline-v1';

// Assets estáticos que se cachean al instalar
const ASSETS_ESTATICOS = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/paisajes.js',
  '/js/weather.js',
  '/js/ui.js',
  '/js/app.js',
  '/js/login.js',
  '/js/map-picker.js',
  '/manifest.json',
];

// Archivos de datos — Network First (siempre intentar red, caché solo offline)
const DATA_PATHS = ['/data/'];

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

  // Archivos de datos → Network First (datos siempre frescos, caché solo offline)
  if (DATA_PATHS.some(p => url.pathname.startsWith(p))) {
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

  // Assets estáticos → Cache First (rápido)
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request).then(response => {
        // Cachear solo respuestas válidas
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Sin red y sin caché → página offline
        if (event.request.destination === 'document') {
          return caches.match('/index.html');
        }
      });
    })
  );
});

/* ── Mensaje de actualización disponible ───────────────────────────── */
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});