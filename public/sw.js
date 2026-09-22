const CACHE_NAME = 'ti-hospital-cache-v2';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/css/style.css?v=2',
  '/js/app.js?v=2',
  '/manifest.json',
  '/uploads/logo.png'
];

// Instalação do Service Worker e cache inicial de recursos
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// Ativação e limpeza de caches antigos imediatamente
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Estratégia: Network-First para HTML, CSS e JS (garante visualização imediata das melhorias)
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Não intercepta chamadas de API nem uploads
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/uploads/logo_user_')) {
    return;
  }

  // Network-First para arquivos de interface
  if (
    url.pathname === '/' ||
    url.pathname.endsWith('.html') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.js')
  ) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-First para imagens estáticas e manifest
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return networkResponse;
      });
    })
  );
});
