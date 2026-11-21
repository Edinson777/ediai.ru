#!/usr/bin/env node
/**
 * Публикация собранного сайта: work/site-astro/dist → корень репозитория.
 *
 * Корень репозитория = готовый сайт (так устроен FTP-деплой и GitHub Pages),
 * поэтому после `astro build` файлы копируются в корень.
 *
 * Фаза 2: страницы живут в каталогах (dist/prompty/foto/index.html → …),
 * старые .html-файлы из корня УДАЛЯЮТСЯ (сайт не проиндексирован; 301-редиректы
 * на будущее — в .htaccess). robots.txt / sitemap.xml / llms.txt / .htaccess
 * теперь собираются Astro (public/ + gen_meta.py) и публикуются отсюда же.
 *
 * ЗАПРЕТНЫЙ СПИСОК — скрипт никогда не пишет и не удаляет в:
 *   z/, maxbot/, pwa/        — личные/служебные папки (z/ в репо, maxbot и pwa на хостинге);
 *   og/, education/, work/   — OG-картинки (генерирует build.py), учебный раздел, рабочая папка;
 *   favicon.ico, apple-touch-icon.png, README.md, .git* — служебные файлы корня.
 *
 * Запуск:  npm run publish   (после npm run build)
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, unlinkSync, rmSync, existsSync } from 'node:fs';
import { join, relative, dirname, sep } from 'node:path';

const ASTRO = new URL('..', import.meta.url).pathname;   // work/site-astro/
const DIST = join(ASTRO, 'dist');
const ROOT = join(ASTRO, '..', '..');                    // корень репозитория

const FORBIDDEN = new Set([
  'z', 'maxbot', 'pwa', 'og', 'education', 'work', 'node_modules', '.git',
]);
const FORBIDDEN_FILES = new Set([
  'favicon.ico', 'apple-touch-icon.png', 'README.md',
]);
// служебные файлы корня, которые НЕ касаются Astro: никогда не удаляем и не пишем
const KEEP_FILES = new Set([
  'favicon.ico', 'apple-touch-icon.png', 'README.md',
]);

// старые адреса фазы 1: удаляются из корня вместе с переходом на /prompty/{slug}/ и т. д.
const OLD_FILES = [
  'photo.html', 'generate.html', 'texts.html', 'life.html', 'work.html',
  'qwen.html', 'basics.html', 'start.html', 'models.html', 'glossary.html',
  'keis-ii-pochta.html',
];
// index.html и 404.html управляются Astro (переписываются ниже), в список не входят.

function collect(dir) {
  const out = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, name.name);
    if (name.isDirectory()) out.push(...collect(full));
    else out.push(full);
  }
  return out;
}

function guard(rel) {
  // защита: путь не должен затрагивать запрещённые папки и файлы
  const segs = rel.split(sep);
  for (let i = 0; i < segs.length - 1; i++) {
    if (FORBIDDEN.has(segs[i].toLowerCase())) {
      console.error('ОШИБКА: путь ' + rel + ' затрагивает запрещённую папку ' + segs[i] + ' — операция прервана.');
      process.exit(1);
    }
  }
  if (segs.length === 1 && FORBIDDEN_FILES.has(segs[0])) {
    console.error('ОШИБКА: файл ' + rel + ' в запретном списке — операция прервана.');
    process.exit(1);
  }
  if (segs.length === 1 && KEEP_FILES.has(segs[0])) return false;  // пропустить молча
  return true;
}

// ------------------------------------------------------------------ удаление старых файлов
let removed = 0;
for (const name of OLD_FILES) {
  const target = join(ROOT, name);
  if (existsSync(target)) {
    unlinkSync(target);
    removed++;
    console.log('  удалён: ' + name);
  }
}

// ------------------------------------------------------------------ копирование dist → корень
const files = collect(DIST);
if (!files.length) {
  console.error('ОШИБКА: dist/ пуст — сначала `npm run build`.');
  process.exit(1);
}

let copied = 0;
let relinked = 0;

/**
 * Этап-2 правка для зеркала GitHub Pages (project site):
 * зеркало обслуживается по /ediai.ru/, а корнеотносительные ссылки
 * (/guides/…) на нём ведут в корень домена → 404. Переводим внутренние
 * href/src/action в пути ОТНОСИТЕЛЬНО страницы: работает и на ediai.ru
 * (корень домена), и на зеркале (под /ediai.ru/). Внешние абсолютные
 * URL, якоря #, data:-URI и протокол-относительные // не трогаем.
 */
function relativize(html, depth) {
  const prefix = '../'.repeat(depth);
  return html.replace(/(\s(?:href|src|action)=)"(\/[^"]*)"/g, (m, attr, path) => {
    if (path.startsWith('//')) return m;                    // протокол-относительный внешний
    if (path === '/') return `${attr}"${prefix || './'}"`;  // ссылка на корень сайта
    return `${attr}"${prefix}${path.slice(1)}"`;
  });
}

for (const file of files) {
  const rel = relative(DIST, file);
  if (!guard(rel)) continue;
  const target = join(ROOT, rel);
  mkdirSync(dirname(target), { recursive: true });
  let content = readFileSync(file);
  if (rel.endsWith('.html')) {
    const depth = dirname(rel) === '.' ? 0 : rel.split(sep).length - 1;
    const before = content.toString('utf8');
    const after = relativize(before, depth);
    if (after !== before) relinked++;
    content = Buffer.from(after, 'utf8');
  }
  writeFileSync(target, content);
  copied++;
  console.log('  ' + rel);
}
console.log('OK: скопировано ' + copied + ' файлов, ссылки релятивизированы в ' + relinked + ' HTML, удалено старых: ' + removed + '.');
