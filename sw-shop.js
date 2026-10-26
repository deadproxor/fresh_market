/**
 * FreshMarket Shop - Client PWA Service Worker
 * Strategy: Network-First with Cache Fallback for offline resilience
 */

const CACHE_NAME = 'freshmarket-shop-v1.5.8';
const STATIC_ASSETS = [
  './shop.html',
  './privacy-geodata.html',
  './manifest-shop.json',
  './css/components.css',
  './css/shop.css',
  './js/shared/utils.js',
  './js/shared/forms.js',
  './js/shared/i18n.js',
  './js/shop.js',
  './locales/ru.json',
  './locales/ua.json',
  './locales/en.json',
  './locales/fr.json',
  './locales/km.json',
  './data/forms.json',
  './data/products_dictionary.json',
  './assets/icon-192.svg',
  './assets/icon-512.svg',
  './assets/onboarding/slide-1-market.png',
  './assets/onboarding/slide-2-receipt.png',
  './assets/onboarding/slide-3-delivery.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.all(
        STATIC_ASSETS.map((asset) =>
          cache.add(asset).catch((err) => {
            console.warn('[SW-Shop] Pre-cache item failed:', asset, err);
          })
        )
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME && key.startsWith('freshmarket-shop')) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Only handle GET requests within http/https
  if (event.request.method !== 'GET' || !event.request.url.startsWith('http')) return;

  const url = new URL(event.request.url);

  // STRICT ISOLATION: Never intercept admin or workbench requests!
  if (url.pathname.includes('/admin') || url.pathname.includes('components.html')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Clone and cache successful responses for local assets
        if (networkResponse && networkResponse.status === 200 && event.request.url.includes(self.location.origin)) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Offline fallback from cache
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          if (event.request.mode === 'navigate') {
            if (url.pathname === '/' || url.pathname.endsWith('/shop.html') || url.pathname.endsWith('/index.html')) {
              return caches.match('./shop.html');
            }
          }
        });
      })
  );
});
