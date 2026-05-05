/* ═══════════════════════════════════════════════════════════════════════
   service-worker.js
   PWA Service Worker — Dashboard Meteorológico RDCFT
   Estrategia: Network First para HTML (headers CSP siempre frescos),
               Network First para JS/CSS/datos, Cache First para el resto
   ═══════════════════════════════════════════════════════════════════════ */

const CACHE_NAME = 'rdcft-20260505135429';
const CACHE_OFFLINE = 'rdcft-offline-v1';

// Solo manifest para pre-cachear (index.html NUNCA se cachea para que
// los headers HTTP de Vercel —incluido CSP— sean siempre los actuales)
const ASSETS_ESTATICOS = [
  '/manifest.json',
];

// Rutas que siempre van a la red primero
const NETWORK_FIRST_PATHS = ['/js/', '/css/', '/data/'];

/* ── Instalación ───────────────────────────────────────────────────── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll(ASSETS_ESTATICOS).catch(err =>
        console.warn('[SW] Error cacheando assets:', err)
      )
    )
  );
  self.skipWaiting();
});

/* ── Activación: limpiar caches antiguos ─────────────────────────── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME && key !== CACHE_OFFLINE)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

/* ── Fetch ────────────────────────────────────────────────────────── */
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Peticiones cross-origin → no interceptar
  if (url.origin !== location.origin) return;

  // Documentos HTML → Network First (los headers CSP deben venir de Vercel)
  if (event.request.destination === 'document') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // JS, CSS y datos → Network First
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
      }).catch(() => caches.match(event.request));
    })
  );
});

/* ── Mensaje de actualización ─────────────────────────────────────── */
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});
