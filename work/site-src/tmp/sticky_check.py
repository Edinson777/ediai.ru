# -*- coding: utf-8 -*-
"""Поведенческая проверка липкой шапки: скроллим страницу, шапка должна остаться
прижатой к верху и не потерять нижнюю линию (единый паттерн с главной)."""
import os
from playwright.sync_api import sync_playwright

BASE = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'site-astro', 'dist'))
PAGES = ['/prompty/', '/finansy/iis-3-nalogovye-lgoty/', '/guides/', '/glossary/']
ok = True
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width': 1280, 'height': 800})
    for path in PAGES:
        pg.goto('file://' + BASE + path + 'index.html')
        pg.evaluate('window.scrollTo(0, 900)')
        pg.wait_for_timeout(150)
        bar = pg.evaluate("""() => {
            const el = document.querySelector('header.e-head-bar');
            if (!el) return null;
            const r = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            return {top: r.top, sticky: cs.position, border: cs.borderBottomWidth, z: cs.zIndex};
        }""")
        good = bar and bar['sticky'] == 'sticky' and abs(bar['top']) < 1 and bar['border'] == '1px'
        print(('OK  ' if good else 'FAIL') + ' ' + path + ' -> ' + repr(bar))
        ok = ok and bool(good)
    b.close()
print('ИТОГ:', 'OK' if ok else 'FAIL')
