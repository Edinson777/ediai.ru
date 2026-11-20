#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Верификация фазы 1 переезда на Astro: сравнивает текущие HTML в корне репозитория
(собраны build.py) с выводом Astro (work/site-astro/dist/*.html).

Сравнение нормализованное (пробелы/переносы не важны), по существу:
  1. title, meta description, canonical, og:title/og:image, noindex у 404;
  2. JSON-LD — все блоки application/ld+json как разобранные объекты;
  3. число карточек промптов (article.card) и их идентификаторы;
  4. множество всех ссылок (href) страницы;
  5. видимый текст страницы (get_text, нормализация пробелов);
  6. инлайн-данные для клиента (const PAGE/PROMPTS/SIDX/SECTMETA) — как JS-литералы.

Выход: статус OK / FAIL и список расхождений по каждому файлу.
Запуск:  python3 scripts/verify.py          (из work/site-astro)
"""
import json, os, re, sys
from urllib.parse import unquote
from bs4 import BeautifulSoup

HERE = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(HERE, '..', 'dist')
ROOT = os.path.normpath(os.path.join(HERE, '..', '..', '..'))

PAGES = ['index.html', 'photo.html', 'generate.html', 'texts.html', 'life.html',
         'work.html', 'qwen.html', 'basics.html', 'start.html', 'models.html',
         'glossary.html', 'keis-ii-pochta.html', '404.html']

def norm_text(s):
    return re.sub(r'\s+', ' ', s or '').strip()

def soup_of(path):
    with open(path, encoding='utf-8') as f:
        return BeautifulSoup(f.read(), 'lxml')

def extract_const_js(soup):
    """const X = {...}; из инлайн-скриптов (PAGE/PROMPTS/SIDX/SECTMETA) → {X: obj}."""
    out = {}
    for sc in soup.find_all('script'):
        if sc.get('src') or sc.get('type') not in (None, 'text/javascript', 'module'):
            continue
        txt = sc.string or ''
        for m in re.finditer(r'const (\w+) = ', txt):
            name = m.group(1)
            start = txt.index('=', m.start()) + 1
            # значения — литералы без ';' внутри (JSON-подобные), конец — ';}\n'
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
                out[name] = raw  # сравнение по строке, если не распарсилось
    return out

def norm_node(obj):
    """Нормализация JSON-LD узлов: ключи сортируются рекурсивно."""
    if isinstance(obj, dict):
        return {k: norm_node(obj[k]) for k in sorted(obj)}
    if isinstance(obj, list):
        return [norm_node(x) for x in obj]
    return obj

def compare(name):
    old_path = os.path.join(ROOT, name)
    new_path = os.path.join(DIST, name)
    issues = []
    if not os.path.exists(old_path):
        issues.append('СТАРЫЙ ФАЙЛ НЕ НАЙДЕН в корне репо')
        return issues
    if not os.path.exists(new_path):
        issues.append('НОВЫЙ ФАЙЛ НЕ НАЙДЕН в dist/')
        return issues

    a = soup_of(old_path)
    b = soup_of(new_path)

    def head_attrs(s):
        title = s.title.string if s.title else None
        desc = s.find('meta', attrs={'name': 'description'})
        canon = s.find('link', rel='canonical')
        og_title = s.find('meta', attrs={'property': 'og:title'})
        og_img = s.find('meta', attrs={'property': 'og:image'})
        robots = s.find('meta', attrs={'name': 'robots'})
        return {
            'title': norm_text(title),
            'description': (desc.get('content') if desc else None),
            'canonical': (canon.get('href') if canon else None),
            'og:title': (og_title.get('content') if og_title else None),
            'og:image': (og_img.get('content') if og_img else None),
            'robots': (robots.get('content') if robots else None),
        }
    for key in head_attrs(a):
        va, vb = head_attrs(a)[key], head_attrs(b)[key]
        if va != vb:
            issues.append('head %s: %r → %r' % (key, va, vb))

    # JSON-LD
    ld_a = [norm_node(json.loads(s.string)) for s in a.find_all('script', type='application/ld+json')]
    ld_b = [norm_node(json.loads(s.string)) for s in b.find_all('script', type='application/ld+json')]
    if ld_a != ld_b:
        la = json.dumps(ld_a, ensure_ascii=False, sort_keys=True)
        lb = json.dumps(ld_b, ensure_ascii=False, sort_keys=True)
        i = next((k for k in range(min(len(la), len(lb))) if la[k] != lb[k]), min(len(la), len(lb)))
        issues.append('JSON-LD различается у позиции %d: …%s | …%s' % (i, la[max(0,i-60):i+60], lb[max(0,i-60):i+60]))

    # карточки
    cards_a = [c.get('id') for c in a.select('article.card')]
    cards_b = [c.get('id') for c in b.select('article.card')]
    if cards_a != cards_b:
        issues.append('карточки: %d шт → %d шт (расхождение id)' % (len(cards_a), len(cards_b)))

    # ссылки
    hrefs_a = sorted(set(unquote(x.get('href', '')) for x in a.find_all('a') if x.get('href')))
    hrefs_b = sorted(set(unquote(x.get('href', '')) for x in b.find_all('a') if x.get('href')))
    if hrefs_a != hrefs_b:
        extra = set(hrefs_b) - set(hrefs_a); missing = set(hrefs_a) - set(hrefs_b)
        if extra: issues.append('ссылки лишние: %s' % sorted(extra)[:8])
        if missing: issues.append('ссылки отсутствуют: %s' % sorted(missing)[:8])

    # видимый текст
    ta = norm_text(a.get_text(separator=' '))
    tb = norm_text(b.get_text(separator=' '))
    if ta != tb:
        # поиск первого расхождения
        i = next((k for k in range(min(len(ta), len(tb))) if ta[k] != tb[k]), min(len(ta), len(tb)))
        issues.append('текст различается у позиции %d: …%s | …%s' % (i, ta[max(0,i-50):i+70], tb[max(0,i-50):i+70]))

    # клиентские данные
    da, db = extract_const_js(a), extract_const_js(b)
    for k in sorted(set(da) | set(db)):
        va = json.dumps(da.get(k), ensure_ascii=False, sort_keys=True)
        vb = json.dumps(db.get(k), ensure_ascii=False, sort_keys=True)
        if va != vb:
            i = next((j for j in range(min(len(va), len(vb))) if va[j] != vb[j]), min(len(va), len(vb)))
            issues.append('клиентские данные %s различаются у %d: …%s | …%s' % (k, i, va[max(0,i-40):i+50], vb[max(0,i-40):i+50]))

    return issues

def main():
    total_issues = 0
    for name in PAGES:
        issues = compare(name)
        if issues:
            total_issues += len(issues)
            print('FAIL %s' % name)
            for it in issues:
                print('     - ' + it)
        else:
            print('OK   %s' % name)
    print()
    if total_issues:
        print('ИТОГ: %d расхождений. См. выше.' % total_issues)
        sys.exit(1)
    print('ИТОГ: OK — все %d страниц совпадают с текущими (нормализованно).' % len(PAGES))

if __name__ == '__main__':
    main()
