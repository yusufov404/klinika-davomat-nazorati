/* eslint-disable no-undef */
/**
 * Service Worker — oflayn ishlash (PWA).
 *
 * Klinikada internet tez-tez uziladi, shuning uchun statik fayllar
 * keshdan beriladi, API so'rovlari esa har doim tarmoqqa boradi.
 *
 * Strategiya:
 *   - ilova fayllari (app.js, app.css, index.html) → NETWORK-FIRST
 *     (yangilanish darhol ko'rinadi, tarmoq yo'q bo'lsa kesh)
 *   - vendor fayllari (alpine, chart.js) → CACHE-FIRST
 *   - /api/* → tarmoqdan (keshlanmaydi)
 *
 * Deploy qilganda CACHE nomini oshirish shart (masalan v2) — eski
 * kesh tozalanadi.
 */
const CACHE = 'klinika-attendance-v2';
const VENDOR = ['/vendor/alpine.min.js?v=3.17.5', '/vendor/chart.umd.js?v=4.4.0', '/manifest.json', '/icons/icon-192.png'];

const APP_SHELL = [
  '/',
  '/index.html',
  '/css/app.css?v=1.1.1',
  '/js/app.js?v=1.1.1',
  ...VENDOR,
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(APP_SHELL.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // API so'rovlari — har doim tarmoqdan
  if (url.pathname.startsWith('/api/')) return;

  // Vendor fayllari — keshdan (tez)
  if (url.pathname.startsWith('/vendor/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
            return response;
          })
      )
    );
    return;
  }

  // Ilova fayllari — avval tarmoq, keyin kesh
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.status === 200) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() =>
        caches.match(request).then((cached) => cached || caches.match('/index.html'))
      )
  );
});
