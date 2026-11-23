/* Flint — service worker, этап 1 (офлайн-журнал).
 * Стратегии: навигации — сеть с фолбэком на кэш (офлайн), ресурсы — кэш с обновлением.
 * При изменении файлов приложения поднять VERSION — кэш заменится целиком. */
'use strict';

const VERSION = 'flint-v1.0.0';
const CACHE = `${VERSION}-shell`;

const PRECACHE = [
  './',
  'index.html',
  'css/styles.css',
  'js/db.js',
  'js/app.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-192.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return; // POST-эндпоинты (этапы 2–3) — только сеть

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Навигации: сначала сеть (свежая версия), при офлайне — кэш приложения
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('index.html', copy));
          return res;
        })
        .catch(() => caches.match('index.html'))
    );
    return;
  }

  // Ресурсы: кэш → сеть; успешный сетевой ответ обновляет кэш
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
