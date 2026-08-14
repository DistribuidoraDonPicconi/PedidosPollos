// Service Worker mínimo: solo lo necesario para que la app sea
// instalable como PWA. No cachea datos (siempre pide al Apps Script
// online), así el pedido nunca queda desactualizado.
const CACHE_NAME = 'pedidos-pollo-v1';
const ARCHIVOS_CACHE = ['./index.html', './manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ARCHIVOS_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((nombres) =>
      Promise.all(nombres.filter(n => n !== CACHE_NAME).map(n => caches.delete(n)))
    )
  );
  self.clients.claim();
});

// Network-first: siempre intenta traer la versión online; si no hay
// conexión, usa lo último que tenga en caché (solo para el shell de la app).
self.addEventListener('fetch', (event) => {
  if(event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then((resp) => {
        const copia = resp.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copia));
        return resp;
      })
      .catch(() => caches.match(event.request))
  );
});
