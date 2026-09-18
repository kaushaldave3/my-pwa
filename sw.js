/* ======================================================================
   Sabhasad Yadi Directory — offline service worker
   Strategy:
     - Page navigations (HTML): NetworkFirst — always try the network so
       updates reach users, fall back to the cached page when offline.
     - Same-origin static assets: CacheFirst.
     - Cross-origin requests (e.g. the Tailwind CDN): StaleWhileRevalidate.
   Bump CACHE_VERSION whenever index.html changes to force a refresh.
   ====================================================================== */
const CACHE_VERSION = 'yadi-v1';
const PAGE_CACHE = CACHE_VERSION + '-pages';
const ASSET_CACHE = CACHE_VERSION + '-assets';
const CDN_CACHE = CACHE_VERSION + '-cdn';

const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(PAGE_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names
          .filter((name) => name.startsWith('yadi-') && !name.startsWith(CACHE_VERSION))
          .map((name) => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // 1) HTML navigations — NetworkFirst
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(PAGE_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  // 2) Same-origin static assets — CacheFirst
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        });
      })
    );
    return;
  }

  // 3) Cross-origin (Tailwind CDN, fonts) — StaleWhileRevalidate
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok || response.type === 'opaque') {
            const copy = response.clone();
            caches.open(CDN_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
