/* Смоук-тест собранного сайта в jsdom.
   Запуск: node smoke.js   (из site-src/tmp)
   Фаза 2: адреса /prompty/{slug}/, /guides/{slug}/ и т. д. (URL-конвенция §3.3). */
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

/* ---------- 0. Шапка и хлебные крошки (фаза 2) ---------- */
console.log('шапка и крошки (на prompty/foto)');
{
  const dom = load('prompty/foto/index.html');
  const d = dom.window.document;
  const items = [...d.querySelectorAll('.sh-nav > .sh-item')];
  ok(items.length === 5, 'шапка: 5 пунктов меню');
  const labels = items.map(i => i.querySelector('.sh-link').textContent.trim());
  ok(JSON.stringify(labels) === JSON.stringify(['Промпты','Гайды','Инструменты','Глоссарий','О проекте']),
     'шапка: пункты ' + labels.join(' / '));
  ok(d.querySelectorAll('.sh-nav .sh-item.has-drop').length === 3, 'шапка: дропдауны у 3 разделов');
  ok([...d.querySelectorAll('.sh-nav .sh-drop a[href]')].every(a => !a.getAttribute('href').includes('.html') || a.getAttribute('href').startsWith('/education/')), 'шапка: в дропдаунах нет мёртвых ссылок на *.html');
  ok(d.querySelector('.sh-drop .sh-row[href="/prompty/foto/"]') !== null, 'шапка: 6 категорий промптов с адресами');
  ok(!!d.querySelector('.sh-search input[name="q"]') && d.querySelector('.sh-search').getAttribute('action') === '/', 'шапка: поиск — форма GET на главную');
  ok(!!d.querySelector('.sh-burger') && d.getElementById('shMobile').hidden === true, 'шапка: бургер + скрытая мобильная панель');
  ok(d.querySelectorAll('.sh-macc').length === 3, 'мобильная панель: 3 аккордеона');
  const crumbs = d.querySelectorAll('nav.crumbs li');
  ok(crumbs.length === 3, 'крошки: Главная → Промпты → категория (3 элемента)');
  ok(crumbs[0].querySelector('a').getAttribute('href') === '/', 'крошка 1 — главная');
  const ldF = JSON.parse(d.querySelector('script[type="application/ld+json"]').textContent);
  ok(ldF['@graph'].some(n => n['@type'] === 'BreadcrumbList' && n.itemListElement.length === 3), 'BreadcrumbList из 3 узлов в JSON-LD');
  ok(d.querySelector('.sh-item.active .sh-link').textContent === 'Промпты', 'активный раздел подсвечен (aria/класс active)');
}

