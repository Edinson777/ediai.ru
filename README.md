# ⚡ Ediai — ИИ в личной жизни и работе (ediai.ru)

Статический многостраничный сайт: **181 готовый промпт и сценарий** для нейросетей в 6 разделах,
плюс гиды и сравнения. Позиционирование главной: «ИИ в личной жизни и работе: 181 готовый промпт,
гиды и сравнения» (число подставляется сборкой).

| Раздел | Файл | Промптов |
|---|---|---|
| 📸 Переделка фото | `photo.html` | 54 |
| 🎨 Создание изображений | `generate.html` | 21 |
| ✍️ Тексты | `texts.html` | 21 |
| 🏡 ИИ в личной жизни | `life.html` | 56 |
| 🤖 Qwen | `qwen.html` | 23 |
| 🧠 Основы промптинга | `basics.html` | 6 |

Особенности: светлая тема, самодостаточные страницы (CSS/JS инлайнятся, 0 внешних запросов,
кроме счётчиков), все карточки отрендерены статически (SEO и работа без JS), JSON-LD
(WebSite, CollectionPage, ItemList, FAQPage + 181 материал `Article` для контентной
аналитики Метрики), WCAG AA, мобильная липкая панель фильтров, deep-link `?q=`,
события `prompt_copy` / `empty_search` в Яндекс.Метрику и Google Analytics 4.

## Структура репозитория

- корень (`index.html`, `*.html`, `og/`, `robots.txt`, `sitemap.xml`) — **готовый к выкладке сайт**;
- `site-src/` — генератор: единый источник данных `data.json`, `build.py` (шаблоны страниц,
  JSON-LD, OG-картинки), `style.css`, `app.js`, `config.json` (домен, счётчики), `sources.json`;
- `site-src/tmp/smoke.js` — функциональные тесты (jsdom), `site-src/tmp/shots.py` — скриншоты и
  замеры вёрстки (Playwright);
- `uploads/` — исходные страницы-доноры, из которых извлечены промпты (история источников).

## Репозиторий и GitHub Pages

- Репозиторий: <https://github.com/Edinson777/ediai.ru> — сайт лежит в корне ветки `main`.
- Зеркало на GitHub Pages: <https://edinson777.github.io/ediai.ru/> — включается один раз:
  Settings → Pages → Deploy from a branch → ветка `main`, папка `/(root)` → Save.
  Основной домен — **ediai.ru**: canonical, OG и sitemap указывают на него; Pages — превью и бэкап.
- Пуш настроен по SSH через deploy-ключ (Settings → Deploy keys, только публичная половина
  добавлена в репозиторий): `git push origin main`.
- Архив для хостинга ediai.ru собирается из корня: все `*.html`, `robots.txt`, `sitemap.xml`, `og/`.

## Сборка

```bash
cd site-src && pip install pillow && python3 build.py     # пересобрать сайт в корень репозитория
cd site-src/tmp && npm install jsdom && node smoke.js     # тесты
```

Подробности, инструкции по целям Метрики и включению GA4 — в `site-src/README.md`.
