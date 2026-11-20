#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Верификация фазы 2 переезда на Astro: сравнивает текущие HTML в корне репозитория
(собраны build.py, старые адреса) с выводом Astro (work/site-astro/dist, новые адреса
/prompty/{slug}/, /guides/{slug}/ и т. д. по URL-конвенции §3.3).

Сравнение нормализованное (пробелы не важны):
  для каждой пары «старая страница → новая»:
    1. title, meta description — совпадают;
    2. canonical новой страницы = https://ediai.ru + новый путь;
    3. JSON-LD: старый граф после замены старых адресов на новые (URL_MAP) равен новому
       графу без BreadcrumbList (крошки — нововведение фазы 2);
    4. карточки промптов (article.card) — те же id в том же порядке;
    5. видимый текст — совпадает;
    6. клиентские данные PAGE/PROMPTS/SIDX/SECTMETA — совпадают (после замены адресов);
    7. в новой странице нет ссылок на старые *.html;
    8. крошки (nav.crumbs) есть на всех страницах, кроме главной и 404.
  новые страницы без старого аналога (/prompty/, /guides/, /instrumenty/, /o-proekte/,
  /politika-konfidencialnosti/): canonical, один h1, крошки, JSON-LD разбирается,
  нет старых ссылок.

Выход: статус OK / FAIL и список расхождений. Запуск: python3 scripts/verify.py
"""
import json, os, re, sys
from bs4 import BeautifulSoup

HERE = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(HERE, '..', 'dist')
ROOT = os.path.normpath(os.path.join(HERE, '..', '..', '..'))
SITE = 'https://ediai.ru'

URL_MAP = {
    'index.html': '/', 'photo.html': '/prompty/foto/', 'life.html': '/prompty/zhizn/',
    'work.html': '/prompty/rabota/', 'texts.html': '/prompty/teksty/',
    'generate.html': '/prompty/generaciya/', 'qwen.html': '/prompty/qwen/',
    'basics.html': '/guides/osnovy-promptinga/', 'start.html': '/guides/s-chego-nachat/',
    'models.html': '/guides/kakuyu-nejroset-vybrat/', 'keis-ii-pochta.html': '/guides/ii-i-pochta/',
    'glossary.html': '/glossary/', 'education/studying-AI.html': '/education/studying-ai/',
}
URL_RE = re.compile(r'(?<![\w-])(' + '|'.join(re.escape(k) for k in URL_MAP) + r')')

def norm_text(s):
    return re.sub(r'\s+', ' ', s or '').strip()

def rewrap(s):
    def repl(m):
        v = URL_MAP[m.group(1)]
        # в абсолютном URL 'https://ediai.ru/start.html' перед именем уже стоит '/'
        if m.start() > 0 and s[m.start() - 1] == '/':
            v = v.lstrip('/')
        return v
    return URL_RE.sub(repl, s)

def soup_of(path):
    with open(path, encoding='utf-8') as f:
        return BeautifulSoup(f.read(), 'lxml')

def extract_const_js(soup):
    out = {}
    for sc in soup.find_all('script'):
        if sc.get('src') or sc.get('type') not in (None, 'text/javascript', 'module'):
            continue
        txt = sc.string or ''
        for m in re.finditer(r'const (\w+) = ', txt):
            name = m.group(1)
            start = txt.index('=', m.start()) + 1
            depth = 0; end = start; instr = False; escp = False
            for i in range(start, len(txt)):
                c = txt[i]
                if instr:
                    if escp: escp = False
                    elif c == '\\': escp = True
                    elif c == '"': instr = False
                    continue
                if c == '"': instr = True
                elif c in '[{(': depth += 1
                elif c in ']})': depth -= 1
                elif c == ';' and depth == 0:
                    end = i; break
            raw = txt[start:end].replace('<\\/', '</')
            try:
                out[name] = json.loads(raw)
            except Exception:
                out[name] = raw
    return out

def norm_urls(obj):
    if isinstance(obj, str): return rewrap(obj)
    if isinstance(obj, dict): return {k: norm_urls(v) for k, v in obj.items()}
    if isinstance(obj, list): return [norm_urls(v) for v in obj]
    return obj

def old_links_ok(soup):
    """В новой странице не должно быть ссылок на старые внутренние *.html.
    Внешние ссылки (другие домены) не проверяются."""
    bad = []
    for a in soup.find_all('a'):
        href = a.get('href') or ''
        if '://' in href and not href.startswith(SITE):
            continue  # внешняя ссылка
        if href.startswith(SITE):
            href = href[len(SITE):]
        m = re.search(r'(?<![\w/-])[\w-]+\.html', href)
        if m:
            bad.append(a.get('href'))
    return bad

PAIRS = [
    # (старый файл в корне, новый путь в dist, новый абсолютный путь)
    ('index.html',          'index.html',                         '/'),
    ('photo.html',          'prompty/foto/index.html',            '/prompty/foto/'),
    ('generate.html',       'prompty/generaciya/index.html',      '/prompty/generaciya/'),
    ('texts.html',          'prompty/teksty/index.html',          '/prompty/teksty/'),
    ('life.html',           'prompty/zhizn/index.html',           '/prompty/zhizn/'),
    ('work.html',           'prompty/rabota/index.html',          '/prompty/rabota/'),
    ('qwen.html',           'prompty/qwen/index.html',            '/prompty/qwen/'),
    ('basics.html',         'guides/osnovy-promptinga/index.html','/guides/osnovy-promptinga/'),
    ('start.html',          'guides/s-chego-nachat/index.html',   '/guides/s-chego-nachat/'),
    ('models.html',         'guides/kakuyu-nejroset-vybrat/index.html', '/guides/kakuyu-nejroset-vybrat/'),
    ('keis-ii-pochta.html', 'guides/ii-i-pochta/index.html',      '/guides/ii-i-pochta/'),
    ('glossary.html',       'glossary/index.html',                '/glossary/'),
]
NEW_PAGES = [
    ('prompty/index.html', '/prompty/'),
    ('guides/index.html', '/guides/'),
    ('instrumenty/index.html', '/instrumenty/'),
    ('o-proekte/index.html', '/o-proekte/'),
    ('politika-konfidencialnosti/index.html', '/politika-konfidencialnosti/'),
    ('poisk/index.html', '/poisk/'),
    ('education/studying-ai/index.html', '/education/studying-ai/'),
]

def strip_chrome(soup):
    """Убирает элементы фазы 2 (шапка, крошки, служебные ссылки) — их нет в старых
    страницах, текст сравнивается без них. У старой главной ещё удаляем hero-логотип."""
    for sel in ('header.site-header', 'nav.crumbs', '.svc-nav', '.sh-burger'):
        for el in soup.select(sel):
            el.decompose()
    for el in soup.select('header.hero .logo'):
        el.decompose()
    return soup

def ld_nodes(soup):
    out = []
    for s in soup.find_all('script', type='application/ld+json'):
        graph = json.loads(s.string)
        nodes = graph.get('@graph', [graph]) if isinstance(graph, dict) else graph
        for n in nodes:
            if n.get('@type') == 'BreadcrumbList':
                continue
            out.append(norm_urls(n))
    return out

def compare_pair(old_file, new_rel, new_path):
    issues = []
    old_path = os.path.join(ROOT, old_file)
    new_abs = os.path.join(DIST, new_rel)
    if not os.path.exists(new_abs):
        return ['новая страница не найдена: ' + new_rel]
    a = soup_of(old_path)
    b = soup_of(new_abs)

    if norm_text(a.title.string) != norm_text(b.title.string):
        issues.append('title: %r → %r' % (a.title.string, b.title.string))
    da = a.find('meta', attrs={'name': 'description'}); db = b.find('meta', attrs={'name': 'description'})
    if (da.get('content') if da else None) != (db.get('content') if db else None):
        issues.append('description различается')
    cb = b.find('link', rel='canonical')
    if not cb or cb.get('href') != SITE + new_path:
        issues.append('canonical: %r (ожидался %s)' % (cb.get('href') if cb else None, SITE + new_path))
    oa = a.find('meta', attrs={'property': 'og:image'}); ob = b.find('meta', attrs={'property': 'og:image'})
    if (oa.get('content') if oa else None) != (ob.get('content') if ob else None):
        issues.append('og:image различается')

    la, lb = ld_nodes(a), ld_nodes(b)
    if json.dumps(la, ensure_ascii=False, sort_keys=True) != json.dumps(lb, ensure_ascii=False, sort_keys=True):
        sa = json.dumps(la, ensure_ascii=False, sort_keys=True); sb = json.dumps(lb, ensure_ascii=False, sort_keys=True)
        i = next((k for k in range(min(len(sa), len(sb))) if sa[k] != sb[k]), min(len(sa), len(sb)))
        issues.append('JSON-LD у %d: …%s | …%s' % (i, sa[max(0,i-70):i+70], sb[max(0,i-70):i+70]))

    cards_a = [c.get('id') for c in a.select('article.card')]
    cards_b = [c.get('id') for c in b.select('article.card')]
    if cards_a != cards_b:
        issues.append('карточки: %d → %d шт (расхождение id)' % (len(cards_a), len(cards_b)))

    # крошки проверяем ДО strip_chrome (он их удаляет вместе с шапкой)
    crumbs_b = b.select_one('nav.crumbs')
    if new_path != '/' and not crumbs_b:
        issues.append('нет хлебных крошек')

    # текст: шапка/крошки/svc — нововведения фазы 2, сравниваем без них;
    # у basics обратная ссылка ведёт в /guides/ («← Все гайды») — допустимое отличие;
    # ссылки на новые хабы добавлены по стратегии §5.2/§5.4 («Главная → все хабы»)
    ALLOWED_ADDITIONS = [' · Карта промптов →', ' · Обзор моделей →']
    ta = norm_text(strip_chrome(a).get_text(separator=' '))
    tb = norm_text(strip_chrome(b).get_text(separator=' '))
    tb = tb.replace('← Все гайды', '← Все разделы')
    for add in ALLOWED_ADDITIONS:
        tb = tb.replace(add, '')
    if ta != tb:
        i = next((k for k in range(min(len(ta), len(tb))) if ta[k] != tb[k]), min(len(ta), len(tb)))
        issues.append('текст у %d: …%s | …%s' % (i, ta[max(0,i-50):i+70], tb[max(0,i-50):i+70]))

    dka, dkb = extract_const_js(a), extract_const_js(b)
    for k in sorted(set(dka) | set(dkb)):
        va = json.dumps(norm_urls(dka.get(k)), ensure_ascii=False, sort_keys=True)
        vb = json.dumps(dkb.get(k), ensure_ascii=False, sort_keys=True)
        if va != vb:
            i = next((j for j in range(min(len(va), len(vb))) if va[j] != vb[j]), min(len(va), len(vb)))
            issues.append('клиентские данные %s у %d: …%s | …%s' % (k, i, va[max(0,i-40):i+50], vb[max(0,i-40):i+50]))

    bad = old_links_ok(b)
    if bad:
        issues.append('старые ссылки остались: %s' % bad[:5])

    return issues

def check_new_page(new_rel, new_path):
    issues = []
    new_abs = os.path.join(DIST, new_rel)
    if not os.path.exists(new_abs):
        return ['страница не найдена: ' + new_rel]
    b = soup_of(new_abs)
    cb = b.find('link', rel='canonical')
    if not cb or cb.get('href') != SITE + new_path:
        issues.append('canonical: %r' % (cb.get('href') if cb else None))
    h1 = b.find_all('h1')
    if len(h1) != 1:
        issues.append('h1: %d шт' % len(h1))
    if not b.select_one('nav.crumbs'):
        issues.append('нет хлебных крошек')
    if not b.find_all('script', type='application/ld+json'):
        issues.append('нет JSON-LD')
    bad = old_links_ok(b)
    if bad:
        issues.append('старые ссылки остались: %s' % bad[:5])
    return issues

def main():
    total = 0
    for old_file, new_rel, new_path in PAIRS:
        issues = compare_pair(old_file, new_rel, new_path)
        if issues:
            total += len(issues)
            print('FAIL %s → %s' % (old_file, new_path))
            for it in issues: print('     - ' + it)
        else:
            print('OK   %s → %s' % (old_file, new_path))
    for new_rel, new_path in NEW_PAGES:
        issues = check_new_page(new_rel, new_path)
        if issues:
            total += len(issues)
            print('FAIL новая %s' % new_path)
            for it in issues: print('     - ' + it)
        else:
            print('OK   новая %s' % new_path)
    # 404: минимальные проверки
    b = soup_of(os.path.join(DIST, '404.html'))
    robots = b.find('meta', attrs={'name': 'robots'})
    if (robots and 'noindex' in robots.get('content', '')
            and not old_links_ok(b) and not b.find('link', rel='canonical')):
        print('OK   404.html (noindex, без canonical, без старых ссылок)')
    else:
        total += 1
        print('FAIL 404.html')

    # фаза 3 (автосервисы): pagefind-индекс, страница /poisk/, rss.xml
    pf_dir = os.path.join(DIST, 'pagefind')
    if os.path.exists(os.path.join(pf_dir, 'pagefind.js')) and os.path.exists(os.path.join(pf_dir, 'pagefind-entry.json')):
        pf_files = sum(len(fs) for _r, _d, fs in os.walk(pf_dir))
        print('OK   pagefind/ (индекс на месте: %d файлов)' % pf_files)
    else:
        total += 1
        print('FAIL pagefind/: нет pagefind.js или pagefind-entry.json — прогоните pagefind --site dist')
    poisk_path = os.path.join(DIST, 'poisk', 'index.html')
    if os.path.exists(poisk_path):
        b = soup_of(poisk_path)
        with open(poisk_path, encoding='utf-8') as f:
            raw = f.read()
        # загрузчик pagefind.js — динамический (pf.src в inline-скрипте, onerror для dev)
        h1 = b.find_all('h1')
        if '/pagefind/pagefind.js' in raw and len(h1) == 1:
            print('OK   /poisk/: загрузчик pagefind.js, один h1')
        else:
            total += 1
            print('FAIL /poisk/: загрузчик=%s, h1=%d' % ('/pagefind/pagefind.js' in raw, len(h1)))
    else:
        total += 1
        print('FAIL /poisk/: страницы нет в dist')
    rss_path = os.path.join(DIST, 'rss.xml')
    import xml.etree.ElementTree as ET
    if os.path.exists(rss_path):
        items = ET.parse(rss_path).getroot().findall('.//item')
        links = [it.findtext('link') or '' for it in items]
        need = {SITE + p for p in ('/guides/s-chego-nachat', '/guides/osnovy-promptinga',
                                   '/guides/kakuyu-nejroset-vybrat', '/guides/ii-i-pochta')}
        if len(items) == 4 and need <= set(links):
            print('OK   rss.xml: 4 гайда, все ссылки на месте')
        else:
            total += 1
            print('FAIL rss.xml: items=%d, недостающие ссылки %s' % (len(items), sorted(need - set(links))))
    else:
        total += 1
        print('FAIL rss.xml: файла нет в dist')
    print()
    if total:
        print('ИТОГ: %d расхождений. См. выше.' % total)
        sys.exit(1)
    print('ИТОГ: OK — фаза 2 собрана корректно.')

if __name__ == '__main__':
    main()