/* ---------- 1. Главная (редизайн v3): статична, без JS-ошибок ---------- */
console.log('index.html (редизайн)');
{
  const dom = load('index.html');
  const d = dom.window.document;
  ok(d.querySelectorAll('h1').length === 1, 'ровно один <h1>');
  ok(d.querySelector('h1').textContent.includes('Разумнее'), 'h1 — слоган новой концепции');
  ok(d.querySelectorAll('nav.crumbs').length === 0, 'на главной нет хлебных крошек');
  ok([...d.querySelectorAll('header nav a')].every(a => !a.getAttribute('href').includes('#')),
     'шапка редизайна: ссылки на разделы, не на якоря');
  ok(d.querySelector('.hero-actions .btn-dark[href="/finansy/"]') !== null, 'hero: кнопка в /finansy/');
  ok(d.querySelector('.hero-actions .btn-plain[href="/prompty/"]') !== null, 'hero: кнопка в /prompty/');
  ok(d.querySelector('.track.finance[href="/finansy/"]') !== null, 'трек «Финансы» ведёт в хаб');
  ok(d.querySelector('.track.ai[href="/prompty/"]') !== null, 'трек «ИИ» ведёт в базу промптов');
  ok(d.querySelectorAll('.quick').length === 4, '«Цифровая жизнь»: 4 быстрые карточки');
  ok(d.querySelector('.feature-main .text-link[href="/finansy/iis-3-nalogovye-lgoty/"]') !== null, 'редвыбор: ИИС-3 → материал');
  ok(d.querySelector('.ai-story a[href="/guides/s-chego-nachat/"]') !== null, 'редвыбор: ИИ-гайд для начинающих');
  ok(d.querySelector('.digital-story a[href="/digital/podozritelnoe-soobshchenie/"]') !== null, 'редвыбор: безопасность → материал');
  ok(d.querySelectorAll('.tools-grid .tool-card').length === 3, 'bento-инструменты: 3 карточки');
  ok(d.querySelector('.tool-card.calc[href="#calculator"]') !== null, 'инструмент 01 → якорь калькулятора');
  ok(d.querySelector('.newsletter .btn[href="/rss.xml"]') !== null, 'полоса подписки ведёт в RSS');
  ok([...d.querySelectorAll('.footer-links a')].some(a => a.getAttribute('href') === '/finansy/'), 'футер: ссылка на /finansy/');
  ok(d.documentElement.innerHTML.includes('href="/prompty/"'), 'главная ссылается на /prompty/');
  ok(d.documentElement.innerHTML.includes('googletagmanager.com/gtag/js?id=G-P1BDWZ1D1Q'), 'GA4 на главной');
  ok(d.body.textContent.includes('Yandex.Metrika counter') || d.documentElement.innerHTML.includes('mc.yandex.ru/metrika/tag.js'), 'Метрика на главной');
  ok(d.documentElement.innerHTML.includes('yandex.ru/ads/system/ap-loader.js') && d.documentElement.innerHTML.includes('data-page-id="20335162"'), 'автореклама РСЯ на главной');
  ok(d.documentElement.innerHTML.includes('href="/poisk/"') || d.documentElement.innerHTML.includes("action=\"/poisk/\""), 'главная связана со страницей поиска');
  const ld = d.querySelector('script[type="application/ld+json"]');
  ok(!!ld, 'JSON-LD присутствует');
  const graph = JSON.parse(ld.textContent)['@graph'] || [];
  ok(graph.some(n => n['@type'] === 'WebSite') && JSON.stringify(graph).includes('SearchAction'), 'WebSite с SearchAction (поиск /poisk/?q=)');
}

/* ---------- 1b. Главная (редизайн): калькулятор, копирование, поиск ---------- */
console.log('index.html: калькулятор, копирование, модальный поиск');
{
  const dom = load('index.html');
  const w = dom.window, d = w.document;
  await tick(60);
  /* калькулятор: дефолтные значения считаются сразу (7% годовых → месячная ставка 7/1200) */
  const rub = n => new Intl.NumberFormat('ru-RU', {maximumFractionDigits:0}).format(Math.round(n)) + ' ₽';
  const R = 7/1200;
  const total0 = d.getElementById('total').textContent;
  let t = 100000; for (let i = 0; i < 120; i++) t = t * (1 + R) + 10000;
  ok(total0 === rub(t), 'калькулятор: стартовый пересчёт 100000/10000/7%/10 лет = ' + rub(t));
  ok(d.getElementById('paid').textContent.includes('Всего внесено'), 'калькулятор: сумма взносов');
  ok(d.getElementById('growth').textContent.includes('Разница'), 'калькулятор: разница');
  /* ввод новой суммы → пересчёт */
  const years = d.getElementById('years');
  years.value = '20'; years.dispatchEvent(new w.Event('input', {bubbles:true}));
  await tick(30);
  t = 100000; for (let i = 0; i < 240; i++) t = t * (1 + R) + 10000;
  ok(d.getElementById('total').textContent === rub(t), 'калькулятор: пересчёт на 20 лет = ' + rub(t));
  years.value = '10'; years.dispatchEvent(new w.Event('input', {bubbles:true}));
  /* копирование промпта: стабим Clipboard API (jsdom, как в разделе 6) */
  const txt = d.getElementById('promptText').textContent;
  ok(txt.length > 40 && /сценар|накоплен/.test(txt), 'промпт-полоса: реальный запрос из data.json');
  Object.defineProperty(w, 'isSecureContext', {value: true});
  Object.defineProperty(w.navigator, 'clipboard', {value: {writeText: () => Promise.resolve()}});
  d.getElementById('copyPrompt').dispatchEvent(new w.MouseEvent('click', {bubbles:true}));
  await tick(60);
  ok(d.getElementById('toast').classList.contains('show'), 'копирование: тост показан');
  /* модальный поиск: форма ведёт в /poisk/?q=, Escape закрывает */
  d.getElementById('openSearch').dispatchEvent(new w.MouseEvent('click', {bubbles:true}));
  ok(d.getElementById('searchModal').classList.contains('open'), 'поиск: модалка открылась');
  const form = d.querySelector('.search-modal form');
  ok(form.getAttribute('action') === '/poisk/' && form.querySelector('input[name="q"]'), 'поиск: GET-форма на /poisk/ с параметром q');
  ok(d.querySelectorAll('#searchResults a[href^="/"]').length >= 6, 'поиск: подсказки с живыми ссылками');
  d.dispatchEvent(new w.KeyboardEvent('keydown', {key:'Escape', bubbles:true}));
  ok(!d.getElementById('searchModal').classList.contains('open'), 'поиск: Escape закрыл модалку');
  /* мобильное меню */
  d.getElementById('menuBtn').dispatchEvent(new w.MouseEvent('click', {bubbles:true}));
  ok(d.getElementById('mobileNav').classList.contains('open'), 'мобильное меню открывается');
}

