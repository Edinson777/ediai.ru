/** RSS-лента: гайды ИИ-направления + материалы финансового и цифрового направлений
 *  (этап 1 редизайна). Content Collections (фаза 4) заменит ручной список items. */
import rss from '@astrojs/rss';
import { GUIDES, D, UPDATED } from '../lib/site.js';

const UPDATED_DATE = new Date(D.LASTMOD + 'T12:00:00Z');

/** Новые материалы редизайна: направление, слаг, заголовок, описание. */
const REDESIGN = [
  ['Финансы', '/finansy/podushka-bezopasnosti/',
    'Подушка безопасности: сколько и где держать',
    'Как рассчитать резерв на 3–6 месяцев расходов, где его хранить и как собрать за год без надрыва.'],
  ['Финансы', '/finansy/pds-vklad-nakopitelnyj-schet/',
    'ПДС, вклад или накопительный счёт: как выбрать место для денег',
    'Доступ к деньгам, доходность, господдержка и риски трёх базовых инструментов — таблицей.'],
  ['Финансы', '/finansy/iis-3-nalogovye-lgoty/',
    'ИИС-3: налоговые льготы и что проверить перед открытием счёта',
    'Две льготы сразу, вычет до 52 000 ₽ в год, минимальный срок 5 лет и чек-лист перед открытием.'],
  ['Цифровая жизнь', '/digital/podozritelnoe-soobshchenie/',
    'Как распознать подозрительное сообщение',
    'Три признака мошеннического сообщения, правило одной минуты и план действий, если уже нажали.'],
];

export function GET(context) {
  return rss({
    title: 'EDIAI — разумнее с деньгами. Увереннее с технологиями.',
    description: 'Практический портал о финансах, искусственном интеллекте и цифровой жизни: понятные материалы, инструменты и ' + D.TOTAL + ' готовых промптов для нейросетей.',
    site: context.site,
    items: [
      ...REDESIGN.map(([dir, link, t, d]) => ({
        title: t,
        description: d,
        link,
        pubDate: UPDATED_DATE,
        categories: [dir],
      })),
      ...GUIDES.map(g => ({
        title: g.label,
        // osnovy-promptinga собирается из старой basics-страницы без desc в GUIDES
        description: g.desc || 'Формула промпта: роль, задача, контекст и итерации.',
        link: g.path,
        pubDate: UPDATED_DATE,
        categories: ['ИИ'],
      })),
    ],
    customData: '<language>ru</language>',
    trailingSlash: false,
  });
}
