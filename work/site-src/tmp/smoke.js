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
  ok(d.querySelectorAll('.pop:not(.sc):not(.case):not(.soon)').length === 9, '9 популярных промптов');
  ok(d.querySelectorAll('.pop.sc').length === 8, 'блок «С чего начать»: 7 шагов + путеводитель');
  const caseCard = d.querySelector('.pop.case');
  ok(!!caseCard && caseCard.getAttribute('href') === 'keis-ii-pochta.html', 'блок «Статьи и кейсы»: карточка кейса');
  ok(d.querySelector('.pop.soon') !== null, 'блок «Статьи и кейсы»: анонс следующей статьи');
  ok([...d.querySelectorAll('.know-nav a')].some(a => a.getAttribute('href') === 'keis-ii-pochta.html'), 'know-nav главной: ссылка «Статьи и кейсы»');
  ok(d.querySelectorAll('.cmp tr').length === 8, 'блок «Какая нейросеть для чего»: таблица 7 задач');
  ok(d.querySelector('.know-nav') !== null, 'know-nav в футере главной');
  ok(d.querySelectorAll('.faq details').length === 6, 'FAQ: 6 вопросов');
  ok(!!d.getElementById('hubQ') && !!d.getElementById('hubRes'), 'глобальный поиск: поле и блок результатов');
  ok(d.getElementById('hubRes').hidden === true, 'глобальный поиск: результаты скрыты на старте');
  ok(d.documentElement.innerHTML.includes('Поиск работает с включённым JavaScript'), 'noscript-заглушка поиска');
  const idxScripts = [...d.querySelectorAll('script')].filter(x=>!x.type && !x.src && !x.textContent.includes('metrika') && !x.textContent.includes('gtag'));
  ok(idxScripts.length === 1 && idxScripts[0].textContent.includes('const SIDX ='), 'главная: единственный доп. скрипт — индекс поиска SIDX (hub.js содержит gtag-обвязку)');
  ok([...d.querySelectorAll('script')].some(x=>!x.src && x.textContent.includes('hubQ')), 'код глобального поиска встроен в главную');
  ok(d.documentElement.innerHTML.includes('googletagmanager.com/gtag/js?id=G-P1BDWZ1D1Q') && d.documentElement.innerHTML.includes("gtag('config', 'G-P1BDWZ1D1Q')"), 'GA4 G-P1BDWZ1D1Q на главной');
  ok(d.body.textContent.includes('Yandex.Metrika counter') || d.documentElement.innerHTML.includes('mc.yandex.ru/metrika/tag.js'), 'счётчик Метрики на главной');
  ok(d.documentElement.innerHTML.includes('yandex.ru/ads/system/ap-loader.js') && d.documentElement.innerHTML.includes('data-page-id="20335162"'), 'автореклама РСЯ: сниппет 20335162 на главной');
  const ld = d.querySelector('script[type="application/ld+json"]');
  ok(!!ld, 'JSON-LD присутствует');
  const src = d.querySelector('details.sources');
  ok(!!src && !src.open, 'источники на главной: спойлер, свёрнут по умолчанию');
  ok(src.querySelectorAll('.sources-grid > div').length === 6, 'в спойлере 6 колонок источников');
  const nav = d.querySelector('.sections-nav');
  ok(nav && nav.querySelectorAll('a').length === 8, 'навигация по 8 адресам');
}

