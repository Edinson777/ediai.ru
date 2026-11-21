#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Генерация sitemap.xml и llms.txt после сборки Astro (фаза 2, стратегия §5.3 и приложение).

Выход — в work/site-astro/dist/: sitemap.xml (все страницы с lastmod),
llms.txt (описание сайта для языковых моделей по шаблону приложения).

Запуск:  python3 scripts/gen_meta.py   (выполняется автоматически после astro build)
"""
import json, os, datetime

HERE   = os.path.dirname(os.path.abspath(__file__))
ASTRO  = os.path.normpath(os.path.join(HERE, '..'))
DIST   = os.path.join(ASTRO, 'dist')
VENDOR = os.path.join(ASTRO, 'src', 'vendor')

D = json.load(open(os.path.join(VENDOR, 'sections.json'), encoding='utf-8'))
SITE = D['SITE_URL']

# приоритеты страниц (как в текущем sitemap.xml) и даты обновления
TODAY = datetime.date.today().isoformat()
# 404.html в sitemap не попадает (noindex), education/ — добавляем отдельно.
SITEMAP = [
    ('/', 1.0, D['LASTMOD']),
    ('/finansy/', 0.8, TODAY),
    ('/finansy/podushka-bezopasnosti/', 0.7, TODAY),
    ('/finansy/pds-vklad-nakopitelnyj-schet/', 0.7, TODAY),
    ('/finansy/iis-3-nalogovye-lgoty/', 0.7, TODAY),
    ('/digital/', 0.8, TODAY),
    ('/digital/podozritelnoe-soobshchenie/', 0.7, TODAY),
    ('/prompty/', 0.8, D['LASTMOD']),
    ('/prompty/foto/', 0.8, D['LASTMOD']),
    ('/prompty/generaciya/', 0.8, D['LASTMOD']),
    ('/prompty/teksty/', 0.8, D['LASTMOD']),
    ('/prompty/zhizn/', 0.8, D['LASTMOD']),
    ('/prompty/rabota/', 0.8, D['LASTMOD']),
    ('/prompty/qwen/', 0.8, D['LASTMOD']),
    ('/guides/', 0.8, D['LASTMOD']),
    ('/guides/s-chego-nachat/', 0.7, D['LASTMOD']),
    ('/guides/osnovy-promptinga/', 0.7, D['LASTMOD']),
    ('/guides/kakuyu-nejroset-vybrat/', 0.7, D['LASTMOD']),
    ('/guides/ii-i-pochta/', 0.7, D['LASTMOD']),
    ('/instrumenty/', 0.7, TODAY),
    ('/glossary/', 0.6, D['LASTMOD']),
    ('/o-proekte/', 0.5, TODAY),
    ('/politika-konfidencialnosti/', 0.3, TODAY),
    ('/poisk/', 0.5, TODAY),
    ('/education/studying-AI.html', 0.7, TODAY),
]

def collect_dist():
    """Все index.html в dist → список путей (для контроля полноты sitemap)."""
    found = set()
    for root, _dirs, files in os.walk(DIST):
        for f in files:
            if f == 'index.html':
                rel = os.path.relpath(root, DIST).replace(os.sep, '/')
                found.add('/' if rel == '.' else '/' + rel + '/')
            elif f.endswith('.html'):
                rel = os.path.relpath(os.path.join(root, f), DIST).replace(os.sep, '/')
                found.add('/' + rel)
    return found

found = collect_dist()
listed = set(p for p, *_ in SITEMAP)
# страницы, существующие вне dist (не собираются Astro, но в sitemap входят)
OUTSIDE_DIST = {'/education/studying-AI.html'}
missing = sorted(found - listed - {'/404.html'})
extra = sorted(listed - found - OUTSIDE_DIST)
if missing:
    print('ВНИМАНИЕ: есть собранные страницы, отсутствующие в sitemap: ' + ', '.join(missing))
    raise SystemExit(1)
if extra:
    print('ВНИМАНИЕ: в sitemap перечислены несобранные страницы: ' + ', '.join(extra))
    raise SystemExit(1)

xml = ['<?xml version="1.0" encoding="UTF-8"?>',
       '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
for path, prio, lastmod in SITEMAP:
    xml.append('  <url><loc>' + SITE + path + '</loc><lastmod>' + lastmod
               + '</lastmod><changefreq>weekly</changefreq><priority>'
               + ('%.1f' % prio) + '</priority></url>')
xml.append('</urlset>')
with open(os.path.join(DIST, 'sitemap.xml'), 'w', encoding='utf-8') as f:
    f.write('\n'.join(xml) + '\n')
print('  dist/sitemap.xml  (' + str(len(SITEMAP)) + ' страниц)')

# --------------------------------------------------------------- llms.txt
c = D['BY_SECTION_COUNTS']

def plural(n):
    n = abs(int(n)) % 100
    if 11 <= n <= 14: return 'промптов'
    m = n % 10
    if m == 1: return 'промпт'
    if 2 <= m <= 4: return 'промпта'
    return 'промптов'

def pc(key):
    return str(c[key]) + ' ' + plural(c[key])

llms = f"""# Ediai.ru (EDIAI)