/* ---------- 2. Раздел photo: статика + интерактив ---------- */
console.log('prompty/foto');
{
  const dom = load('prompty/foto/index.html');
  const w = dom.window, d = w.document;
  await tick(50);
  ok(d.querySelectorAll('#grid .card').length === 54, '54 карточки отрендерены статически');
  ok(d.querySelectorAll('#grid .card.open').length === 0, 'все карточки свёрнуты на старте');
  ok(d.querySelectorAll('#tabs .tab').length === 6, '6 табов (all + 5 категорий)');
  ok(d.querySelectorAll('#chips .chip').length >= 16, 'чипсы подразделов отрендерены');
  ok(d.getElementById('results').textContent.includes('54'), 'счётчик «Показаны все 54 промпта»');
  ok(d.querySelectorAll('[data-prerendered]').length === 1, 'grid помечен data-prerendered');
  ok(d.querySelectorAll('#grid .card-head[aria-controls]').length === 54, 'у всех 54 карточек aria-controls на тело');
  ok(d.querySelector('link[rel="canonical"]').getAttribute('href') === 'https://ediai.ru/prompty/foto/', 'canonical = /prompty/foto/');

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
  ok(d.querySelector('.skip-link') !== null, 'skip-link присутствует (ровно один)');
  ok(d.querySelectorAll('.skip-link').length === 1, 'skip-link не задублирован');
  ok(d.querySelector('meta[name="description"]') !== null, 'meta description');
  ok(d.querySelector('meta[property="og:image"]') !== null, 'og:image');
  const srcP = d.querySelector('details.sources');
  ok(!!srcP && !srcP.open, 'источники раздела: спойлер, свёрнут');
  ok(d.querySelector('meta[name="theme-color"]').content === '#f3f0e8', 'theme-color светлый (новая палитра, этап 2)');
  ok(d.querySelector('style').textContent.includes('.card-top{display:flex;flex-direction:column'), 'карточка: заголовок 1-й строкой, значки ИИ 2-й');
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
console.log('prompty/foto?q=реставрация');
{
  const dom = load('prompty/foto/index.html', '?q=' + encodeURIComponent('реставрация'));
  const w = dom.window, d = w.document;
  await tick(80);
  ok(d.getElementById('search').value === 'реставрация', 'параметр ?q= подставлен в поиск');
  const n = d.querySelectorAll('#grid .card').length;
  ok(n >= 2 && n < 54, 'выдача по ?q= отфильтрована (' + n + ')');
}

/* ---------- 3b. deep-link по якорю: карточка раскрывается ---------- */
console.log('prompty/foto#p12');
{
  const dom = load('prompty/foto/index.html', '#p12');
  const w = dom.window, d = w.document;
  await tick(80);
  const c = d.getElementById('p12');
  ok(c.classList.contains('open'), 'якорь #p12: карточка раскрыта (глобальный поиск и статьи ведут на якоря)');
  ok(c.querySelector('.card-head').getAttribute('aria-expanded') === 'true', 'якорь: aria-expanded=true');
}

/* ---------- 4. Разделы без табов ---------- */
for(const [file, expect, pillMin, fchips] of [['prompty/generaciya/index.html',21,1,1], ['prompty/teksty/index.html',21,1,1], ['prompty/qwen/index.html',23,0,2], ['guides/osnovy-promptinga/index.html',6,1,0]]){
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
  ok((file==='prompty/teksty/index.html'||file==='guides/osnovy-promptinga/index.html') ? ds===expect : true, 'пилюли DeepSeek: ' + ds);
  const pills = d.querySelectorAll('.qpill').length;
  ok(pillMin ? pills > 0 : pills === 0, 'пилюли совместимости: ' + pills + ' (ожидалось ' + (pillMin? '>0':'0') + ')');
}

/* ---------- 4b. prompty/zhizn — раздел с табами-чипами ---------- */
console.log('prompty/zhizn');
{
  const dom = load('prompty/zhizn/index.html');
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


/* ---------- 4d. prompty/rabota — раздел «ИИ на работе» ---------- */
console.log('prompty/rabota');
{
  const dom = load('prompty/rabota/index.html');
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

/* ---------- 4c. Гайды: s-chego-nachat / kakuyu-nejroset-vybrat / glossary ---------- */
console.log('guides/s-chego-nachat / guides/kakuyu-nejroset-vybrat / glossary');
for (const [file, h1part, checks] of [
  ['guides/s-chego-nachat/index.html', 'Первая неделя с ИИ', d => ({
    '7 шагов-сценариев': d.querySelectorAll('.gstep').length === 7,
    'ссылки ведут на промпты разделов': [...d.querySelectorAll('.gstep a')].every(a => /\?q=/.test(a.getAttribute('href'))),
    'HowTo в JSON-LD': JSON.parse(d.querySelector('script[type="application/ld+json"]').textContent)['@graph'].some(n => n['@type'] === 'HowTo'),
    'крошки: Главная → Гайды → С чего начать': [...d.querySelectorAll('nav.crumbs a')].map(a=>a.getAttribute('href')).join(' ') === '/ /guides/',
  })],
  ['guides/kakuyu-nejroset-vybrat/index.html', 'Какая нейросеть для чего', d => ({
    'таблица: 7 задач': d.querySelectorAll('.cmp tr').length === 8,
    'FAQ: 4 вопроса': d.querySelectorAll('.faq details').length === 4,
    'FAQPage в JSON-LD': JSON.parse(d.querySelector('script[type="application/ld+json"]').textContent)['@graph'].some(n => n['@type'] === 'FAQPage'),
  })],
  ['glossary/index.html', 'Глоссарий терминов ИИ', d => ({
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
  ok(d.querySelector('main nav') !== null && [...d.querySelectorAll('main nav a')].some(a => a.getAttribute('href') === '/'), file + ': навигация с «Главная» вверху страницы');
  for (const [msg, cond] of Object.entries(checks(d))) ok(cond, file + ': ' + msg);
}

/* ---------- 5a. Новые хабы фазы 2 ---------- */
console.log('новые хабы: /prompty/, /guides/, /instrumenty/, /o-proekte/, /politika-konfidencialnosti/');
for (const [file, h1part, extra] of [
  ['prompty/index.html', 'Карта промптов', d => ({
    '6 категорий': d.querySelectorAll('.bento .tile').length === 6,
    'блок материалов': d.querySelectorAll('.pop').length >= 5,
    'FAQ: 3 вопроса': d.querySelectorAll('.faq details').length === 3,
  })],
  ['guides/index.html', 'Гайды по нейросетям', d => ({
    '4 гайда + план обучения': d.querySelectorAll('.pop').length === 5,
  })],
  ['instrumenty/index.html', 'какая нейросеть для какой задачи', d => ({
    '5 моделей': d.querySelectorAll('.pop').length === 5,
    'таблица задач': d.querySelectorAll('.cmp tr').length === 8,
  })],
  ['o-proekte/index.html', 'О проекте', d => ({
    'методика проверки': d.body.textContent.includes('Методика проверки'),
  })],
  ['politika-konfidencialnosti/index.html', 'Политика конфиденциальности', d => ({
    'Метрика и GA4 упомянуты': d.body.textContent.includes('Яндекс.Метрика') && d.body.textContent.includes('Google Analytics 4'),
  })],
]) {
  const dom = load(file);
  const w = dom.window, d = w.document;
  await tick(30);
  ok(d.querySelectorAll('h1').length === 1 && d.querySelector('h1').textContent.toLowerCase().includes(h1part.toLowerCase()), file + ': один h1 «' + h1part + '»');
  ok(d.querySelector('nav.crumbs') !== null, file + ': хлебные крошки');
  const ldN = JSON.parse(d.querySelector('script[type="application/ld+json"]').textContent);
  ok(ldN['@graph'].some(n => n['@type'] === 'BreadcrumbList'), file + ': BreadcrumbList в JSON-LD');
  ok(d.documentElement.innerHTML.includes('mc.yandex.ru/metrika/tag.js?id=114035585'), file + ': Метрика');
  for (const [msg, cond] of Object.entries(extra(d))) ok(cond, file + ': ' + msg);
}

/* ---------- 5b. Гайд-кейс /guides/ii-i-pochta/ ---------- */
console.log('guides/ii-i-pochta');
{
  const dom = load('guides/ii-i-pochta/index.html');
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
  ok(gsLinks.every(a => /^\/prompty\/rabota\/#p\d+$/.test(a.getAttribute('href'))), 'кейс: все ссылки — на карточки /prompty/rabota/#pN');
  const domW = load('prompty/rabota/index.html');
  const dW = domW.window.document;
  ok(gsLinks.every(a => dW.getElementById(a.getAttribute('href').split('#')[1])), 'кейс: все 7 якорей — реальные карточки раздела «Работа»');
  const srcK = d.querySelector('details.sources');
  ok(!!srcK && !srcK.open, 'кейс: источники — свёрнутый спойлер');
  ok(srcK.querySelectorAll('li').length >= 5, 'кейс: в источниках ≥5 ссылок');
  ok(d.documentElement.innerHTML.includes('G-P1BDWZ1D1Q') && d.documentElement.innerHTML.includes('mc.yandex.ru/metrika/tag.js?id=114035585'), 'кейс: GA4 + Метрика');
  ok(d.documentElement.innerHTML.includes('yandex.ru/ads/system/ap-loader.js'), 'кейс: автореклама РСЯ');
  ok(d.querySelector('link[rel="canonical"]').href.includes('/guides/ii-i-pochta/'), 'кейс: canonical');
  ok(d.querySelector('.know-nav a[href="/guides/ii-i-pochta/"]') !== null, 'кейс: know-nav со «Статьи и кейсы»');
  ok(d.querySelector('.art-note') !== null && d.body.textContent.includes('иллюстративный'), 'кейс: расчёт помечен как иллюстративный');
}

/* ---------- 5c. sitemap, llms.txt, .htaccess ---------- */
console.log('sitemap.xml / llms.txt / .htaccess');
{
  const sm = fs.readFileSync(path.join(SITE, 'sitemap.xml'), 'utf8');
  ok((sm.match(/<loc>/g) || []).length === 25, 'sitemap: 25 страниц (19 прежних + 6 новых редизайна)');
  ok(sm.includes('https://ediai.ru/prompty/foto/'), 'sitemap: новый адрес фото-раздела');
  ok(sm.includes('https://ediai.ru/finansy/') && sm.includes('https://ediai.ru/digital/'), 'sitemap: хабы Финансы и Цифровая жизнь');
  ok(!sm.includes('.html</loc>') || sm.includes('/education/studying-AI.html'), 'sitemap: каталоги, из .html только education');
  const lt = fs.readFileSync(path.join(SITE, 'llms.txt'), 'utf8');
  ok(lt.startsWith('# Ediai.ru'), 'llms.txt: заголовок сайта');
  ok(lt.includes('/finansy/') && lt.includes('/digital/') && lt.includes('/prompty/foto/'), 'llms.txt: три направления на месте');
  ok(lt.includes('54 промпта') && lt.includes('56 промптов') && lt.includes('21 промпт'), 'llms.txt: счётчики со склонением');
  ok(lt.includes('Разумнее с деньгами'), 'llms.txt: слоган новой концепции');
  const ht = fs.readFileSync(path.join(SITE, '.htaccess'), 'utf8');
  ok((ht.match(/^Redirect 301/gm) || []).length === 12, '.htaccess: 12 редиректов со старых адресов');
  ok(/^Redirect 301 \/photo\.html +\/prompty\/foto\/$/m.test(ht), '.htaccess: photo.html → /prompty/foto/');
}

/* ---------- 6. События в счётчики (Метрика + GA4) ---------- */
console.log('события prompt_copy → ym + gtag');
{
  const dom = load('prompty/foto/index.html');
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
  ok(h4.includes('href="/"') && h4.includes('/prompty/foto/'), '404: навигация домой и в разделы');
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
  ok(rb.includes('User-agent: GPTBot') && rb.includes('User-agent: ClaudeBot') && rb.includes('User-agent: PerplexityBot'), 'robots.txt: ИИ-краулеры открыты (GPTBot, ClaudeBot, PerplexityBot)');
  ok(rb.includes('Disallow: /z') && rb.includes('Disallow: /maxbot') && rb.includes('Disallow: /pwa'), 'robots.txt: служебные папки закрыты');
  const sm = fs.readFileSync(path.join(SITE, 'sitemap.xml'), 'utf8');
  ok(!sm.includes('404.html'), 'sitemap.xml: без 404');
}

/* ---------- 7. Фаза 3: поиск /poisk/, pagefind/, rss.xml ---------- */
console.log('фаза 3: /poisk/, pagefind/, rss.xml');
{
  const pk = fs.readFileSync(path.join(SITE, 'poisk', 'index.html'), 'utf8');
  ok(pk.includes("import('/pagefind/pagefind.js')"), 'poisk: загрузчик pagefind.js (import)');
  ok(/<h1>Поиск по сайту<\/h1>/.test(pk), 'poisk: один h1');
  ok(pk.includes('id="psInput"') && pk.includes('id="psResults"'), 'poisk: поле поиска и контейнер результатов');
  ok(pk.includes('rel="canonical" href="https://ediai.ru/poisk/"'), 'poisk: canonical /poisk/');
  ok(/<nav class="crumbs[^"]*"/.test(pk), 'poisk: хлебные крошки');
  ok(pk.includes('application/ld+json'), 'poisk: JSON-LD на месте');
  ok(pk.includes('href="/poisk/">Поиск</a>'), 'poisk: ссылка в своём футере');
  const hub = fs.readFileSync(path.join(SITE, 'prompty/foto/index.html'), 'utf8');
  ok(hub.includes('href="/poisk/">Поиск</a>'), 'футеры: ссылка «Поиск» на страницах');
  ok(hub.includes('rel="alternate" type="application/rss+xml"'), 'head: RSS alternate');
  ok(hub.includes('href="/poisk/">Поиск по сайту</a>'), 'мобильное меню: «Поиск по сайту»');
  ok(fs.existsSync(path.join(SITE, 'pagefind', 'pagefind-entry.json')) && fs.existsSync(path.join(SITE, 'pagefind', 'pagefind.js')),
     'pagefind/: pagefind-entry.json + pagefind.js в корне');
  ok(fs.existsSync(path.join(SITE, 'pagefind', 'fragment')), 'pagefind/: фрагменты индекса');
  const rss = fs.readFileSync(path.join(SITE, 'rss.xml'), 'utf8');
  ok((rss.match(/<item>/g) || []).length === 8, 'rss.xml: 8 записей (4 гайда + 4 материала редизайна)');
  ok(['/guides/s-chego-nachat', '/guides/osnovy-promptinga', '/guides/kakuyu-nejroset-vybrat', '/guides/ii-i-pochta',
      '/finansy/iis-3-nalogovye-lgoty', '/finansy/podushka-bezopasnosti', '/finansy/pds-vklad-nakopitelnyj-schet', '/digital/podozritelnoe-soobshchenie']
      .every(g => rss.includes('https://ediai.ru' + g + '<')), 'rss.xml: ссылки гайдов и материалов');
  ok(rss.includes('<pubDate>'), 'rss.xml: pubDate заполнен');
  const sm3 = fs.readFileSync(path.join(SITE, 'sitemap.xml'), 'utf8');
  ok(sm3.includes('<loc>https://ediai.ru/poisk/</loc>'), 'sitemap: /poisk/ в карте');
}

console.log(fails ? ('\nПРОВАЛЕНО ПРОВЕРОК: ' + fails) : '\nВСЕ ПРОВЕРКИ ПРОЙДЕНЫ');
process.exit(fails ? 1 : 0);
})();
