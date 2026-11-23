/* Flint — service worker, этап 5 (календарь, подходы, библиотека).
 * Стратегии: навигации и код приложения (js/css/манифест) — СЕТЬ ПЕРВАЯ (после
 * деплоя браузер сразу получает свежую пару HTML+JS; офлайном — кэш);
 * иконки — кэш → сеть. Запросы в /oauth/ не кэшируются никогда (вход, API
 * сессий и Диска). При изменении файлов приложения поднять VERSION — старый
 * кэш заменится целиком, а открытые страницы один раз перезагрузятся
 * (см. controllerchange в js/app.js). */
'use strict';

const VERSION = 'flint-v1.5.1';
const CACHE = `${VERSION}-shell`;

const PRECACHE = [
  './',
  'index.html',
  'css/styles.css',
  'js/db.js',
  'js/app-sync.js',
  'js/journal.js',
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
  if (url.pathname.includes('/oauth/')) return; // вход и API сессий — только сеть, без кэша

  // Код приложения: сначала сеть (свежая версия после деплоя), при офлайне — кэш.
  // Навигации в кэш не кладём: это может быть login.php или ошибка.
  const netFirst = request.mode === 'navigate' || /\.(js|css|webmanifest)(\?|$)/.test(url.pathname);
  if (netFirst) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok && request.mode !== 'navigate') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => request.mode === 'navigate'
          ? caches.match('index.html')
          : caches.match(request))
    );
    return;
  }

  // Остальное (иконки): кэш → сеть; успешный сетевой ответ обновляет кэш
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
