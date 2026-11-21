# -*- coding: utf-8 -*-
"""Скриншоты СТАРЫХ разделов после перекраски (этап 2, шаг 1)
+ замер горизонтального переполнения.
Запуск: python3 work/site-src/tmp/shots_old.py  (Playwright, headless)."""
import os
from playwright.sync_api import sync_playwright

SITE = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
OUT = os.path.join(os.path.dirname(__file__), 'shots-old')
os.makedirs(OUT, exist_ok=True)

PAGES = [
    ('prompty/index.html',                    'prompty'),
    ('prompty/foto/index.html',               'prompty-foto'),
    ('glossary/index.html',                   'glossary'),
    ('instrumenty/index.html',                'instrumenty'),
    ('guides/index.html',                     'guides'),
    ('guides/s-chego-nachat/index.html',      'guide-article'),
    ('o-proekte/index.html',                  'o-proekte'),
    ('poisk/index.html',                      'poisk'),
    ('politika-konfidencialnosti/index.html', 'politika'),
]
VIEWPORTS = [(1280, 800, 'desktop'), (375, 720, 'mobile')]

overflow = []
with sync_playwright() as pw:
    browser = pw.chromium.launch()
    for file, name in PAGES:
        for w, h, tag in VIEWPORTS:
            ctx = browser.new_context(viewport={'width': w, 'height': h}, locale='ru-RU')
            pg = ctx.new_page()
            try:
                pg.goto('file://' + os.path.join(SITE, file), wait_until='load', timeout=15000)
            except Exception:
                pass
            pg.wait_for_timeout(500)
            pg.screenshot(path=os.path.join(OUT, f'{name}-{tag}.png'), full_page=(tag == 'desktop'))
            sw = pg.evaluate('document.documentElement.scrollWidth')
            iw = pg.evaluate('window.innerWidth')
            if sw > iw + 1:
                overflow.append((name, tag, sw, iw))
            ctx.close()
    browser.close()

print(f'files: {len(PAGES) * len(VIEWPORTS)} → {OUT}')
if overflow:
    print('ПЕРЕПОЛНЕНИЯ:', overflow)
else:
    print('OK: горизонтальных переполнений нет')
