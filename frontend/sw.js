// =============================================================================
// ZAMORIN CAFÉ ERP — SERVICE WORKER (PWA & OFFLINE KIOSK ENGINE)
// =============================================================================

const CACHE_VERSION = 'zamorin-pwa-v3.9.2';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const SHELL_CACHE = `${CACHE_VERSION}-shell`;

const PRECACHE_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './src/styles/tokens.css',
  './src/styles/tailwind.css',
  './src/styles/flowbite-integration.css',
  './src/styles/layout.css',
  './src/styles/components.css',
  './src/styles/zamorin.css',
  './src/styles/login2.css',
  './src/assets/zamorin-app-icon-1024.png',
];

// Install: Pre-cache core shell resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => {
      return cache.addAll(PRECACHE_SHELL).catch((err) => {
        console.warn('[SW] Pre-cache partial fail (non-blocking):', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate: Prune stale caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== STATIC_CACHE && key !== SHELL_CACHE).map((key) => {
          return caches.delete(key);
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Strategy-based resource handling
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. Strict Network-Only for all API & Auth requests (Zero caching of sensitive ERP data)
  if (url.pathname.startsWith('/api/') || event.request.headers.has('authorization')) {
    return;
  }

  // 2. Cache-First for Google Fonts & External Static CDNs
  if (url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com') {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // 3. Network-First for application code/config so a deployed POS fix is never
  // hidden behind a stale JavaScript/CSS response. Cache remains an offline fallback.
  if (
    url.origin === self.location.origin &&
    (url.pathname.endsWith('.css') ||
      url.pathname.endsWith('.js') ||
      url.pathname.endsWith('.json'))
  ) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' }).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(event.request, clone));
        }
        return networkResponse;
      }).catch(() => caches.match(event.request))
    );
    return;
  }

  // 4. Cache-First for image assets; these are content-stable and safe to reuse.
  if (
    url.origin === self.location.origin &&
    (url.pathname.endsWith('.webp') ||
      url.pathname.endsWith('.avif') ||
      url.pathname.endsWith('.jpg') ||
      url.pathname.endsWith('.png') ||
      url.pathname.endsWith('.svg'))
  ) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // 5. Network-First with Shell fallback for HTML navigation
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match('./index.html') || caches.match('/index.html');
      })
    );
  }
});

// 6. Update/cache-control messages used by updateManager.js.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (event.data === 'CLEAR_PUBLIC_APP_CACHE') {
    event.waitUntil(
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('zamorin-pwa-'))
            .map((key) => caches.delete(key))
        )
      )
    );
  }
});

// 7. Background Synchronization API Handler (REC-13 / R02-09)
// Feature-detected by browser. Dispatches sync trigger to active client windows without in-memory dependency.
self.addEventListener('sync', (event) => {
  if (event.tag === 'zamorin-pos-queue-sync') {
    event.waitUntil(
      self.clients.matchAll({ type: 'window' }).then((clients) => {
        for (const client of clients) {
          client.postMessage({ type: 'TRIGGER_OFFLINE_SYNC', reason: 'BACKGROUND_SYNC' });
        }
      })
    );
  }
});