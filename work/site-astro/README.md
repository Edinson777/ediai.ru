# Astro-сборка ediai.ru (фаза 1: старые адреса)

Генератор сайта на Astro 5. Полностью повторяет вывод `work/site-src/build.py`
(проверяется автоматической верификацией), адреса страниц прежние (`photo.html`, …).
План переезда: [`work/plan-astro.md`](../plan-astro.md).

## Единый источник данных

Данные и стили живут в `work/site-src/` (`data.json`, `sources.json`, `config.json`,
`style.css`, `app.js`, `hub.js`). Перед каждой сборкой скрипт синхронизации копирует
их в `src/vendor/` (не коммитится) и выгружает константы `build.py` в
`src/vendor/sections.json` — импортом из `build.py`, без ручной транскрипции.

## Команды

```bash
cd work/site-astro
npm install          # один раз
npm run build        # vendor-синхронизация + сборка в dist/
npm run publish      # копировать dist/*.html в корень репозитория (сайт готов к деплою)
npm run verify       # сравнить dist с текущими файлами корня (title/JSON-LD/карточки/текст)
npm run dev          # локальный дев-сервер с горячей перезагрузкой
```

После `npm run publish` имеет смысл прогнать смоук-тесты:

```bash
cd ../site-src/tmp && npm install && node smoke.js
```

## Структура

- `src/layouts/Base.astro` — head (SEO/OG/JSON-LD), Метрика, GA4, РСЯ, инлайн CSS;
- `src/templates/SectionPage.astro` — страница-раздел промптов (7 шт., роут `[slug].astro`);
- `src/templates/KnowPage.astro` — каркас «Базы знаний» (start/models/glossary/keis);
- `src/pages/index.astro` — главная-хаб с глобальным поиском (SIDX/SECTMETA + hub.js);
- `src/pages/404.astro` — 404 (noindex);
- `src/lib/gen.js` — порт генерирующих функций build.py (карточки, чипы, фильтры ftags);
- `src/lib/site.js` — константы, счётчики, JSON-LD WebSite, сниппеты Метрики/GA/РСЯ;
- `scripts/dump_data.py` — синхронизация vendor-файлов из work/site-src;
- `scripts/publish.mjs` — публикация dist → корень репо, с ЗАПРЕТНЫМ СПИСКОМ
  (`z/`, `maxbot/`, `pwa/`, `og/`, `education/`, `work/` и служебные файлы не трогаются);
- `scripts/verify.py` — нормализованное сравнение с текущими страницами.

## Что НЕ делает Astro в фазе 1

- `robots.txt`, `sitemap.xml`, `og/*.png`, favicon — собираются как раньше (build.py / руками);
- `education/studying-AI.html` — самостоятельная страница, не переносится;
- адреса страниц не меняются (целевая схема `/prompty/foto/` и т. д. — фаза 2,
  `build.format: 'directory'` в `astro.config.mjs`).
