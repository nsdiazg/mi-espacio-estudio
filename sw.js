/* Service worker: permite usar la app sin conexión. */
const VERSION = 'estudio-app-v3';
const ARCHIVOS_BASE = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Librerías externas: se guardan la primera vez que hay internet.
const CDN = [
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(ARCHIVOS_BASE);
    // Si una CDN falla no debe romper la instalación.
    await Promise.allSettled(CDN.map(url => cache.add(url)));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const claves = await caches.keys();
    await Promise.all(claves.filter(k => k !== VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Nunca cachear Spotify/YouTube ni la cámara.
  if (/spotify|youtube|ytimg/.test(url.hostname)) return;

  // Navegación: red primero, caché si no hay internet.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Resto: caché primero y actualización en segundo plano.
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const enCache = await cache.match(req);
    const red = fetch(req).then(resp => {
      if (resp && resp.status === 200 && (resp.type === 'basic' || resp.type === 'cors')) {
        cache.put(req, resp.clone());
      }
      return resp;
    }).catch(() => null);
    return enCache || (await red) || new Response('Sin conexión', { status: 503 });
  })());
});
