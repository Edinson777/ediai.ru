# -*- coding: utf-8 -*-
"""Скриншоты новых страниц редизайна + замер горизонтального переполнения.
Запуск: python3 work/site-src/tmp/shots_redesign.py  (Playwright, headless)."""
import os
from playwright.sync_api import sync_playwright

SITE = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
OUT = os.path.join(os.path.dirname(__file__), 'shots-redesign')
os.makedirs(OUT, exist_ok=True)

PAGES = [
    ('index.html',                       'index'),
    ('finansy/index.html',               'finansy'),
    ('finansy/iis-3-nalogovye-lgoty/index.html', 'iis3'),
    ('finansy/pds-vklad-nakopitelnyj-schet/index.html', 'pds'),
    ('finansy/podushka-bezopasnosti/index.html', 'podushka'),
    ('digital/index.html',               'digital'),
    ('digital/podozritelnoe-soobshchenie/index.html', 'phishing'),
]
VIEWPORTS = [(1280, 800, 'desktop'), (700, 900, 'tablet'), (375, 720, 'mobile')]

report = {}
with sync_playwright() as pw:
    browser = pw.chromium.launch()
    for file, name in PAGES:
        for w, h, tag in VIEWPORTS:
            ctx = browser.new_context(viewport={'width': w, 'height': h}, locale='ru-RU')
            pg = ctx.new_page()
            pg.goto('file://' + os.path.join(SITE, file))
            pg.wait_for_timeout(400)
            m = pg.evaluate("""() => ({
                scrollW: document.documentElement.scrollWidth,
                innerW: window.innerWidth,
                bodyScrollW: document.body.scrollWidth,
            })""")
            report.setdefault(name, {})[tag] = m
            pg.screenshot(path=os.path.join(OUT, f'{name}-{tag}.png'), full_page=(tag == 'desktop'))
            ctx.close()
    browser.close()

print(f"{'страница':<12} {'desktop':>12} {'tablet':>12} {'mobile':>12}")
bad = []
for name, m in report.items():
    row = []
    for tag in ('desktop', 'tablet', 'mobile'):
        v = m[tag]
        overflow = 'OVERFLOW' if v['scrollW'] > v['innerW'] else 'ok'
        if overflow != 'ok': bad.append((name, tag, v['scrollW'], v['innerW']))
        row.append(f"{v['scrollW']}px {overflow}")
    print(f"{name:<12} {row[0]:>20} {row[1]:>20} {row[2]:>20}")
print('files:', len(os.listdir(OUT)), '→', OUT)
if bad:
    print('ПЕРЕПОЛНЕНИЯ:', bad)
else:
    print('OK: горизонтальных переполнений нет')