> EDIAI — практический портал о финансах, искусственном интеллекте и цифровой
> жизни для взрослых 30–70 лет. Ядро ИИ-направления — {D['TOTAL']} проверенных
> промптов для нейросетей на русском языке; финансовое направление — понятные
> материалы о накоплениях, ИИС-3, ПДС и налоговых вычетах со ссылками на
> официальные источники. Слоган: «Разумнее с деньгами. Увереннее с технологиями».

## Направления

- [Финансы]({SITE}/finansy/): накопления, ИИС-3, ПДС, вклады — без обещаний доходности
- [Искусственный интеллект]({SITE}/prompty/): карта всех категорий промптов
- [Цифровая жизнь]({SITE}/digital/): безопасность и уверенность в интернете
- [Инструменты]({SITE}/instrumenty/): обзор моделей и инструменты

## ИИ-направление

- [Фото и изображения]({SITE}/prompty/foto/): {pc('photo')}
- [Личная жизнь]({SITE}/prompty/zhizn/): {pc('life')}
- [Работа]({SITE}/prompty/rabota/): {pc('work')}
- [Тексты]({SITE}/prompty/teksty/): {pc('texts')}
- [Генерация картинок]({SITE}/prompty/generaciya/): {pc('generate')}
- [Qwen]({SITE}/prompty/qwen/): {pc('qwen')}

## Финансовое направление

- [Подушка безопасности]({SITE}/finansy/podushka-bezopasnosti/): сколько и где держать резерв
- [ПДС, вклад или накопительный счёт]({SITE}/finansy/pds-vklad-nakopitelnyj-schet/): сравнение мест для денег
- [ИИС-3: налоговые льготы]({SITE}/finansy/iis-3-nalogovye-lgoty/): вычеты, сроки, чек-лист перед открытием

## Цифровая жизнь

- [Как распознать подозрительное сообщение]({SITE}/digital/podozritelnoe-soobshchenie/): признаки и план действий

## Материалы ИИ-направления

- [Гайды]({SITE}/guides/): основы промптинга, выбор модели
- [С чего начать]({SITE}/guides/s-chego-nachat/): путеводитель новичка, 7 шагов
- [Основы промптинга]({SITE}/guides/osnovy-promptinga/): формула промпта и итерации
- [Какую нейросеть выбрать]({SITE}/guides/kakuyu-nejroset-vybrat/): сравнение задач и моделей
- [Кейс: ИИ и почта]({SITE}/guides/ii-i-pochta/): сколько часов экономит ИИ, с цифрами
- [Глоссарий]({SITE}/glossary/): термины ИИ простыми словами
- [Путь в ИИ]({SITE}/education/studying-AI.html): план обучения с нуля

## О проекте

- [О проекте]({SITE}/o-proekte/): автор и методика проверки
- [Политика конфиденциальности]({SITE}/politika-konfidencialnosti/): аналитика и cookies
"""
with open(os.path.join(DIST, 'llms.txt'), 'w', encoding='utf-8') as f:
    f.write(llms)
print('  dist/llms.txt')
print('OK: метаданные собраны.')
