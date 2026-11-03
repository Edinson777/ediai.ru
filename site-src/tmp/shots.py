# -*- coding: utf-8 -*-
"""Скриншоты и замеры мобильной вёрстки собранного сайта (Playwright, headless)."""
import os, json
from playwright.sync_api import sync_playwright

SITE = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT  = os.path.join(os.path.dirname(__file__), 'shots')
os.makedirs(OUT, exist_ok=True)

report = {}

with sync_playwright() as pw:
    browser = pw.chromium.launch()

    def shot(page_file, w, h, name, actions=None, full=False):
        ctx = browser.new_context(viewport={'width': w, 'height': h},
                                  device_scale_factor=1, locale='ru-RU')
        pg = ctx.new_page()
        pg.goto('file://' + os.path.join(SITE, page_file))
        pg.wait_for_timeout(350)
        if actions:
            actions(pg)
            pg.wait_for_timeout(300)
        pg.screenshot(path=os.path.join(OUT, name + '.png'), full_page=full)
        # замеры: горизонтальное переполнение и высота липкой панели
        m = pg.evaluate("""() => ({
            scrollW: document.documentElement.scrollWidth,
            innerW: window.innerWidth,
            controlsH: (document.querySelector('.controls')||{offsetHeight:0}).offsetHeight,
            vh: window.innerHeight
        })""")
        report[name] = m
        ctx.close()

    def open_first_card(pg):
        pg.click('#grid .card-head >> nth=0')

    def open_chips(pg):
        pg.click('#chipsToggle')

    # --- мобильные 390×844 (iPhone 12/13) ---
    shot('index.html',  390, 844, 'm-index')
    shot('photo.html',  390, 844, 'm-photo')
    shot('photo.html',  390, 844, 'm-photo-card', open_first_card)
    shot('photo.html',  390, 844, 'm-photo-chips', open_chips)
    shot('texts.html',  390, 844, 'm-texts')
    shot('life.html',   390, 844, 'm-life')
    shot('life.html',   390, 844, 'm-life-card', open_first_card)
    shot('life.html',   390, 844, 'm-life-chips', open_chips)
    # --- узкий 360×740 (Galaxy / SE) ---
    shot('photo.html',  360, 740, 'm360-photo')
    shot('index.html',  360, 740, 'm360-index')
    shot('life.html',   360, 740, 'm360-life')
    # --- десктоп ---
    shot('index.html', 1440, 900, 'd-index')
    shot('photo.html', 1440, 900, 'd-photo', open_first_card)
    shot('life.html',  1440, 900, 'd-life', open_first_card)

    browser.close()

for k, v in report.items():
    overflow = 'ПЕРЕПОЛНЕНИЕ!' if v['scrollW'] > v['innerW'] else 'ok'
    ctrl = f"{v['controlsH']}px ({round(v['controlsH']/v['vh']*100)}% экрана)" if v['controlsH'] else '—'
    print(f"{k:16s} ширина {v['scrollW']}/{v['innerW']} {overflow:12s} панель {ctrl}")
