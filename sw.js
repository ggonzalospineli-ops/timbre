/* Service worker: solo cachea la cáscara para que el panel abra rápido
   y funcione aunque la red esté lenta. Las llamadas siempre necesitan red. */
const CACHE = 'timbreqr-v2';
const ARCHIVOS = [
  './', './index.html', './panel.html', './estilos.css', './config.js',
  './js/ntfy.js', './js/rtc.js', './js/geo.js', './js/timbre.js',
  './js/ui-visitante.js', './js/ui-residente.js',
  './iconos/icono-192.png', './iconos/icono-512.png'
];

self.addEventListener('install', function (ev) {
  ev.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.allSettled(ARCHIVOS.map(function (a) { return c.add(a); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (ev) {
  ev.waitUntil(caches.keys().then(function (claves) {
    return Promise.all(claves.filter(function (k) { return k !== CACHE; })
                             .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (ev) {
  const url = new URL(ev.request.url);
  if (ev.request.method !== 'GET') return;
  if (url.origin !== location.origin) return;   // ntfy siempre va a la red
  ev.respondWith(
    fetch(ev.request)
      .then(function (res) {
        const copia = res.clone();
        caches.open(CACHE).then(function (c) { c.put(ev.request, copia); });
        return res;
      })
      .catch(function () { return caches.match(ev.request); })
  );
});
