#!/usr/bin/env node
/**
 * Публикация собранного сайта: work/site-astro/dist → корень репозитория.
 *
 * Корень репозитория = готовый сайт (так устроен FTP-деплой и GitHub Pages),
 * поэтому после `astro build` HTML-файлы копируются в корень.
 *
 * ЗАПРЕТНЫЙ СПИСОК — скрипт никогда не пишет в:
 *   z/, maxbot/, pwa/        — личные/служебные папки (z/ в репо, maxbot и pwa на хостинге);
 *   og/, education/, work/   — OG-картинки (генерирует build.py), учебный раздел, рабочая папка;
 *   robots.txt, sitemap.xml, favicon.ico, apple-touch-icon.png, README.md, .git* —
 *   служебные файлы корня (пока управляются вне Astro, см. work/plan-astro.md, фаза 3).
 *
 * Запуск:  npm run publish   (после npm run build)
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, relative, dirname, sep } from 'node:path';

const ASTRO = new URL('..', import.meta.url).pathname;   // work/site-astro/
const DIST = join(ASTRO, 'dist');
const ROOT = join(ASTRO, '..', '..');                    // корень репозитория

const FORBIDDEN = new Set([
  'z', 'maxbot', 'pwa', 'og', 'education', 'work', 'node_modules', '.git',
]);
const FORBIDDEN_FILES = new Set([
  'robots.txt', 'sitemap.xml', 'favicon.ico', 'apple-touch-icon.png', 'README.md',
]);

function collectHtml(dir) {
  const out = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, name.name);
    if (name.isDirectory()) out.push(...collectHtml(full));
    else if (name.name.endsWith('.html')) out.push(full);
  }
  return out;
}

const files = collectHtml(DIST);
if (!files.length) {
  console.error('ОШИБКА: в dist/ нет HTML-файлов — сначала `npm run build`.');
  process.exit(1);
}

let copied = 0;
for (const file of files) {
  const rel = relative(DIST, file);
  const target = join(ROOT, rel);

  // защита: каждый сегмент пути не должен попадать в запрещённые папки
  const segs = rel.split(sep);
  for (let i = 0; i < segs.length - 1; i++) {
    if (FORBIDDEN.has(segs[i].toLowerCase())) {
      console.error('ОШИБКА: путь ' + rel + ' затрагивает запрещённую папку ' + segs[i] + ' — копирование прервано.');
      process.exit(1);
    }
  }
  if (segs.length === 1 && FORBIDDEN_FILES.has(segs[0])) {
    console.error('ОШИБКА: файл ' + rel + ' в запретном списке — копирование прервано.');
    process.exit(1);
  }

  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, readFileSync(file));
  copied++;
  console.log('  ' + rel);
}
console.log('OK: скопировано ' + copied + ' HTML-файлов в корень репозитория.');
