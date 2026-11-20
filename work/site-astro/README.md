# Astro-сборка ediai.ru (фаза 2: URL-конвенция §3.3)

Генератор сайта на Astro 5. Повторяет контент `work/site-src/build.py` (проверяется
автоматической верификацией), адреса — целевые из стратегии: `/prompty/foto/`,
`/guides/s-chego-nachat/`, `/glossary/`, `/o-proekte/` и т. д. План переезда:
[`work/plan-astro.md`](../plan-astro.md).

## Единый источник данных

Данные и стили живут в `work/site-src/` (`data.json`, `sources.json`, `config.json`,
`style.css`, `app.js`, `hub.js`). Перед каждой сборкой скрипт синхронизации копирует
их в `src/vendor/` (не коммитится), выгружает константы `build.py` в
`src/vendor/sections.json` (импортом из `build.py`, без ручной транскрипции) и
транслирует старые адреса в новые по карте URL-конвенции (KNOW_NAV, баннеры,
источники, POPULAR, KEIS_* конвертируются автоматически).

## Команды

```bash
cd work/site-astro
npm install          # один раз
npm run build        # vendor-синхронизация + astro build + sitemap/llms.txt
npm run publish      # dist → корень репозитория; старые .html удаляются
npm run verify       # сравнить dist со старыми страницами (нормализация URL)
npm run dev          # локальный дев-сервер с горячей перезагрузкой
```

После `npm run publish` прогнать смоук-тесты:

```bash
cd ../site-src/tmp && npm install && node smoke.js
```

## Структура

- `src/layouts/Base.astro` — head (SEO/OG/JSON-LD), шапка из 5 пунктов с дропдаунами
  (§4.1), поиск (GET `/` → `?q=` автоподставляется в поиск хаба), бургер + мобильный
  аккордеон (§4.2), хлебные крошки (§4.3), Метрика/GA4/РСЯ, инлайн CSS;
- `src/styles/chrome.css` — стили шапки/крошек (основной style.css не тронут);
- `src/templates/SectionPage.astro` — страница-раздел (6 промpty-категорий +
  basics-гайд, крошки + BreadcrumbList);
- `src/templates/KnowPage.astro` — каркас гайдов/глоссария;
- `src/pages/prompty/` — карта промптов + роут `[slug].astro` 6 категорий;
- `src/pages/guides/` — хаб + 4 гайда (s-chego-nachat, osnovy-promptinga,
  kakuyu-nejroset-vybrat, ii-i-pochta);
- `src/pages/instrumenty/`, `o-proekte.astro`, `politika-konfidencialnosti.astro` —
  хаб инструментов и вспомогательные страницы (§5.3);
- `src/pages/index.astro`, `404.astro` — главная-хаб и 404;
- `src/lib/gen.js` — порт генерирующих функций build.py; `src/lib/site.js` — меню,
  крошки, JSON-LD, счётчики;
- `public/.htaccess` — 12 редиректов 301 со старых адресов (Apache за Nginx);
- `public/robots.txt` — GPTBot/ClaudeBot/PerplexityBot открыты (приложение стратегии);
- `scripts/gen_meta.py` — sitemap.xml (18 страниц, lastmod) + llms.txt (счётчики из
  данных, со склонением);
- `scripts/publish.mjs` — публикация в корень; ЗАПРЕТНЫЙ СПИСОК: `z/`, `maxbot/`,
  `pwa/`, `og/`, `education/`, `work/`, favicon не трогаются; старые `.html` удаляются;
- `scripts/verify.py` — нормализованное сравнение dist со старыми страницами.

## Что НЕ делает Astro (фаза 2)

- `og/*.png`, favicon — по-прежнему генерируются build.py / лежат в корне;
- `education/studying-AI.html` — самостоятельная страница, не переносится;
- сценарные хабы `/prompty/nejrofotosessiya/` и страницы моделей `/instrumenty/{slug}/`
  — фаза 4 (в меню помечены «готовятся»).
