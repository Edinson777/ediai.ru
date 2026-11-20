/** Фаза 3, шаг 5: RSS-лента (@astrojs/rss, план §3 «Автосервисы»).
 *  Лента гайдов; сценарные страницы добавляются в items в фазе 4
 *  (Content Collections, src/content/scenarios/).
 *  Дата: LASTMOD из данных (ISO) — UPDATED текстовый («ноябрь 2026»), в pubDate не годится. */
import rss from '@astrojs/rss';
import { GUIDES, D, UPDATED } from '../lib/site.js';

const UPDATED_DATE = new Date(D.LASTMOD + 'T12:00:00Z');

export function GET(context) {
  return rss({
    title: 'Ediai.ru — гайды и сценарии',
    description: 'Как применять нейросети в личной жизни и работе: гайды, кейсы и сценарные подборки Ediai. ' + D.TOTAL + ' промптов на русском языке.',
    site: context.site,
    items: GUIDES.map(g => ({
      title: g.label,
      // osnovy-promptinga собирается из старой basics-страницы без desc в GUIDES
      description: g.desc || 'Формула промпта: роль, задача, контекст и итерации.',
      link: g.path,
      pubDate: UPDATED_DATE,
    })),
    customData: '<language>ru</language>',
    trailingSlash: false,
  });
}
