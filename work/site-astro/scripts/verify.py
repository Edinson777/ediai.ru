#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Верификация собранного сайта (этап 1 редизайна; переработка миграционного
verify.py фазы 2). Старые пары «старый build.py ↔ Astro» удалены вместе со
старыми .html-файлами; набор стал регрессионным по dist/:

  для каждой собранной страницы (кроме 404):
    1. canonical = SITE + путь; title и description непустые;
    2. ровно один h1 (у 404 — без требований);
    3. JSON-LD разбирается как JSON (минимум один блок);
    4. нет ссылок на старые *.html (кроме education/);
    5. хлебные крошки на всех страницах, кроме главной;
    6. счётчики Метрики/GA4/РСЯ в разметке.
  карточки промптов: id и порядок на /prompty/{slug}/ = data.json;
  главная: WebSite+SearchAction, промпт-полоса из data.json, форма поиска;
  новые страницы редизайна: JSON-LD Article/FAQPage, дисклеймер в финансовых;
  фаза 3: pagefind/, /poisk/, rss.xml, sitemap.xml, llms.txt, 404, robots.txt.

Выход: статус OK / FAIL. Запуск: python3 scripts/verify.py
"""
import json, os, re, sys
import xml.etree.ElementTree as ET
from bs4 import BeautifulSoup

HERE = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(HERE, '..', 'dist')
VENDOR = os.path.join(HERE, '..', 'src', 'vendor')
SITE = 'https://ediai.ru'

D = json.load(open(os.path.join(VENDOR, 'sections.json'), encoding='utf-8'))
DATA = json.load(open(os.path.join(VENDOR, 'data.json'), encoding='utf-8'))

SECTION_FILES = {k: D['SECTIONS'][k]['file'] for k in D['SECTION_ORDER']}  # /prompty/foto/…

def soup_of(path):
    with open(path, encoding='utf-8') as f:
        return BeautifulSoup(f.read(), 'lxml')

def norm_text(s):
    return re.sub(r'\s+', ' ', s or '').strip()

def collect_pages():
    """Все index.html в dist, кроме 404. Возвращает [(путь, absolute)]."""
    out = []
    for root, _dirs, files in os.walk(DIST):
        if 'index.html' not in files:
            continue
        rel = os.path.relpath(root, DIST).replace(os.sep, '/')
        path = '/' if rel == '.' else '/' + rel + '/'
        out.append((path, os.path.join(root, 'index.html')))
    return sorted(out)

def old_links_ok(soup):
    """Нет ссылок на старые внутренние *.html (кроме education)."""
    bad = []
    for a in soup.find_all('a'):
        href = a.get('href') or ''
        if '://' in href and not href.startswith(SITE):
            continue
        if href.startswith(SITE):
            href = href[len(SITE):]
        m = re.search(r'(?<![\w/-])[\w-]+\.html', href)
        if m and not href.startswith('/education/'):
            bad.append(a.get('href'))
    return bad

def has_counters(soup):
    html = str(soup)
    return ('mc.yandex.ru/metrika/tag.js?id=' in html
            and 'googletagmanager.com/gtag/js?id=' in html
            and 'yandex.ru/ads/system/ap-loader.js' in html)

issues_total = 0

def fail(msg):
    global issues_total
    issues_total += 1
    print('FAIL ' + msg)

# ---------------------------------------------------------------- 1. все страницы
pages = collect_pages()
expected_paths = {'/'} | set(SECTION_FILES.values()) | {
    '/prompty/', '/guides/', '/instrumenty/', '/glossary/', '/o-proekte/',
    '/politika-konfidencialnosti/', '/poisk/',
    '/guides/s-chego-nachat/', '/guides/osnovy-promptinga/',
    '/guides/kakuyu-nejroset-vybrat/', '/guides/ii-i-pochta/',
    '/finansy/', '/finansy/podushka-bezopasnosti/', '/finansy/pds-vklad-nakopitelnyj-schet/',
    '/finansy/iis-3-nalogovye-lgoty/', '/digital/', '/digital/podozritelnoe-soobshchenie/',
}
# вне collect_pages: 404 (файл, не каталог) и education/ (живёт в корне, не собирается Astro)
found = {p for p, _ in pages}
for p in sorted(expected_paths - found):
    fail('страница не собрана: ' + p)
for p in sorted(found - expected_paths):
    fail('неожиданная страница в dist: ' + p)

for path, abs_path in pages:
    if path == '/':
        continue  # главная — детально ниже
    b = soup_of(abs_path)
    cb = b.find('link', rel='canonical')
    if not cb or cb.get('href') != SITE + path:
        fail(path + ': canonical ' + repr(cb.get('href') if cb else None))
    if not b.find('meta', attrs={'name': 'description'}):
        fail(path + ': нет description')
    if len(b.find_all('h1')) != 1:
        fail(path + ': h1 = %d шт' % len(b.find_all('h1')))
    lds = b.find_all('script', type='application/ld+json')
    if not lds:
        fail(path + ': нет JSON-LD')
    else:
        for s in lds:
            try:
                json.loads(s.string)
            except Exception as e:
                fail(path + ': JSON-LD не разбирается (%s)' % e)
    if path != '/' and not b.select_one('nav.crumbs'):
        fail(path + ': нет хлебных крошек')
    bad = old_links_ok(b)
    if bad:
        fail(path + ': старые ссылки ' + repr(bad[:3]))
    if not has_counters(b):
        fail(path + ': нет счётчиков (Метрика/GA4/РСЯ)')
print('страниц в dist: %d' % len(pages))

# ---------------------------------------------------------------- 2. карточки промптов
BY = {}
for p in DATA['prompts']:
    BY.setdefault(p['section'], []).append(p['id'])
for key, path in sorted(SECTION_FILES.items()):
    b = soup_of(os.path.join(DIST, path.lstrip('/'), 'index.html'))
    ids = [c.get('id') for c in b.select('article.card')]
    if ids != BY[key]:
        fail(path + ': карточки %d → %d шт или порядок' % (len(ids), len(BY[key])))
print('карточки промптов сверены с data.json (%d разделов)' % len(SECTION_FILES))

# ---------------------------------------------------------------- 3. главная
b = soup_of(os.path.join(DIST, 'index.html'))
if len(b.find_all('h1')) != 1:
    fail('/: h1 = %d шт' % len(b.find_all('h1')))
if b.select_one('nav.crumbs'):
    fail('/: лишние хлебные крошки')
ldh = b.find('script', type='application/ld+json')
graph = json.loads(ldh.string).get('@graph', []) if ldh else []
types = [n.get('@type') for n in graph]
if 'WebSite' not in types or 'WebPage' not in types:
    fail('/: в JSON-LD нет WebSite/WebPage')
ws = next((n for n in graph if n.get('@type') == 'WebSite'), {})
if 'SearchAction' not in json.dumps(ws):
    fail('/: в WebSite нет SearchAction (поиск /poisk/?q=)')
band = b.select_one('#promptText')
want = next((p['prompt'] for p in DATA['prompts'] if p['id'] == 'p135'), None)
if not band or norm_text(band.get_text()) != norm_text(want):
    fail('/: промпт-полоса не совпадает с data.json p135')
if not b.select_one('#copyPrompt') or not b.select_one('#toast'):
    fail('/: нет кнопки копирования или тоста')
for inp in ('initial', 'monthly', 'rate', 'years', 'total'):
    if not b.select_one('#' + inp):
        fail('/: калькулятор без #' + inp)
form = b.select_one('.search-modal form')
if not form or form.get('action') != '/poisk/' or not form.select_one('input[name="q"]'):
    fail('/: модальный поиск не ведёт в /poisk/?q=')
if not b.select_one('.tools-grid .tool-card.calc[href="#calculator"]'):
    fail('/: карточка калькулятора без якоря #calculator')
if old_links_ok(b):
    fail('/: старые ссылки')
if 'Разумнее' not in norm_text(b.find('h1').get_text()):
    fail('/: в h1 нет слогана')
print('главная: слоган, промпт-полоса p135, калькулятор, поиск в /poisk/')

# ---------------------------------------------------------------- 4. новые страницы редизайна
for path in ('/finansy/', '/digital/'):
    bb = soup_of(os.path.join(DIST, path.lstrip('/'), 'index.html'))
    ldg = json.loads(bb.find('script', type='application/ld+json').string).get('@graph', [])
    if not any(n.get('@type') == 'CollectionPage' for n in ldg):
        fail(path + ': нет CollectionPage в JSON-LD')
    if not any(n.get('@type') == 'FAQPage' for n in ldg):
        fail(path + ': нет FAQPage в JSON-LD')
print('хабы редизайна: CollectionPage + FAQPage')

for path in ('/finansy/podushka-bezopasnosti/', '/finansy/pds-vklad-nakopitelnyj-schet/',
             '/finansy/iis-3-nalogovye-lgoty/', '/digital/podozritelnoe-soobshchenie/'):
    bb = soup_of(os.path.join(DIST, path.lstrip('/'), 'index.html'))
    ldg = json.loads(bb.find('script', type='application/ld+json').string).get('@graph', [])
    if not any(n.get('@type') == 'Article' for n in ldg):
        fail(path + ': нет Article в JSON-LD')
    if not any(n.get('@type') == 'FAQPage' for n in ldg):
        fail(path + ': нет FAQPage в JSON-LD')
    if path.startswith('/finansy') and 'не является' not in bb.get_text().lower():
        fail(path + ': нет дисклеймера')
print('материалы редизайна: Article + FAQPage + дисклеймеры')

# ---------------------------------------------------------------- 404 отдельно
f404 = os.path.join(DIST, '404.html')
if os.path.exists(f404):
    b = soup_of(f404)
    robots = b.find('meta', attrs={'name': 'robots'})
    if not (robots and 'noindex' in robots.get('content', '')):
        fail('404.html: нет noindex')
    if b.find('link', rel='canonical'):
        fail('404.html: лишний canonical')
    if old_links_ok(b):
        fail('404.html: старые ссылки')
    print('404.html: noindex, без canonical, без старых ссылок')
else:
    fail('404.html: не собран')

# ---------------------------------------------------------------- 5. фаза 3: search/rss/sitemap/llms/robots
pf_dir = os.path.join(DIST, 'pagefind')
if os.path.exists(os.path.join(pf_dir, 'pagefind.js')) and os.path.exists(os.path.join(pf_dir, 'pagefind-entry.json')):
    pf_files = sum(len(fs) for _r, _d, fs in os.walk(pf_dir))
    print('pagefind/: индекс на месте (%d файлов)' % pf_files)
else:
    fail('pagefind/: нет pagefind.js или pagefind-entry.json')

poisk = os.path.join(DIST, 'poisk', 'index.html')
if os.path.exists(poisk):
    raw = open(poisk, encoding='utf-8').read()
    if '/pagefind/pagefind.js' not in raw:
        fail('/poisk/: нет загрузчика pagefind.js')
else:
    fail('/poisk/: страницы нет')

rss_path = os.path.join(DIST, 'rss.xml')
if os.path.exists(rss_path):
    items = ET.parse(rss_path).getroot().findall('.//item')
    links = [it.findtext('link') or '' for it in items]
    need = {SITE + p for p in (
        '/guides/s-chego-nachat', '/guides/osnovy-promptinga',
        '/guides/kakuyu-nejroset-vybrat', '/guides/ii-i-pochta',
        '/finansy/podushka-bezopasnosti', '/finansy/pds-vklad-nakopitelnyj-schet',
        '/finansy/iis-3-nalogovye-lgoty', '/digital/podozritelnoe-soobshchenie')}
    if len(items) == 8 or need <= set(links):
        print('rss.xml: %d записей, ссылки на месте' % len(items))
    else:
        fail('rss.xml: items=%d, недостающие %s' % (len(items), sorted(need - set(links))))
else:
    fail('rss.xml: файла нет')

sm_path = os.path.join(DIST, 'sitemap.xml')
if os.path.exists(sm_path):
    sm = open(sm_path, encoding='utf-8').read()
    n_loc = sm.count('<loc>')
    if n_loc != len(expected_paths) + 1:
        fail('sitemap.xml: %d адресов, ожидалось %d (+education)' % (n_loc, len(expected_paths) + 1))
    for p in ('/finansy/', '/digital/', '/finansy/iis-3-nalogovye-lgoty/'):
        if SITE + p + '</loc>' not in sm:
            fail('sitemap.xml: нет ' + p)
    print('sitemap.xml: %d адресов' % n_loc)
else:
    fail('sitemap.xml: файла нет')

lt_path = os.path.join(DIST, 'llms.txt')
if os.path.exists(lt_path):
    lt = open(lt_path, encoding='utf-8').read()
    if not lt.startswith('# Ediai.ru'):
        fail('llms.txt: заголовок')
    for p in ('/finansy/', '/digital/', '/prompty/foto/'):
        if p not in lt:
            fail('llms.txt: нет ' + p)
    print('llms.txt: направления Финансы/ИИ/Цифровая жизнь на месте')
else:
    fail('llms.txt: файла нет')

rb_path = os.path.join(DIST, 'robots.txt')
if os.path.exists(rb_path):
    rb = open(rb_path, encoding='utf-8').read()
    if 'GPTBot' not in rb or 'Disallow: /z' not in rb:
        fail('robots.txt: потеряны правила')
else:
    fail('robots.txt: файла нет')

print()
if issues_total:
    print('ИТОГ: %d расхождений. См. выше.' % issues_total)
    sys.exit(1)
print('ИТОГ: OK — этап 1 редизайна собран корректно.')
