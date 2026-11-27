/* Flint — service worker, v1.7.7 (локальный старт при недоступном сайте).
 * Приложение ВСЕГДА открывается из кэша: навигации и код отдаются мгновенно,
 * сеть используется только для фоновой проверки обновлений. Старт не зависит
 * ни от состояния сайта, ни от ограничений провайдера: заглушки блокировок
 * (HTTP 200 с чужой страницей) в кэш не попадают — каждый ответ перед
 * сохранением проверяется по content-type, а HTML ещё и по текстовому маркеру
 * приложения. Сетевые попытки ограничены таймаутом 4 с. Запросы в /oauth/ не
 * кэшируются никогда (вход, API сессий и Диска). При изменении файлов
 * приложения поднять VERSION — старый кэш заменится целиком, а открытые
 * страницы один раз перезагрузятся (см. controllerchange в js/app.js). */
'use strict';

const VERSION = 'flint-v1.7.9';
const CACHE = `${VERSION}-shell`;
const NET_TIMEOUT = 4000;

const PRECACHE = [
  './',
  'index.html',
  'css/styles.css',
  'js/db.js',
  'js/exercise-db.js',
  'js/app-sync.js',
  'js/journal.js',
  'js/app.js',
  'manifest.webmanifest',
  'img/th/index.json',
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

/* Сеть с таймаутом: зависший или молча отбрасывающий пакеты канал не
 * задерживает обработку ответа дольше 4 секунд. */
function fetchTimeout(request, ms = NET_TIMEOUT) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(request, { signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

/* Тип ресурса оболочки — для проверки content-type ответа. */
function shellType(pathname) {
  if (/\.js(\?|$)/.test(pathname)) return 'js';
  if (/\.css(\?|$)/.test(pathname)) return 'css';
  if (/\.webmanifest(\?|$)/.test(pathname)) return 'manifest';
  return 'html';
}

/* Проверка ответа сети перед сохранением: статус OK и правдоподобный
 * content-type. Заглушки провайдеров отвечают 200 text/html на любой адрес —
 * такой ответ кодом приложения не станет. */
function validResponse(res, type) {
  if (!res || !res.ok) return false;
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  if (type === 'js') return ct.includes('javascript');
  if (type === 'css') return ct.includes('text/css');
  if (type === 'manifest') return ct.includes('json');
  return ct.includes('text/html');
}

/* Текстовый маркер своего index.html — двойная проверка для навигаций. */
function isFlintHtml(text) {
  return text.includes('Flint') && text.includes('screen-day');
}

/* Фоновая проверка обновления: тихо, с таймаутом; любая неудача или
 * «чужой» ответ игнорируются — кэш остаётся как был. */
function revalidate(request, type, htmlCheck) {
  fetchTimeout(request)
    .then(async (res) => {
      if (!validResponse(res, type)) return;
      if (htmlCheck) {
        const text = await res.clone().text();
        if (!isFlintHtml(text)) return;
      }
      const copy = res.clone();
      await caches.open(CACHE).then((c) => c.put(request, copy));
    })
    .catch(() => {});
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return; // POST-эндпоинты (этапы 2–3) — только сеть

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/oauth/')) return; // вход и API сессий — только сеть, без кэша

  /* Навигации: мгновенно из кэша; сеть лишь обновляет кэш в фоне */
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match('index.html')
        .then((cached) => cached || caches.match('./') || fetchTimeout(request))
        .then((res) => {
          revalidate(new Request('index.html'), 'html', true);
          return res;
        })
    );
    return;
  }

  /* Код приложения (js/css/манифест): кэш → сеть, обновление в фоне */
  if (/\.(js|css|webmanifest)(\?|$)/.test(url.pathname)) {
    const type = shellType(url.pathname);
    event.respondWith(
      caches.match(request).then((cached) => {
        revalidate(request, type);
        return cached || fetchTimeout(request);
      })
    );
    return;
  }

  /* Остальное (иконки, json списков картинок, кадры): кэш → сеть; в кэш
   * попадает только ответ с правдоподобным content-type (не заглушка) */
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetchTimeout(request)
        .then((res) => {
          const ct = (res.headers.get('content-type') || '').toLowerCase();
          if (res.ok && !ct.includes('text/html')) {
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
