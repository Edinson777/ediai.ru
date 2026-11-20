#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Синхронизация «вендорных» файлов для Astro-сборки ediai.ru.

work/site-src/ остаётся ЕДИНЫМ источником данных и стилей:
  - копирует data.json / sources.json / config.json / style.css / app.js / hub.js
    в work/site-astro/src/vendor/;
  - выгружает константы build.py (SECTIONS, NAV, strips, TILES, KEIS*, …) в
    src/vendor/sections.json — прямо импортом build.py, без ручной транскрипции,
    чтобы разметка в Astro совпадала с текущей байт-в-байт.

Запуск:  python3 scripts/dump_data.py   (выполняется автоматически перед build)
"""
import json, os, re, shutil, sys

HERE   = os.path.dirname(os.path.abspath(__file__))
ASTRO  = os.path.normpath(os.path.join(HERE, '..'))
SRC    = os.path.normpath(os.path.join(ASTRO, '..', 'site-src'))
VENDOR = os.path.join(ASTRO, 'src', 'vendor')

FILES = ['data.json', 'sources.json', 'config.json', 'style.css', 'app.js', 'hub.js']

os.makedirs(VENDOR, exist_ok=True)
for f in FILES:
    shutil.copy2(os.path.join(SRC, f), os.path.join(VENDOR, f))
    print('  vendor/' + f)

# build.py при импорте читает свои файлы; main() под __main__ не вызывается.
sys.path.insert(0, SRC)
import build  # noqa: E402

# ---------------------------------------------------------------- URL-конвенция (фаза 2)
# Карта переноса адресов (strategy §3.3, блок «Перенос существующих страниц»).
# Трансформация применяется ко ВСЕМ строкам выгрузки: ссылки внутри KNOW_NAV,
# strips, banner, foot, sources, POPULAR, KEIS_* конвертируются автоматически.
URL_MAP = {
    'index.html':          '/',
    'photo.html':          '/prompty/foto/',
    'life.html':           '/prompty/zhizn/',
    'work.html':           '/prompty/rabota/',
    'texts.html':          '/prompty/teksty/',
    'generate.html':       '/prompty/generaciya/',
    'qwen.html':           '/prompty/qwen/',
    'basics.html':         '/guides/osnovy-promptinga/',
    'start.html':          '/guides/s-chego-nachat/',
    'models.html':         '/guides/kakuyu-nejroset-vybrat/',
    'keis-ii-pochta.html': '/guides/ii-i-pochta/',
    'glossary.html':       '/glossary/',
    'education/studying-AI.html': '/education/studying-ai/',
}
URL_RE = re.compile(
    r'(?<![\w-])(' + '|'.join(re.escape(k) for k in URL_MAP) + r')'
)

def transform(obj):
    """Рекурсивно заменяет старые имена файлов на новые абсолютные адреса."""
    if isinstance(obj, str):
        return URL_RE.sub(lambda m: URL_MAP[m.group(1)], obj)
    if isinstance(obj, dict):
        return {k: transform(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [transform(v) for v in obj]
    return obj

dump = {
    # служебные константы и счётчики
    'SITE_URL':   build.SITE_URL,
    'SITE_NAME':  build.SITE_NAME,
    'SITE_DESC':  build.SITE_DESC,
    'LASTMOD':    build.LASTMOD,
    'UPDATED':    build.UPDATED,
    'GA_ID':      build.GA_ID,
    'ADS_ID':     build.ADS_ID,
    'TOTAL':      build.TOTAL,
    'SECTION_ORDER': build.SECTION_ORDER,
    'BY_SECTION_COUNTS': {k: len(v) for k, v in build.BY_SECTION.items()},
    # навигация и перелинковка
    'NAV':        build.NAV,
    'KNOW_NAV':   build.KNOW_NAV,
    'FTAG_META':  build.FTAG_META,
    'NOSCRIPT_CSS': build.NOSCRIPT_CSS,
    # главная
    'TILES':      build.TILES,
    'STEPS':      build.STEPS,
    'POPULAR':    build.POPULAR,
    'FAQ':        build.FAQ,
    'START_STEPS': build.START_STEPS,
    'MODELS_MINI': build.MODELS_MINI,
    'MODELS_FAQ':  build.MODELS_FAQ,
    # база знаний
    'GLOSSARY':   build.GLOSSARY,
    'START_TITLE': build.START_TITLE, 'START_DESC': build.START_DESC,
    'MODELS_TITLE': build.MODELS_TITLE, 'MODELS_DESC': build.MODELS_DESC,
    'GLOSS_TITLE': build.GLOSS_TITLE, 'GLOSS_DESC': build.GLOSS_DESC,
    # кейс
    'KEIS_FILE':  build.KEIS_FILE, 'KEIS_TITLE': build.KEIS_TITLE,
    'KEIS_DESC':  build.KEIS_DESC, 'KEIS_H1': build.KEIS_H1,
    'KEIS_RESEARCH': build.KEIS_RESEARCH, 'KEIS_CALC': build.KEIS_CALC,
    'KEIS_STEPS': build.KEIS_STEPS, 'KEIS_HOWTO': build.KEIS_HOWTO,
    'KEIS_BODY_TEXT': ('Письма и документы — самые частые рабочие задачи для нейросетей: 40–42% рабочих запросов '
        'к ChatGPT — написание и редактирование текстов (OpenAI + NBER, 2025). Нейросеть собирает '
        'черновик за 1–2 минуты, человек тратит 3–5 минут на факты и тон вместо 15–60 минут на '
        'документ с нуля. В кейсе: цифры исследований (доля рабочих задач ~30%, 57% российских '
        'компаний внедрили ИИ, медианная зарплата с навыком ИИ +34%, 1,3 млн AI-вакансий), '
        'иллюстративный расчёт рабочей недели и 7 готовых промптов: follow-up после встречи, '
        'деликатный отказ, exec-summary, протокол, отчёт недели, разбор пункта договора, таблица '
        'из неструктурированного текста.'),
    # источники (HTML-блоки)
    'SRC':        build.SRC,
    # страницы-разделы (вся конфигурация: заголовки, strips, cats, og, banner, foot…)
    'SECTIONS':   build.SECTIONS,
}
dump = transform(dump)
with open(os.path.join(VENDOR, 'sections.json'), 'w', encoding='utf-8') as f:
    json.dump(dump, f, ensure_ascii=False, indent=1)
n = len(re.findall(r'[\w-]+\.html', json.dumps(dump, ensure_ascii=False)))
print('  vendor/sections.json  (' + str(len(json.dumps(dump)) // 1024) + ' КБ)')
print('  ссылок со старыми именами файлов осталось: ' + str(n) + ' (должно быть 0)')
print('OK: вендорные файлы синхронизированы, адреса переведены на URL-конвенцию §3.3.')
