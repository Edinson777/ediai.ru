/* Смоук-тест собранного сайта в jsdom.
   Запуск: node smoke.js   (из site-src/tmp) */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const SITE = path.join(__dirname, '..', '..', '..');
let fails = 0;
function ok(cond, msg){
  if(cond){ console.log('  ✓ ' + msg); }
  else    { console.log('  ✗ FAIL: ' + msg); fails++; }
}

function load(file, query){
  const html = fs.readFileSync(path.join(SITE, file), 'utf8');
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'http://localhost/' + file + (query || ''),
  });
  /* jsdom не реализует matchMedia — стабим, как в реальном браузере */
  if (!dom.window.matchMedia) {
    dom.window.matchMedia = q => ({ matches: false, media: q, onchange: null,
      addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){} });
  }
  return dom;
}
const tick = ms => new Promise(r => setTimeout(r, ms));

(async () => {

/* ---------- 1. Главная: статична, без JS-ошибок ---------- */
console.log('index.html');
{
  const dom = load('index.html');
  const d = dom.window.document;
  ok(d.querySelectorAll('h1').length === 1, 'ровно один <h1>');
  ok(d.querySelectorAll('.tile').length === 7, 'bento: 7 плиток разделов');
  ok(d.querySelector('.tile-big') !== null, 'крупная плитка «Переделка фото»');
  ok(d.querySelector('.tile-life') !== null, 'крупная плитка «ИИ в личной жизни» (tile-life)');
  ok(d.querySelectorAll('.pop:not(.sc)').length === 9, '9 популярных промптов');
  ok(d.querySelectorAll('.pop.sc').length === 8, 'блок «С чего начать»: 7 шагов + путеводитель');
  ok(d.querySelectorAll('.cmp tr').length === 8, 'блок «Какая нейросеть для чего»: таблица 7 задач');
  ok(d.querySelector('.know-nav') !== null, 'know-nav в футере главной');
  ok(d.querySelectorAll('.faq details').length === 6, 'FAQ: 6 вопросов');
  ok([...d.querySelectorAll('script')].filter(x=>!x.type && !x.src && !x.textContent.includes('metrika') && !x.textContent.includes('gtag')).length === 0, 'главная: код только Метрика/GA4 + ld+json');
  ok(d.documentElement.innerHTML.includes('googletagmanager.com/gtag/js?id=G-NXPYMMXH35') && d.documentElement.innerHTML.includes("gtag('config', 'G-NXPYMMXH35')"), 'GA4 G-NXPYMMXH35 на главной');
  ok(d.body.textContent.includes('Yandex.Metrika counter') || d.documentElement.innerHTML.includes('mc.yandex.ru/metrika/tag.js'), 'счётчик Метрики на главной');
  const ld = d.querySelector('script[type="application/ld+json"]');
  ok(!!ld, 'JSON-LD присутствует');
  const src = d.querySelector('details.sources');
  ok(!!src && !src.open, 'источники на главной: спойлер, свёрнут по умолчанию');
  ok(src.querySelectorAll('.sources-grid > div').length === 5, 'в спойлере 5 колонок источников');
  const nav = d.querySelector('.sections-nav');
  ok(nav && nav.querySelectorAll('a').length === 8, 'навигация по 8 адресам');
}

/* ---------- 2. Раздел photo: статика + интерактив ---------- */
console.log('photo.html');
{
  const dom = load('photo.html');
  const w = dom.window, d = w.document;
  await tick(50);
  ok(d.querySelectorAll('#grid .card').length === 54, '54 карточки отрендерены статически');
  ok(d.querySelectorAll('#grid .card.open').length === 0, 'все карточки свёрнуты на старте');
  ok(d.querySelectorAll('#tabs .tab').length === 6, '6 табов (all + 5 категорий)');
  ok(d.querySelectorAll('#chips .chip').length >= 16, 'чипсы подразделов отрендерены');
  ok(d.getElementById('results').textContent.includes('54'), 'счётчик «Показаны все 54 промпта»');
  ok(d.querySelectorAll('[data-prerendered]').length === 1, 'grid помечен data-prerendered');
  ok(d.querySelectorAll('#grid .card-head[aria-controls]').length === 54, 'у всех 54 карточек aria-controls на тело');

  /* гидратация: клик по статической карточке раскрывает её */
  const first = d.querySelector('#grid .card');
  const head = first.querySelector('.card-head');
  head.dispatchEvent(new w.MouseEvent('click', {bubbles:true}));
  ok(first.classList.contains('open'), 'гидратация: клик раскрыл статическую карточку');
  ok(head.getAttribute('aria-expanded') === 'true', 'aria-expanded обновился');
  ok(!!first.querySelector('.card-body .prompt'), 'тело карточки содержит промпт');

  /* фильтр по табу */
  const tabStyle = [...d.querySelectorAll('#tabs .tab')].find(t => t.textContent.includes('Стили'));
  tabStyle.dispatchEvent(new w.MouseEvent('click', {bubbles:true}));
  ok(d.querySelectorAll('#grid .card').length === 14, 'таб «Стили»: 14 карточек');
  ok(d.querySelector('#tabs .tab.active').getAttribute('aria-pressed') === 'true', 'активный таб: aria-pressed=true');

  /* поиск: debounce 150 мс */
  const search = d.getElementById('search');
  search.value = 'акварель';
  search.dispatchEvent(new w.Event('input', {bubbles:true}));
  await tick(250);
  const found = d.querySelectorAll('#grid .card').length;
  ok(found >= 1 && found < 14, 'поиск «акварель» сузил выдачу (' + found + ')');
  ok(d.querySelectorAll('#grid .card.open').length === found, 'при поиске карточки автораскрыты');

  /* «Свернуть все» НЕ очищает поиск (P0-фикс) */
  d.getElementById('collapseAll').dispatchEvent(new w.MouseEvent('click', {bubbles:true}));
  ok(search.value === 'акварель', '«Свернуть все» сохранил строку поиска');
  ok(d.querySelectorAll('#grid .card.open').length === 0, '«Свернуть все» свернул карточки');

  /* чипс подраздела */
  search.value = ''; search.dispatchEvent(new w.Event('input', {bubbles:true}));
  await tick(250);
  const tabAll = [...d.querySelectorAll('#tabs .tab')].find(t => t.textContent.includes('Все промпты'));
  tabAll.dispatchEvent(new w.MouseEvent('click', {bubbles:true}));
  const chip = [...d.querySelectorAll('#chips .chip')].find(c => c.textContent === 'Все подразделы');
  chip.dispatchEvent(new w.MouseEvent('click', {bubbles:true}));
  ok(d.querySelectorAll('#grid .card').length === 54, 'возврат в «Все промпты»: снова 54');

  /* a11y-атрибуты */
  ok(d.getElementById('search').getAttribute('aria-label') !== null, 'search: aria-label');
  ok(d.getElementById('toast').getAttribute('aria-live') === 'polite', 'toast: aria-live=polite');
  ok(d.querySelector('.skip-link') !== null, 'skip-link присутствует');
  ok(d.querySelector('meta[name="description"]') !== null, 'meta description');
  ok(d.querySelector('link[rel="canonical"]') !== null, 'canonical');
  ok(d.querySelector('meta[property="og:image"]') !== null, 'og:image');
  const srcP = d.querySelector('details.sources');
  ok(!!srcP && !srcP.open, 'источники раздела: спойлер, свёрнут');
  ok(d.querySelector('meta[name="theme-color"]').content === '#f5f6fa', 'theme-color светлый');
  ok(d.querySelector('style').textContent.includes('.card-top{display:flex;flex-direction:column'), 'карточка: заголовок 1-й строкой, значки ИИ 2-й');
  ok(d.querySelector('link[rel="canonical"]').href.includes('ediai.ru'), 'canonical = ediai.ru');
  ok(d.documentElement.innerHTML.includes('mc.yandex.ru/metrika/tag.js?id=114035585'), 'Метрика 114035585 на разделе');
  ok(d.documentElement.innerHTML.includes('mc.yandex.ru/watch/114035585'), 'noscript-маячок Метрики');
  const ldP = JSON.parse(d.querySelector('script[type="application/ld+json"]').textContent);
  const arts = ldP['@graph'].filter(n => n['@type'] === 'Article');
  ok(arts.length === 54, 'контентная аналитика: 54 материала Article');
  ok(arts.every(a => a['@id'] && a.headline && a.articleBody), 'у каждого Article есть @id, headline, articleBody');
  ok(arts.every(a => d.getElementById(a['@id'].split('#')[1])), 'фрагменты @id указывают на реальные карточки');

}

/* ---------- 3. deep-link ?q= ---------- */
console.log('photo.html?q=реставрация');
{
  const dom = load('photo.html', '?q=' + encodeURIComponent('реставрация'));
  const w = dom.window, d = w.document;
  await tick(80);
  ok(d.getElementById('search').value === 'реставрация', 'параметр ?q= подставлен в поиск');
  const n = d.querySelectorAll('#grid .card').length;
  ok(n >= 2 && n < 54, 'выдача по ?q= отфильтрована (' + n + ')');
}

/* ---------- 4. Разделы без табов ---------- */
for(const [file, expect, pillMin] of [['generate.html',21,1], ['texts.html',21,1], ['qwen.html',23,0], ['basics.html',6,1]]){
  console.log(file);
  const dom = load(file);
  const w = dom.window, d = w.document;
  await tick(50);
  ok(d.querySelectorAll('#grid .card').length === expect, expect + ' карточек');
  ok(d.getElementById('tabs').hidden === true, 'строка табов скрыта (одна категория)');
  const head = d.querySelector('#grid .card-head');
  head.dispatchEvent(new w.MouseEvent('click', {bubbles:true}));
  ok(d.querySelector('#grid .card').classList.contains('open'), 'гидратация работает');
  const ds = d.querySelectorAll('.dspill').length;
  ok((file==='texts.html'||file==='basics.html') ? ds===expect : true, 'пилюли DeepSeek: ' + ds);
  const pills = d.querySelectorAll('.qpill').length;
  ok(pillMin ? pills > 0 : pills === 0, 'пилюли совместимости: ' + pills + ' (ожидалось ' + (pillMin? '>0':'0') + ')');
}

/* ---------- 4b. life.html — новый раздел с табами ---------- */
console.log('life.html');
{
  const dom = load('life.html');
  const w = dom.window, d = w.document;
  await tick(80);
  ok(d.querySelectorAll('h1').length === 1, 'ровно один <h1>');
  ok(d.querySelectorAll('#grid .card').length === 56, '56 карточек');
  ok(d.getElementById('tabs').hidden === true, 'строка табов скрыта (категории = чипы)');
  ok(d.querySelectorAll('#chips .chip').length === 11, '11 чипов подразделов');
  ok(d.querySelectorAll('.dspill').length === 43, 'пилюли DeepSeek: 43 (текстовые)');
  ok(d.querySelectorAll('.qpill').length === 56, 'пилюли Qwen: 56');
  ok(d.documentElement.innerHTML.includes('G-NXPYMMXH35'), 'GA4 на разделе');
  ok(d.documentElement.innerHTML.includes('mc.yandex.ru/metrika/tag.js?id=114035585'), 'Метрика на разделе');
  const ldL = JSON.parse(d.querySelector('script[type="application/ld+json"]').textContent);
  const artsL = ldL['@graph'].filter(n => n['@type'] === 'Article');
  ok(artsL.length === 56, 'контентная аналитика: 56 материалов Article');
  ok(artsL.every(a => a['@id'] && a.headline && a.articleBody), 'у каждого Article есть @id, headline, articleBody');
  /* фильтр чипом «Финансы» */
  const finChip = [...d.querySelectorAll('#chips .chip')].find(t => t.textContent === 'Финансы');
  finChip.dispatchEvent(new w.MouseEvent('click', {bubbles:true}));
  ok(d.querySelectorAll('#grid .card').length === 6, 'чип «Финансы»: 6 карточек');
  const allChip = [...d.querySelectorAll('#chips .chip')].find(t => t.textContent === 'Все подразделы');
  allChip.dispatchEvent(new w.MouseEvent('click', {bubbles:true}));
  ok(d.querySelectorAll('#grid .card').length === 56, 'возврат в «Все подразделы»: снова 56');
}


/* ---------- 4d. work.html — раздел «ИИ на работе» ---------- */
console.log('work.html');
{
  const dom = load('work.html');
  const w = dom.window, d = w.document;
  await tick(80);
  ok(d.querySelectorAll('h1').length === 1, 'ровно один <h1>');
  ok(d.querySelectorAll('#grid .card').length === 30, '30 карточек');
  ok(d.querySelectorAll('#tabs .tab').length === 7, '7 табов (all + 6 категорий)');
  ok(d.querySelectorAll('.qpill').length === 30 && d.querySelectorAll('.dspill').length === 30, 'пилюли Qwen/DeepSeek: 30/30');
  const ldW = JSON.parse(d.querySelector('script[type="application/ld+json"]').textContent);
  const artsW = ldW['@graph'].filter(n => n['@type'] === 'Article');
  ok(artsW.length === 30, 'контентная аналитика: 30 материалов Article');
  const carTab = [...d.querySelectorAll('#tabs .tab')].find(t => t.textContent.includes('Резюме'));
  carTab.dispatchEvent(new w.MouseEvent('click', {bubbles:true}));
  ok(d.querySelectorAll('#grid .card').length === 5, 'таб «Резюме и карьера»: 5 карточек');
  ok(d.documentElement.innerHTML.includes('Конфиденциальность'), 'полоса о конфиденциальности на месте');
}

/* ---------- 4c. База знаний: start / models / glossary ---------- */
console.log('start.html / models.html / glossary.html');
for (const [file, h1part, checks] of [
  ['start.html', 'Первая неделя с ИИ', d => ({
    '7 шагов-сценариев': d.querySelectorAll('.gstep').length === 7,
    'ссылки ведут на промпты разделов': [...d.querySelectorAll('.gstep a')].every(a => /\?q=/.test(a.getAttribute('href'))),
    'HowTo в JSON-LD': JSON.parse(d.querySelector('script[type="application/ld+json"]').textContent)['@graph'].some(n => n['@type'] === 'HowTo'),
  })],
  ['models.html', 'Какая нейросеть для чего', d => ({
    'таблица: 7 задач': d.querySelectorAll('.cmp tr').length === 8,
    'FAQ: 4 вопроса': d.querySelectorAll('.faq details').length === 4,
    'FAQPage в JSON-LD': JSON.parse(d.querySelector('script[type="application/ld+json"]').textContent)['@graph'].some(n => n['@type'] === 'FAQPage'),
  })],
  ['glossary.html', 'Глоссарий терминов ИИ', d => ({
    '16 терминов': d.querySelectorAll('.term').length === 16,
    'у каждого термина пример': [...d.querySelectorAll('.term')].every(t => t.querySelector('.ex')),
    'DefinedTermSet в JSON-LD': JSON.parse(d.querySelector('script[type="application/ld+json"]').textContent)['@graph'].some(n => n['@type'] === 'DefinedTermSet'),
  })],
]) {
  const dom = load(file);
  const w = dom.window, d = w.document;
  await tick(50);
  ok(d.querySelectorAll('h1').length === 1 && d.querySelector('h1').textContent.includes(h1part), file + ': один h1 «' + h1part + '»');
  ok(d.documentElement.innerHTML.includes('G-NXPYMMXH35'), file + ': GA4');
  ok(d.documentElement.innerHTML.includes('mc.yandex.ru/metrika/tag.js?id=114035585'), file + ': Метрика');
  ok(d.querySelector('.know-nav') !== null && d.querySelector('footer nav') !== null, file + ': know-nav и навигация разделов');
  ok(d.querySelector('main nav') !== null && [...d.querySelectorAll('main nav a')].some(a => a.getAttribute('href') === 'index.html'), file + ': навигация с «Главная» вверху страницы');
  for (const [msg, cond] of Object.entries(checks(d))) ok(cond, file + ': ' + msg);
}

/* ---------- 5. Редиректы ---------- */
console.log('redirects');
{
  const html = fs.readFileSync(path.join(SITE,'prompt-base.html'),'utf8');
  ok(html.includes('location.replace("index.html")'), 'prompt-base.html → index.html');
  const html2 = fs.readFileSync(path.join(SITE,'photo-edit-prompts.html'),'utf8');
  ok(html2.includes('location.replace("photo.html")'), 'photo-edit-prompts.html → photo.html');
}

/* ---------- 6. События в счётчики (Метрика + GA4) ---------- */
console.log('события prompt_copy → ym + gtag');
{
  const dom = load('photo.html');
  const w = dom.window, d = w.document;
  await tick(80);
  /* стабим Clipboard API, чтобы сработал основной путь копирования */
  Object.defineProperty(w, 'isSecureContext', {value: true});
  Object.defineProperty(w.navigator, 'clipboard', {value: {writeText: () => Promise.resolve()}});
  const dlBefore = w.dataLayer.length;
  const ymBefore = w.ym.a.length;
  d.querySelector('#grid .card .copy-btn').dispatchEvent(new w.MouseEvent('click', {bubbles:true}));
  await tick(120);
  const gaEv = [...w.dataLayer.slice(dlBefore)].find(a => a[0]==='event' && a[1]==='prompt_copy');
  const ymEv = [...w.ym.a.slice(ymBefore)].find(a => a[1]==='reachGoal' && a[2]==='prompt_copy');
  ok(!!gaEv, 'GA4: prompt_copy ушёл в dataLayer');
  ok(!!gaEv && gaEv[2] && gaEv[2].section, 'GA4: у события есть параметр section');
  ok(!!ymEv, 'Метрика: reachGoal prompt_copy вызван');
  ok(typeof w.gtag === 'function', 'window.gtag определён сниппетом');
}

console.log(fails ? ('\nПРОВАЛЕНО ПРОВЕРОК: ' + fails) : '\nВСЕ ПРОВЕРКИ ПРОЙДЕНЫ');
process.exit(fails ? 1 : 0);
})();