/* ---------- 1b. Глобальный поиск главной: функционально ---------- */
console.log('index.html: глобальный поиск');
{
  const dom = load('index.html');
  const w = dom.window, d = w.document;
  await tick(50);
  const q = d.getElementById('hubQ');
  const res = d.getElementById('hubRes');
  q.value = 'резюме';
  q.dispatchEvent(new w.Event('input', {bubbles:true}));
  await tick(250);
  ok(res.hidden === false, 'результаты показаны после ввода');
  const hrefs = [...res.querySelectorAll('a')].map(a => a.getAttribute('href'));
  ok(hrefs.includes('work.html#p197'), '«резюме» → карточка work.html#p197');
  ok(res.textContent.includes('Найдено'), 'счётчик найденного');
  ok(hrefs.length <= 12, 'не больше 12 результатов');
  /* пустая выдача → empty_search в оба счётчика */
  const dlBefore = w.dataLayer.length, ymBefore = w.ym.a.length;
  q.value = 'квиртинаблг';
  q.dispatchEvent(new w.Event('input', {bubbles:true}));
  await tick(250);
  ok(!!res.querySelector('.hub-empty'), 'бессмысленный запрос → подсказка «ничего не найдено»');
  ok([...w.dataLayer.slice(dlBefore)].some(a => a[0]==='event' && a[1]==='empty_search'), 'GA4: empty_search с хаба');
  ok([...w.ym.a.slice(ymBefore)].some(a => a[1]==='reachGoal' && a[2]==='empty_search'), 'Метрика: empty_search с хаба');
  /* Escape — сброс */
  q.focus();
  d.dispatchEvent(new w.KeyboardEvent('keydown', {key:'Escape', bubbles:true}));
  ok(q.value === '' && res.hidden === true, 'Escape очищает запрос и скрывает результаты');
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

  /* фильтры-ограничения («бесплатно / нужно фото / 5 минут») */
  ok(d.querySelectorAll('#fchips .fchip').length === 1, 'photo: один чип-фильтр (бесплатно и «нужно фото» = 100% раздела — скрыты)');
  const fchipQ = d.querySelector('#fchips .fchip[data-ftag="quick"]');
  ok(!!fchipQ && fchipQ.textContent.includes('24'), 'photo: чип «⚡ 5 минут» со счётчиком 24');
  fchipQ.dispatchEvent(new w.MouseEvent('click', {bubbles:true}));
  ok(d.querySelectorAll('#grid .card').length === 24, 'фильтр «5 минут»: 24 карточки (без фотосессий и серий)');
  ok(fchipQ.getAttribute('aria-pressed') === 'true', 'активный чип-фильтр: aria-pressed=true');
  fchipQ.dispatchEvent(new w.MouseEvent('click', {bubbles:true}));
  ok(d.querySelectorAll('#grid .card').length === 54, 'повторный клик снял фильтр: снова 54');

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
  ok(d.documentElement.innerHTML.includes('yandex.ru/ads/system/ap-loader.js'), 'автореклама РСЯ на разделе');
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

/* ---------- 3b. deep-link по якорю: карточка раскрывается ---------- */
console.log('photo.html#p12');
{
  const dom = load('photo.html', '#p12');
  const w = dom.window, d = w.document;
  await tick(80);
  const c = d.getElementById('p12');
  ok(c.classList.contains('open'), 'якорь #p12: карточка раскрыта (глобальный поиск и статьи ведут на якоря)');
  ok(c.querySelector('.card-head').getAttribute('aria-expanded') === 'true', 'якорь: aria-expanded=true');
}

/* ---------- 4. Разделы без табов ---------- */
for(const [file, expect, pillMin, fchips] of [['generate.html',21,1,1], ['texts.html',21,1,1], ['qwen.html',23,0,2], ['basics.html',6,1,0]]){
  console.log(file);
  const dom = load(file);
  const w = dom.window, d = w.document;
  await tick(50);
  ok(d.querySelectorAll('#grid .card').length === expect, expect + ' карточек');
  ok(d.getElementById('tabs').hidden === true, 'строка табов скрыта (одна категория)');
  ok(d.querySelectorAll('#fchips .fchip').length === fchips, 'чипов-фильтров: ' + fchips);
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
  ok(d.documentElement.innerHTML.includes('G-P1BDWZ1D1Q'), 'GA4 на разделе');
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
  /* фильтры-ограничения life: «нужно фото/файл» 13, «5 минут» 41, комбинация = И (11) */
  const fcP = d.querySelector('#fchips .fchip[data-ftag="photo"]');
  const fcQ = d.querySelector('#fchips .fchip[data-ftag="quick"]');
  ok(!!fcP && fcP.textContent.includes('13'), 'life: чип «📷 Нужно фото/файл» со счётчиком 13');
  ok(!!fcQ && fcQ.textContent.includes('41'), 'life: чип «⚡ 5 минут» со счётчиком 41');
  fcP.dispatchEvent(new w.MouseEvent('click', {bubbles:true}));
  ok(d.querySelectorAll('#grid .card').length === 13, 'фильтр «нужно фото/файл»: 13 карточек');
  fcQ.dispatchEvent(new w.MouseEvent('click', {bubbles:true}));
  ok(d.querySelectorAll('#grid .card').length === 11, 'комбинация двух фильтров (И): 11 карточек');
  fcP.dispatchEvent(new w.MouseEvent('click', {bubbles:true}));
  fcQ.dispatchEvent(new w.MouseEvent('click', {bubbles:true}));
  ok(d.querySelectorAll('#grid .card').length === 56, 'фильтры сняты: снова 56');
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
  /* фильтр «5 минут» в работе: без резюме/карьеры и планов */
  const allTabW = [...d.querySelectorAll('#tabs .tab')].find(t => t.textContent.includes('Все'));
  allTabW.dispatchEvent(new w.MouseEvent('click', {bubbles:true}));
  const fcW = d.querySelector('#fchips .fchip[data-ftag="quick"]');
  ok(!!fcW && fcW.textContent.includes('20'), 'work: чип «⚡ 5 минут» со счётчиком 20');
  fcW.dispatchEvent(new w.MouseEvent('click', {bubbles:true}));
  ok(d.querySelectorAll('#grid .card').length === 20, 'фильтр «5 минут» в работе: 20 карточек');
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
  ok(d.documentElement.innerHTML.includes('G-P1BDWZ1D1Q'), file + ': GA4');
  ok(d.documentElement.innerHTML.includes('mc.yandex.ru/metrika/tag.js?id=114035585'), file + ': Метрика');
  ok(d.documentElement.innerHTML.includes('yandex.ru/ads/system/ap-loader.js'), file + ': автореклама РСЯ');
  ok(d.querySelector('.know-nav') !== null && d.querySelector('footer .sections-nav') !== null, file + ': know-nav и навигация разделов');
  ok(d.querySelector('main nav') !== null && [...d.querySelectorAll('main nav a')].some(a => a.getAttribute('href') === 'index.html'), file + ': навигация с «Главная» вверху страницы');
  for (const [msg, cond] of Object.entries(checks(d))) ok(cond, file + ': ' + msg);
}

/* ---------- 5b. Статья-кейс keis-ii-pochta.html ---------- */
console.log('keis-ii-pochta.html');
{
  const dom = load('keis-ii-pochta.html');
  const w = dom.window, d = w.document;
  await tick(50);
  ok(d.querySelectorAll('h1').length === 1 && d.querySelector('h1').textContent.includes('Сколько часов экономит ИИ'), 'кейс: один h1 «Сколько часов экономит ИИ…»');
  const ldK = JSON.parse(d.querySelector('script[type="application/ld+json"]').textContent);
  const art = ldK['@graph'].find(n => n['@type'] === 'Article');
  ok(!!art && art.headline && art.articleBody, 'кейс: Article с headline и articleBody (контентная аналитика Метрики)');
  ok(!!art && art.author && art.author.name === 'Ediai', 'кейс: автор Organization Ediai');
  ok(ldK['@graph'].some(n => n['@type'] === 'HowTo'), 'кейс: HowTo «Как повторить»');
  ok(d.querySelectorAll('.cmp').length === 2, 'кейс: 2 таблицы (исследования + расчёт)');
  const gsLinks = [...d.querySelectorAll('.gstep a')];
  ok(d.querySelectorAll('.gstep').length === 7, 'кейс: 7 промптов недели');
  ok(gsLinks.every(a => /^work\.html#p\d+$/.test(a.getAttribute('href'))), 'кейс: все ссылки — на карточки work.html#pN');
  const domW = load('work.html');
  const dW = domW.window.document;
  ok(gsLinks.every(a => dW.getElementById(a.getAttribute('href').split('#')[1])), 'кейс: все 7 якорей — реальные карточки раздела «Работа»');
  const srcK = d.querySelector('details.sources');
  ok(!!srcK && !srcK.open, 'кейс: источники — свёрнутый спойлер');
  ok(srcK.querySelectorAll('li').length >= 5, 'кейс: в источниках ≥5 ссылок');
  ok(d.documentElement.innerHTML.includes('G-P1BDWZ1D1Q') && d.documentElement.innerHTML.includes('mc.yandex.ru/metrika/tag.js?id=114035585'), 'кейс: GA4 + Метрика');
  ok(d.documentElement.innerHTML.includes('yandex.ru/ads/system/ap-loader.js'), 'кейс: автореклама РСЯ');
  ok(d.querySelector('link[rel="canonical"]').href.includes('keis-ii-pochta.html'), 'кейс: canonical');
  ok(d.querySelector('.know-nav a[href="keis-ii-pochta.html"]') !== null, 'кейс: know-nav со «Статьи и кейсы»');
  ok(d.querySelector('.art-note') !== null && d.body.textContent.includes('иллюстративный'), 'кейс: расчёт помечен как иллюстративный');
}

/* ---------- 5c. sitemap ---------- */
console.log('sitemap.xml');
{
  const sm = fs.readFileSync(path.join(SITE, 'sitemap.xml'), 'utf8');
  ok((sm.match(/<loc>/g) || []).length === 12, 'sitemap: 12 страниц');
  ok(sm.includes('keis-ii-pochta.html'), 'sitemap: статья-кейс добавлена');
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

console.log('404, favicon, apple-touch-icon');
{
  const h4 = fs.readFileSync(path.join(SITE, '404.html'), 'utf8');
  ok(h4.includes('404 — такой страницы нет'), '404: заголовок на месте');
  ok(/name="robots" content="noindex,follow"/.test(h4), '404: noindex,follow');
  ok(!h4.includes('rel="canonical"'), '404: без canonical (не конкурирует с страницами)');
  ok(h4.includes('href="index.html"') && h4.includes('photo.html'), '404: навигация домой и в разделы');
  ok(h4.includes('metrika/tag.js?id=114035585') && h4.includes('G-P1BDWZ1D1Q'), '404: оба счётчика (видны битые ссылки)');
  const ico = fs.readFileSync(path.join(SITE, 'favicon.ico'));
  ok(ico[0] === 0 && ico[1] === 0 && ico[2] === 1 && ico[3] === 0 && ico.readUInt16LE(4) === 3,
     'favicon.ico: валидный ICO с 3 размерами');
  const ap = fs.readFileSync(path.join(SITE, 'apple-touch-icon.png'));
  ok(ap[1] === 0x50 && ap[2] === 0x4E && ap[3] === 0x47, 'apple-touch-icon.png: валидный PNG');
  const hi = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
  ok(hi.includes('rel="apple-touch-icon"') && hi.includes('/favicon.ico'), 'head: ссылки на иконки на всех страницах');
  const rb = fs.readFileSync(path.join(SITE, 'robots.txt'), 'utf8');
  ok(rb.includes('Disallow: /404.html'), 'robots.txt: 404 закрыта от индекса');
  const sm = fs.readFileSync(path.join(SITE, 'sitemap.xml'), 'utf8');
  ok(!sm.includes('404.html'), 'sitemap.xml: без 404');
}

console.log(fails ? ('\nПРОВАЛЕНО ПРОВЕРОК: ' + fails) : '\nВСЕ ПРОВЕРКИ ПРОЙДЕНЫ');
process.exit(fails ? 1 : 0);
})();
