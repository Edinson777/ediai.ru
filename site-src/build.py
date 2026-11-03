#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Генератор многостраничного сайта «Ediai — ИИ в личной жизни и работе».

Единый источник данных: data.json (181 промпт, извлечён из исходных страниц).
Генерирует в ../site/:
  index.html          — главная-хаб (bento-плитки, шаги, популярное, FAQ) — полностью статическая
  photo.html          — Переделка фото (54)
  generate.html       — Создание изображений (21)
  texts.html          — Тексты (21)
  life.html           — ИИ в личной жизни (56)
  qwen.html           — Qwen (23)
  basics.html         — Основы промптинга (6)
  prompt-base.html / photo-edit-prompts.html — редиректы со старых адресов
  robots.txt, sitemap.xml, og/*.png

Все страницы самодостаточны (CSS/JS инлайнятся) и содержат статически
отрендеренные карточки: контент виден поисковикам и работает без JS.

Запуск:  python3 build.py
Настройка домена: config.json → site_url
"""
import json, os, re, html as H
from urllib.parse import quote

HERE = os.path.dirname(os.path.abspath(__file__))
OUT  = os.path.normpath(os.path.join(HERE, '..'))  # корень репозитория = готовый сайт (GitHub Pages)

cfg     = json.load(open(os.path.join(HERE, 'config.json'),  encoding='utf-8'))
data    = json.load(open(os.path.join(HERE, 'data.json'),    encoding='utf-8'))
SRC     = json.load(open(os.path.join(HERE, 'sources.json'), encoding='utf-8'))
CSS     = open(os.path.join(HERE, 'style.css'), encoding='utf-8').read()
APPJS   = open(os.path.join(HERE, 'app.js'),    encoding='utf-8').read()

SITE_URL  = cfg['site_url'].rstrip('/')
SITE_NAME = cfg['site_name']
SITE_DESC = cfg['site_description']
LASTMOD   = cfg['lastmod']
UPDATED   = cfg['updated_label']
GA_ID     = cfg.get('ga_id', '').strip()   # Google Analytics 4 Measurement ID (G-…)

PROMPTS = data['prompts']
BY_SECTION = {}
for p in PROMPTS:
    BY_SECTION.setdefault(p['section'], []).append(p)
TOTAL = len(PROMPTS)

FAVICON = ("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' "
           "viewBox='0 0 100 100'><text y='.9em' font-size='90'>⚡</text></svg>")

# Яндекс.Метрика (ID 114035585) — вставляется сразу после <body> на всех страницах,
# кроме страниц-редиректов. События prompt_copy / empty_search шлёт app.js (YM_ID).
METRIKA = '''<!-- Yandex.Metrika counter -->
<script type="text/javascript">
    (function(m,e,t,r,i,k,a){
        m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
        m[i].l=1*new Date();
        for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
        k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
    })(window, document,'script','https://mc.yandex.ru/metrika/tag.js?id=114035585', 'ym');

    ym(114035585, 'init', {ssr:true, webvisor:true, clickmap:true, ecommerce:"dataLayer", referrer: document.referrer, url: location.href, accurateTrackBounce:true, trackLinks:true});
</script>
<noscript><div><img src="https://mc.yandex.ru/watch/114035585" style="position:absolute; left:-9999px;" alt="" /></div></noscript>
<!-- /Yandex.Metrika counter -->
'''

# Google Analytics 4: сниппет встраивается только если в config.json задан ga_id
# (формат G-XXXXXXXXXX). Пустое значение = счётчика GA4 на сайте нет.
def gtag_snippet():
    if not GA_ID:
        return ''
    return ('<!-- Google tag (gtag.js) -->\n'
            '<script async src="https://www.googletagmanager.com/gtag/js?id=' + GA_ID + '"></script>\n'
            '<script>\n'
            '  window.dataLayer = window.dataLayer || [];\n'
            '  function gtag(){dataLayer.push(arguments);}\n'
            "  gtag('js', new Date());\n\n"
            "  gtag('config', '" + GA_ID + "');\n"
            '</script>\n'
            '<!-- /Google tag -->\n')

# ---------------------------------------------------------------- helpers
def plural(n, f1, f2, f5):
    """Русские формы: plural(181,'готовый промпт','готовых промпта','готовых промптов')."""
    n = abs(int(n)) % 100
    if 11 <= n <= 14: return f5
    m = n % 10
    if m == 1: return f1
    if 2 <= m <= 4: return f2
    return f5

def esc(s):
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')

def attr(s):
    return H.escape(s, quote=True)

def highlight(s):
    """Тот же алгоритм, что в app.js: экранирование + подсветка [скобок]."""
    return re.sub(r'\[([^\]\n]{1,120})\]',
                  lambda m: '<span class="ph">[' + m.group(1) + ']</span>',
                  esc(s))

def js_json(obj):
    """JSON для вставки внутрь <script> (экранируем '</' во избежание закрытия тега)."""
    return json.dumps(obj, ensure_ascii=False).replace('</', '<\\/')

def ld(obj):
    return json.dumps(obj, ensure_ascii=False).replace('</', '<\\/')

CHEV    = "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' aria-hidden='true'><path d='M6 9l6 6 6-6'/></svg>"
COPY_IC = "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' aria-hidden='true'><rect x='9' y='9' width='12' height='12' rx='2'/><path d='M5 15V5a2 2 0 0 1 2-2h10'/></svg>"

def qpill_html(qw):
    if qw == 'chat':
        return "<span class='qpill full' title='Работает в Qwen Chat без изменений'>Qwen ✓</span>"
    if qw == 'img':
        return "<span class='qpill full' title='Работает в Qwen-Image без изменений'>Qwen-Image ✓</span>"
    if qw == 'core':
        return ("<span class='qpill core' title='Описательная часть промпта работает в Qwen-Image; "
                "параметры --ar / --niji / --style raw специфичны для Midjourney — размер и стиль "
                "в Qwen задаются в интерфейсе или API'>→ Qwen-Image</span>")
    return ''

def dspill_html(ds):
    """Пилюля совместимости с DeepSeek (проверка ноябрь 2026)."""
    if ds == 'ok':
        return ("<span class='dspill full' title='Работает в DeepSeek: V3 (deepseek-chat) для текстов "
                "и креатива, R1 (deepseek-reasoner / DeepThink) для анализа, логики и кода'>DeepSeek ✓</span>")
    if ds == 'think':
        return ("<span class='dspill note' title='Ключи /think и /no_think специфичны для Qwen. Аналог в DeepSeek: "
                "переключатель DeepThink (R1) в чате или выбор модели в API — deepseek-reasoner / deepseek-chat'>DeepSeek: аналог</span>")
    if ds == 'ctx':
        return ("<span class='dspill note' title='Контекст DeepSeek — до 128K токенов, а не 1M: очень длинные документы "
                "разбивайте на части и подавайте последовательно с промежуточными выжимками'>DeepSeek: 128K</span>")
    if ds == 'json':
        return ("<span class='dspill note' title='Надёжный JSON даёт DeepSeek-V3 (deepseek-chat) с response_format: json_object; "
                "слово «JSON» в промпте уже есть — это обязательное условие JSON-режима DeepSeek. "
                "В R1 рассуждения могут примешиваться к ответу'>DeepSeek: V3</span>")
    return ''

def pills_html(p):
    return qpill_html(p.get('qw')) + dspill_html(p.get('ds'))

def card_html(p):
    """Карточка — байт-в-байт как рендерит app.js (свёрнутое состояние)."""
    body_id = 'body-' + p['id']
    tip  = "<div class='tip'>💡 " + p['tip'] + "</div>" if p.get('tip') else ''
    tags = ''.join("<span class='tag'>#" + esc(t) + "</span>" for t in p['tags'])
    return (
        "<article class='card' id='" + p['id'] + "' data-id='" + p['id'] + "'>"
        "<div class='card-head' role='button' tabindex='0' aria-expanded='false' aria-controls='" + body_id + "'>"
          "<div class='head-main'>"
            "<div class='card-top'><h3>" + esc(p['title']) + "</h3><div class='badges'>"
            "<span class='badge " + p['model'] + "'>" + esc(p['modelLabel']) + "</span>" + pills_html(p) +
            "</div></div>"
            "<p class='desc'>" + esc(p['desc']) + "</p>"
          "</div>"
          "<span class='chev'>" + CHEV + "</span>"
        "</div>"
        "<div class='card-body' id='" + body_id + "'>"
          "<div class='prompt-wrap'><pre class='prompt'>" + highlight(p['prompt']) + "</pre>"
          "<button class='copy-btn' type='button'>" + COPY_IC + "Копировать</button></div>"
          + tip +
          "<div class='tags'>" + tags + "</div>"
        "</div>"
        "</article>"
    )

def grid_html(prompts, cats):
    """Сетка с подзаголовками подразделов (порядок как в renderGrid при sub=all)."""
    out, last_sub = [], None
    for p in prompts:
        if p['sub'] != last_sub:
            last_sub = p['sub']
            out.append("<div class='section-head'><h2>" + cats[p['cat']]['icon'] + " " +
                       esc(p['sub']) + "</h2><div class='line' aria-hidden='true'></div></div>")
        out.append(card_html(p))
    return '\n'.join(out)

# ---------------------------------------------------------------- навигация
NAV = [
    ('index.html',    '🏠 Главная'),
    ('photo.html',    '📸 Переделка фото'),
    ('generate.html', '🎨 Генерация изображений'),
    ('texts.html',    '✍️ Тексты'),
    ('life.html',     '🏡 Личная жизнь'),
    ('qwen.html',     '🤖 Qwen'),
    ('basics.html',   '🧠 Основы'),
]

def nav_html(current):
    links = []
    for f, label in NAV:
        cur = ' aria-current="page"' if f == current else ''
        links.append('<a href="' + f + '"' + cur + '>' + label + '</a>')
    return '<nav class="sections-nav" aria-label="Разделы сайта">' + ''.join(links) + '</nav>'

# ---------------------------------------------------------------- конфиг разделов
PHOTO_STRIPS = (
  '<div class="info-strip"><span class="ic" aria-hidden="true">💡</span>'
  '<span><b>Как пользоваться:</b> карточки свёрнуты — нажмите на карточку, чтобы раскрыть промпт, '
  'скопируйте его кнопкой и отправьте в нейроредактор вместе с фотографией. Промпты написаны по-русски — '
  'Qwen-Image-Edit и современные редакторы понимают его отлично; для западных моделей попросите чат-бота '
  'перевести промпт на английский.</span></div>'
  '<div class="info-strip qwen-strip"><span class="ic" aria-hidden="true">🛡️</span>'
  '<span><b>Главное правило переделки:</b> в каждом промпте есть фраза «сохрани лицо» — не удаляйте её. '
  'Без фиксации личности редактор любит «улучшить» внешность до неузнаваемости. Одно изменение за запрос '
  'даёт предсказуемый результат: <code>лицо и поза без изменений, меняем только [X]</code>.</span></div>'
)

GENERATE_STRIPS = (
  '<div class="info-strip"><span class="ic" aria-hidden="true">💡</span>'
  '<span><b>Как пользоваться:</b> карточки свёрнуты — нажмите на карточку, чтобы раскрыть промпт, скопируйте '
  'его кнопкой и подставьте свои данные вместо <span style="color:var(--ph)">[скобок]</span>. При поиске '
  'найденные карточки раскрываются автоматически. Промпты для изображений даны на английском — Midjourney, '
  'DALL·E, Stable Diffusion и Qwen-Image понимают его лучше всего.</span></div>'
  '<div class="info-strip qwen-strip"><span class="ic" aria-hidden="true">🤖</span>'
  '<span><b>Совместимость с Qwen:</b> значок <b>Qwen-Image&nbsp;✓</b> — промпт работает в Qwen-Image без '
  'изменений. Пунктирный значок <b>→&nbsp;Qwen-Image</b> — описательная часть Midjourney-промпта переносится '
  'в Qwen-Image, но параметры <code>--ar</code>, <code>--niji</code>, <code>--style raw</code> там не '
  'используются: размер и стилизация задаются в интерфейсе или API. Наведите курсор на значок — появится '
  'подсказка.</span></div>'
)

TEXTS_STRIPS = (
  '<div class="info-strip"><span class="ic" aria-hidden="true">💡</span>'
  '<span><b>Как пользоваться:</b> раскройте карточку, скопируйте промпт и подставьте свои данные вместо '
  '<span style="color:var(--ph)">[скобок]</span>. Шаблоны работают в ChatGPT, Claude, Gemini, GigaChat, '
  'YandexGPT, Qwen и DeepSeek. Значок <b>Qwen&nbsp;✓</b> — проверено в Qwen Chat, <b>DeepSeek&nbsp;✓</b> — '
  'работает в DeepSeek без изменений (V3 для текстов, R1 для анализа).</span></div>'
)

QWEN_STRIPS = (
  '<div class="info-strip qwen-strip"><span class="ic" aria-hidden="true">🤖</span>'
  '<span><b>О разделе:</b> шаблоны собраны по официальным гайдам Alibaba: шестиблочный фреймворк '
  '<code>#Context# → #Response#</code>, режимы мышления <code>/think</code> и <code>/no_think</code>, '
  'контекст до 1M токенов, JSON-режимы для API. Промпты работают в Qwen Chat (chat.qwen.ai), Qwen-Image, '
  'Qwen-Image-Edit и Qwen-Coder.</span></div>'
)

BASICS_STRIPS = (
  '<div class="info-strip"><span class="ic" aria-hidden="true">💡</span>'
  '<span><b>Как пользоваться:</b> эти формулы работают в любой LLM — ChatGPT, Claude, Gemini, Qwen, '
  'GigaChat, YandexGPT, DeepSeek. Начните с «Роль → Контекст → Задача → Формат»: она закрывает 90% текстовых '
  'задач. Значок <b>Qwen&nbsp;✓</b> — проверено в Qwen Chat, <b>DeepSeek&nbsp;✓</b> — в DeepSeek.</span></div>'
)

LIFE_STRIPS = (
  '<div class="info-strip"><span class="ic" aria-hidden="true">💡</span>'
  '<span><b>Как пользоваться:</b> карточки свёрнуты — нажмите, чтобы раскрыть описание идеи и пример запроса. '
  'Скопируйте промпт кнопкой, замените цифры и детали (возраст, бюджет, площадь, цели) на свои — и отправьте '
  'в любой чат-бот: ChatGPT, Qwen Chat, DeepSeek, GigaChat, Gemini. К запросам про фото и документы '
  'прикрепите снимок или файл. Значок <b>Qwen&nbsp;✓</b> — работает в Qwen Chat, <b>DeepSeek&nbsp;✓</b> — '
  'в DeepSeek (для задач с фото/видео/файлами DeepSeek не подходит — значка нет).</span></div>'
  '<div class="info-strip warn-strip"><span class="ic" aria-hidden="true">🛡️</span>'
  '<span><b>Ограничения и безопасность:</b> здоровье — ИИ-симптом-чекеры не ставят диагноз, при серьёзных '
  'симптомах сразу к врачу; психика — чат-боты поддержки дополняют, но не заменяют живое общение и терапию; '
  'приватность — не загружайте в публичные боты паспорт, номера карт и медицинские карты; факты и деньги — '
  'ИИ галлюцинирует: перепроверяйте юридические формулировки, суммы и даты по первоисточнику.</span></div>'
  '<div class="info-strip fact-strip"><span class="ic" aria-hidden="true">📊</span>'
  '<span><b>Почему это мейнстрим:</b> ~70% запросов к ChatGPT не связаны с работой (OpenAI + NBER, 2025) · '
  '~1,5 млрд человек в месяц пользуются ИИ-сервисами (DataReportal, 2026) · 49% взрослых в США используют '
  'ИИ-чат-боты (Pew, июнь 2026) · 4 из 5 студентов применяют генеративный ИИ в учёбе (Stanford HAI, '
  'AI Index 2026).</span></div>'
)

def banner(href, icon, text):
    return ('<a class="page-link-banner" href="' + href + '"><span class="plb-ic" aria-hidden="true">' + icon +
            '</span><span>' + text + '</span><span class="plb-go">Открыть →</span></a>')

SECTIONS = {
'photo': dict(
  file='photo.html', h1='📸 Переделка фото нейросетью', h1_class=' class="gold"',
  plain='Переделка фото нейросетью — 54 промпта',
  title='Переделка фото нейросетью — 54 промпта: стили, фотосессии, реставрация',
  desc='54 готовых промпта для переделки фото нейросетью: стили (акварель, аниме, киберпанк), виртуальные фотосессии, замена одежды и фона, реставрация и колоризация старых снимков.',
  sub='54 промпта для редактирования фотографий: превращение в разные стили, виртуальные фотосессии, замена одежды и фона, реставрация старых снимков. Скопируйте промпт, подставьте свои данные вместо <span style="color:var(--ph);font-weight:600">[скобок]</span> — и отправьте в нейроредактор вместе с фото.',
  placeholder='Поиск: акварель, хедшот, Paris, татуировка, реставрация…',
  tabs=True,
  cats={'all':{'label':'Все промпты','icon':'📚'},'style':{'label':'Стили','icon':'🎨'},
        'shoot':{'label':'Фотосессии','icon':'📸'},'creative':{'label':'Креатив','icon':'✨'},
        'restore':{'label':'Реставрация','icon':'🔧'},'tech':{'label':'Техники','icon':'🧠'}},
  cat_order=['all','style','shoot','creative','restore','tech'],
  stats=[('cat','style','🎨 Стили'),('cat','shoot','📸 Фотосессии'),('cat','creative','✨ Креатив'),
         ('cat','restore','🔧 Реставрация'),('cat','tech','🧠 Техники'),('total',None,'Всего')],
  strips=PHOTO_STRIPS,
  banner=banner('generate.html','🎨','<b>Создание изображений с нуля</b> — 21 промпт для Midjourney, DALL·E, Stable Diffusion и Qwen-Image: портреты, товары, пейзажи, логотипы, персонажи.'),
  sources_h2='📖 Источники и инструменты', sources_note=SRC['photo_note'],
  sources_body=SRC['photo_ul'],
  foot='<b>📸 Переделка фото нейросетью</b> — раздел <a href="index.html">базы промптов для ИИ</a>.<br>Редакторы изображений развиваются быстро: если результат нестабилен — дробите правку на шаги (см. подраздел «Техники»).',
  og=dict(title='Переделка фото нейросетью', sub='54 промпта: стили, фотосессии, реставрация',
          pill='54 промпта · переделка фото', accent=(240,184,102), accent2=(139,124,248)),
),
'generate': dict(
  file='generate.html', h1='🎨 Создание изображений нейросетью', h1_class='',
  plain='Промпты для генерации изображений — 21 шаблон',
  title='Промпты для генерации изображений — 21 шаблон: Midjourney, DALL·E, Qwen-Image',
  desc='Готовые промпты для создания изображений нейросетями: фотореализм, иллюстрации, логотипы, постеры, персонажи. Совместимость с Midjourney, DALL·E 3, Stable Diffusion и Qwen-Image.',
  sub='21 шаблон для создания изображений с нуля: фотореализм, иллюстрации и арт, дизайн и брендинг, персонажи. Замените данные в <span style="color:var(--ph);font-weight:600">[скобках]</span> на свои — и копируйте.',
  placeholder='Поиск: портрет, логотип, пейзаж, товар, персонаж…',
  tabs=False,
  cats={'all':{'label':'Все промпты','icon':'📚'},'img':{'label':'Создание изображений','icon':'🎨'}},
  cat_order=['all','img'],
  stats=[('sub','Формулы и основы','Формулы'),('sub','Фотореализм','Фотореализм'),
         ('sub','Иллюстрации и арт','Иллюстрации'),('sub','Дизайн и брендинг','Дизайн'),
         ('sub','Персонажи','Персонажи'),('total',None,'Всего')],
  strips=GENERATE_STRIPS,
  banner=banner('photo.html','📸','<b>Переделка фото нейросетью</b> — 54 промпта для редактирования снимков: стили, виртуальные фотосессии, примерка одежды, реставрация, стикерпаки и постеры.'),
  sources_h2='📖 Источники', sources_note='Шаблоны адаптированы и скомпилированы на основе перечисленных руководств. Проверено поиском: ' + UPDATED + '.',
  sources_body=SRC['img_ul'],
  foot='<b>🎨 Создание изображений</b> — раздел <a href="index.html">базы промптов для ИИ</a>.<br>Лучшие результаты даёт итерация: сгенерировали → уточнили детали → повторили.',
  og=dict(title='Генерация изображений', sub='21 промпт: Midjourney, DALL·E, Stable Diffusion, Qwen-Image',
          pill='21 промпт · изображения', accent=(139,124,248), accent2=(76,201,240)),
),
'texts': dict(
  file='texts.html', h1='✍️ Промпты для текстов', h1_class='',
  plain='Промпты для текстов — 21 шаблон',
  title='Промпты для текстов — 21 шаблон: копирайтинг, статьи, соцсети, редактура',
  desc='Готовые промпты для написания и улучшения текстов: продажи по AIDA и PAS, статьи, SEO, посты для соцсетей, редактура, деловые письма. Работают в ChatGPT, Claude, Gemini, Qwen, GigaChat.',
  sub='21 шаблон для копирайтеров, редакторов, SMM и руководителей: копирайтинг, статьи и блоги, соцсети, редактура и проверка, деловые тексты. Работают в любой текстовой нейросети.',
  placeholder='Поиск: AIDA, заголовки, статья, Telegram, редактор…',
  tabs=False,
  cats={'all':{'label':'Все промпты','icon':'📚'},'txt':{'label':'Написание текстов','icon':'✍️'}},
  cat_order=['all','txt'],
  stats=[('sub','Копирайтинг','Копирайтинг'),('sub','Статьи и блоги','Статьи'),('sub','Соцсети','Соцсети'),
         ('sub','Редактура и проверка','Редактура'),('sub','Деловые тексты','Деловые'),('total',None,'Всего')],
  strips=TEXTS_STRIPS,
  banner=banner('qwen.html','🤖','<b>Промпты для Qwen</b> — официальный шестиблочный фреймворк Alibaba, режимы мышления, Qwen-Image и Qwen-Coder: 23 шаблона.'),
  sources_h2='📖 Источники', sources_note='Шаблоны адаптированы и скомпилированы на основе перечисленных руководств и классических фреймворков копирайтинга (AIDA, PAS). Проверено поиском: ' + UPDATED + '.',
  sources_body=SRC['txt_ul'],
  foot='<b>✍️ Промпты для текстов</b> — раздел <a href="index.html">базы промптов для ИИ</a>.<br>Давайте нейросети фактуру: свои данные, кейсы и цифры — тогда текст получится уникальным, а не «средним по интернету».',
  og=dict(title='Промпты для текстов', sub='Копирайтинг, статьи, соцсети, редактура — 21 шаблон',
          pill='21 промпт · тексты', accent=(244,140,180), accent2=(139,124,248)),
),
'qwen': dict(
  file='qwen.html', h1='🤖 Промпты для Qwen', h1_class='',
  plain='Промпты для Qwen — 23 шаблона',
  title='Промпты для Qwen — 23 шаблона: Chat, Image, Image-Edit, Coder',
  desc='Официальная формула промптов Alibaba (6 блоков), режимы /think и /no_think, контекст 1M токенов, JSON для API, генерация и редактирование изображений, промпты для Qwen-Coder.',
  sub='Всё про промпты для Qwen: официальный шестиблочный фреймворк Alibaba, режимы Qwen Chat, генерация изображений с точными надписями, редактирование фото и Qwen-Coder для разработчиков.',
  placeholder='Поиск: формула, thinking, JSON, код, изображение…',
  tabs=False,
  cats={'all':{'label':'Все промпты','icon':'📚'},'qwen':{'label':'Qwen','icon':'🤖'}},
  cat_order=['all','qwen'],
  stats=[('sub','Qwen Chat: формулы и режимы','Qwen Chat'),('sub','Qwen-Image: генерация','Qwen-Image'),
         ('sub','Qwen-Image-Edit: редактирование','Image-Edit'),('sub','Qwen-Coder: код','Qwen-Coder'),
         ('total',None,'Всего')],
  strips=QWEN_STRIPS,
  banner=banner('photo.html','📸','<b>Переделка фото нейросетью</b> — 54 промпта для Qwen-Image-Edit и других редакторов: стили, виртуальные фотосессии, реставрация снимков.'),
  sources_h2='📖 Источники', sources_note='Шаблоны основаны на официальных гайдах Alibaba и документированных практиках. Проверено поиском: ' + UPDATED + '.',
  sources_body=SRC['qw_ul'],
  foot='<b>🤖 Промпты для Qwen</b> — раздел <a href="index.html">базы промптов для ИИ</a>.<br>Модели быстро обновляются — сверяйтесь с официальной документацией Alibaba Cloud.',
  og=dict(title='Промпты для Qwen', sub='Chat, Qwen-Image, Qwen-Image-Edit, Qwen-Coder — 23 шаблона',
          pill='23 промпта · Qwen', accent=(130,115,255), accent2=(76,201,240)),
),
'basics': dict(
  file='basics.html', h1='🧠 Основы промптинга', h1_class='',
  plain='Основы промптинга — 6 универсальных формул',
  title='Основы промптинга — 6 универсальных формул для любой нейросети',
  desc='Универсальные формулы промптов для любой LLM: «Роль → Контекст → Задача → Формат», мета-промпт-улучшатель, режим интервью, цикл «критик → улучшение», пошаговое рассуждение.',
  sub='Шесть универсальных приёмов, которые улучшают ответ любой нейросети — ChatGPT, Claude, Gemini, Qwen, GigaChat, YandexGPT. Начните с формулы «Роль → Контекст → Задача → Формат».',
  placeholder='Поиск: роль, критик, интервью, пошагово…',
  tabs=False,
  cats={'all':{'label':'Все промпты','icon':'📚'},'base':{'label':'Основы промптинга','icon':'🧠'}},
  cat_order=['all','base'],
  stats=[('sub','Универсальные формулы','Формулы'),('sub','Качество ответа','Качество ответа'),('total',None,'Всего')],
  strips=BASICS_STRIPS,
  banner=banner('texts.html','✍️','<b>Промпты для текстов</b> — 21 шаблон: продающие тексты, статьи, посты для соцсетей, редактура и деловые документы.'),
  sources_h2='📖 Об основах',
  sources_note='Формулы основаны на общепризнанных практиках промпт-инжиниринга: role prompting, chain-of-thought, CO-STAR и официальный шестиблочный фреймворк Alibaba (<code>#Context# → #Response#</code>). Полный список источников — на <a href="index.html">главной странице</a>.',
  sources_body='',
  foot='<b>🧠 Основы промптинга</b> — раздел <a href="index.html">базы промптов для ИИ</a>.<br>Главный принцип: конкретная роль + контекст + формат ответа дают нейросети больше, чем вежливые общие слова.',
  og=dict(title='Основы промптинга', sub='6 универсальных формул для любой нейросети',
          pill='6 формул · основы', accent=(76,201,240), accent2=(139,124,248)),
),
'life': dict(
  file='life.html', h1='🏡 ИИ в личной жизни', h1_class='',
  plain='ИИ в личной жизни — 56 идей и промптов',
  title='ИИ в личной жизни — 56 промптов: быт, финансы, здоровье, учёба, семья',
  desc='56 практических идей и готовых промптов для нейросетей вне работы: меню из холодильника, план тренировок, разбор выписки, налоги и вычеты, медитации, учёба детей, путешествия, договоры и продуктивность.',
  sub='Как обычные люди уже сегодня используют нейросети вне работы: 56 идей с готовыми примерами запросов — дом и быт, финансы, здоровье и спорт, психология, учёба, путешествия, творчество, семья и дети, документы, время и продуктивность. Работают в ChatGPT, Qwen Chat, DeepSeek, GigaChat и Gemini.',
  placeholder='Поиск: холодильник, тренировки, вычеты, медитация, дети, договор…',
  tabs=False,
  cats={'all':{'label':'Все идеи','icon':'📚'},'home':{'label':'Дом и быт','icon':'🏠'},
        'finance':{'label':'Финансы','icon':'💰'},'health':{'label':'Здоровье и спорт','icon':'🏃'},
        'mind':{'label':'Психология','icon':'🧘'},'learn':{'label':'Учёба','icon':'📚'},
        'travel':{'label':'Путешествия','icon':'✈️'},'creative':{'label':'Творчество','icon':'🎨'},
        'family':{'label':'Семья и дети','icon':'👨‍👩‍👧'},'docs':{'label':'Документы','icon':'📄'},
        'time':{'label':'Продуктивность','icon':'⏰'}},
  cat_order=['all','home','finance','health','mind','learn','travel','creative','family','docs','time'],
  stats=[('cat','home','🏠 Дом и быт'),('cat','finance','💰 Финансы'),('cat','health','🏃 Здоровье'),
         ('cat','learn','📚 Учёба'),('cat','family','👨‍👩‍👧 Семья'),('total',None,'Всего')],
  strips=LIFE_STRIPS,
  banner=banner('basics.html','🧠','<b>Основы промптинга</b> — 6 универсальных формул, которые улучшат ответ любой нейросети: роль, контекст, задача, формат, цикл «критик → улучшение».'),
  sources_h2='📖 Источники и исследования', sources_note=SRC['life_note'],
  sources_body=SRC['life_ul'],
  foot='<b>🏡 ИИ в личной жизни</b> — раздел <a href="index.html">базы промптов для ИИ</a>.<br>Шесть правил, которые превращают ИИ в личного помощника: давайте контекст, просите роль, итерируйте вместо одного запроса, загружайте свои данные, перепроверяйте важное и стройте привычки — подробнее в разделе <a href="basics.html">«Основы промптинга»</a>.',
  og=dict(title='ИИ в личной жизни', sub='56 идей: быт, финансы, здоровье, учёба, семья',
          pill='56 идей · личная жизнь', accent=(52,186,134), accent2=(139,124,248)),
),
}
SECTION_ORDER = ['photo','generate','texts','life','qwen','basics']

def stat_count(prompts, kind, key):
    if kind == 'total': return len(prompts)
    if kind == 'cat':   return sum(1 for p in prompts if p['cat'] == key)
    return sum(1 for p in prompts if p['sub'] == key)

def stats_html(prompts, sec):
    out = []
    for kind, key, label in sec['stats']:
        out.append('<div class="stat">' + esc(label) + ': <b>' + str(stat_count(prompts, kind, key)) + '</b></div>')
    return '<div class="stats">' + ''.join(out) + '</div>'

def tabs_html(prompts, sec):
    if not sec['tabs']:
        return '<div class="tabs" id="tabs" hidden></div>'
    out = ['<div class="tabs" id="tabs">']
    for key in sec['cat_order']:
        c = len(prompts) if key == 'all' else sum(1 for p in prompts if p['cat'] == key)
        cls     = 'tab active' if key == 'all' else 'tab'
        pressed = 'true' if key == 'all' else 'false'
        out.append('<button type="button" class="' + cls + '" aria-pressed="' + pressed + '">' +
                   sec['cats'][key]['icon'] + ' ' + sec['cats'][key]['label'] +
                   '<span class="cnt">' + str(c) + '</span></button>')
    out.append('</div>')
    return ''.join(out)

def chips_html(prompts, sec):
    subs, seen = [], set()
    for p in prompts:
        if p['sub'] not in seen:
            seen.add(p['sub']); subs.append(p['sub'])
    out = ['<button type="button" class="chip active" aria-pressed="true">Все подразделы</button>']
    for s in subs:
        out.append('<button type="button" class="chip" aria-pressed="false">' + esc(s) + '</button>')
    return ''.join(out)

NOSCRIPT_CSS = """
.controls{display:none!important}
.card-body{display:flex!important}
.chev,.copy-btn,#toTop{display:none!important}
pre.prompt{max-height:none!important;padding-top:14px!important}
.card-head{cursor:default}
"""

def head_html(title, desc, path, og_img, ldjson, extra=''):
    url = SITE_URL + '/' + path if path != 'index.html' else SITE_URL + '/'
    return (
'<meta charset="UTF-8">\n'
'<meta name="viewport" content="width=device-width, initial-scale=1.0">\n'
'<title>' + esc(title) + '</title>\n'
'<meta name="description" content="' + attr(desc) + '">\n'
'<link rel="canonical" href="' + url + '">\n'
'<meta property="og:type" content="website">\n'
'<meta property="og:site_name" content="' + attr(SITE_NAME) + '">\n'
'<meta property="og:title" content="' + attr(title) + '">\n'
'<meta property="og:description" content="' + attr(desc) + '">\n'
'<meta property="og:url" content="' + url + '">\n'
'<meta property="og:image" content="' + SITE_URL + '/' + og_img + '">\n'
'<meta property="og:image:width" content="1200">\n'
'<meta property="og:image:height" content="630">\n'
'<meta property="og:locale" content="ru_RU">\n'
'<meta name="twitter:card" content="summary_large_image">\n'
'<meta name="twitter:title" content="' + attr(title) + '">\n'
'<meta name="twitter:description" content="' + attr(desc) + '">\n'
'<meta name="twitter:image" content="' + SITE_URL + '/' + og_img + '">\n'
'<meta name="theme-color" content="#f5f6fa">\n'
'<link rel="icon" href="' + FAVICON + '">\n'
'<script type="application/ld+json">' + ldjson + '</script>\n'
+ extra +
'<style>\n' + CSS + '\n</style>'
)

WEBSITE_LD = {"@type":"WebSite","@id":SITE_URL+"/#website","name":SITE_NAME,"url":SITE_URL+"/",
              "description":SITE_DESC,"inLanguage":"ru"}

# ---------------------------------------------------------------- страница раздела
def build_section(key):
    sec = SECTIONS[key]
    prompts = BY_SECTION[key]
    url = SITE_URL + '/' + sec['file']

    # Контентная аналитика Метрики принимает только материалы типов
    # Article/NewsArticle/BlogPosting/Movie/Review/Recipe/Question/QAPage,
    # поэтому каждый промпт размечен как отдельный Article (обязательные
    # элементы Метрики: @id, headline, text/articleBody).
    articles = [{
        "@type": "Article",
        "@id": url + "#" + p['id'],
        "headline": p['title'],
        "articleBody": p['prompt'],
        "description": p['desc'],
        "inLanguage": "ru",
        "datePublished": LASTMOD,
        "dateModified": LASTMOD,
        "keywords": ", ".join(p['tags']),
        "isPartOf": {"@id": url},
        "mainEntityOfPage": {"@type": "WebPage", "@id": url},
    } for p in prompts]

    ldgraph = {"@context":"https://schema.org","@graph": [
        WEBSITE_LD,
        {"@type":"CollectionPage","@id":url,"url":url,"name":sec['plain'],
         "description":sec['desc'],"inLanguage":"ru",
         "datePublished":LASTMOD,"dateModified":LASTMOD,
         "isPartOf":{"@id":SITE_URL+"/#website"}},
        {"@type":"ItemList","name":sec['plain'],"numberOfItems":len(prompts),
         "itemListElement":[{"@type":"ListItem","position":i+1,"name":p['title'],"url":url+"#"+p['id']}
                            for i,p in enumerate(prompts)]},
    ] + articles}

    sources = ('<details class="sources"><summary><h2>' + sec['sources_h2'] + '</h2>' +
               '<span class="src-hint">показать список</span></summary>' +
               '<div class="sources-in"><p class="note">' + sec['sources_note'] + '</p>' +
               (sec['sources_body'] or '') + '</div></details>')

    page_obj = {"section":key, "tabs":sec['tabs'], "cats":sec['cats'], "catOrder":sec['cat_order']}

    return ('<!DOCTYPE html>\n<html lang="ru">\n<head>\n' +
      head_html(sec['title'], sec['desc'], sec['file'], 'og/og-' + key + '.png', ld(ldgraph)) +
      '\n</head>\n<body>\n' + METRIKA + gtag_snippet() +
      '<a class="skip-link" href="#main">Перейти к содержимому</a>\n'
      '<header class="hero">\n  <div class="wrap">\n'
      '    <a class="back-link" href="index.html">← Все разделы</a>\n'
      '    <h1' + sec['h1_class'] + '>' + sec['h1'] + '</h1>\n'
      '    <p class="sub">' + sec['sub'] + '</p>\n'
      '    ' + stats_html(prompts, sec) + '\n'
      '  </div>\n</header>\n'
      '<div class="controls">\n  <div class="wrap">\n'
      '    <div class="search-row">\n      <div class="search-box">\n'
      '        <svg fill="none" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/></svg>\n'
      '        <input id="search" type="search" aria-label="Поиск по промптам раздела" placeholder="' + attr(sec['placeholder']) + '" autocomplete="off">\n'
      '        <kbd aria-hidden="true">/</kbd>\n'
      '      </div>\n    </div>\n'
      '    ' + tabs_html(prompts, sec) + '\n'
      '    <div class="chips-row" id="chipsRow">\n'
      '      <button type="button" class="chips-toggle" id="chipsToggle" aria-expanded="false" aria-controls="chips">Подразделы ▾</button>\n'
      '      <div class="chips" id="chips">' + chips_html(prompts, sec) + '</div>\n'
      '    </div>\n'
      '    <div class="results-line">\n'
      '      <span id="results">Показаны все ' + str(len(prompts)) + ' промпта</span>\n'
      '      <span class="mini-btns">\n'
      '        <button class="mini-btn" id="expandAll" type="button">⊞ Развернуть все</button>\n'
      '        <button class="mini-btn" id="collapseAll" type="button">⊟ Свернуть все</button>\n'
      '      </span>\n    </div>\n'
      '  </div>\n</div>\n'
      '<main class="wrap" id="main" tabindex="-1">\n'
      '  <div class="strips">' + sec['strips'] + '</div>\n'
      '  ' + sec['banner'] + '\n'
      '  <div class="grid" id="grid" data-prerendered="1">\n' + grid_html(prompts, sec['cats']) + '\n  </div>\n'
      '  <div class="empty" id="empty">\n    <div class="big" aria-hidden="true">🔍</div>\n'
      '    <p>Ничего не найдено. Попробуйте другой запрос.</p>\n  </div>\n'
      '</main>\n'
      '<footer>\n  <div class="wrap">\n'
      '    ' + nav_html(sec['file']) + '\n'
      '    ' + sources + '\n'
      '    ' + sec['foot'] + '\n'
      '  </div>\n</footer>\n'
      '<div id="toast" role="status" aria-live="polite"></div>\n'
      '<button id="toTop" title="Наверх" aria-label="Наверх">↑</button>\n'
      '<noscript><style>' + NOSCRIPT_CSS + '</style></noscript>\n'
      '<script>\nconst PAGE = ' + js_json(page_obj) + ';\nconst PROMPTS = ' + js_json(prompts) + ';\n</script>\n'
      '<script>\n' + APPJS + '\n</script>\n'
      '</body>\n</html>\n')

# ---------------------------------------------------------------- главная (хаб)
TILES = [
 dict(key='photo', big=True, icon='📸', name='Переделка фото нейросетью',
      text='Превращение снимков в разные стили, виртуальные фотосессии, замена одежды и фона, реставрация и колоризация старых фотографий.',
      subs=['Стили','Фотосессии','Креатив','Реставрация','Техники']),
 dict(key='generate', icon='🎨', name='Создание изображений',
      text='Портреты и товары, пейзажи, иллюстрации, логотипы, постеры и персонажи — с пометками совместимости с Qwen-Image.',
      subs=['Фотореализм','Иллюстрации','Дизайн','Персонажи']),
 dict(key='texts', icon='✍️', name='Тексты',
      text='Продающие тексты, статьи, посты для соцсетей, редактура и деловые документы — для любой текстовой нейросети.',
      subs=['Копирайтинг','Статьи','Соцсети','Редактура']),
 dict(key='life', big=True, cls='tile-life', icon='🏡', name='ИИ в личной жизни',
      text='56 идей для жизни вне работы: меню из того, что есть в холодильнике, план тренировок, разбор выписки и налоговые вычеты, медитации, учёба детей, поездки, договоры и почта.',
      subs=['Дом и быт','Финансы','Здоровье','Учёба','Семья','Документы']),
 dict(key='qwen', icon='🤖', name='Qwen',
      text='Официальный фреймворк Alibaba, режимы мышления, генерация изображений с точными надписями, редактирование фото и код.',
      subs=['Chat','Image','Image-Edit','Coder']),
 dict(key='basics', icon='🧠', name='Основы промптинга',
      text='Шесть приёмов, которые улучшают ответ любой LLM: от формулы «роль-контекст-задача» до цикла «критик → улучшение».',
      subs=['Формулы','Качество ответа']),
]

STEPS = [
 ('Выберите раздел','Шесть разделов: переделка фото, генерация изображений, тексты, ИИ в личной жизни, Qwen и основы промптинга — всего ' + str(TOTAL) + ' шаблонов.'),
 ('Найдите промпт','Поиском (клавиша «/»), категорией или подразделом. Нажмите на карточку, чтобы раскрыть текст промпта и совет.'),
 ('Скопируйте и примените','Кнопка «Копировать», замените <span style="color:var(--ph)">[данные в скобках]</span> на свои. Для переделки фото прикрепите снимок к запросу в нейроредактор.'),
]

POPULAR = [
 ('photo.html','хедшот','📸 Переделка фото','Деловой хедшот (LinkedIn)','Профессиональный портрет для резюме и LinkedIn из обычного селфи.'),
 ('photo.html','документы','📸 Переделка фото','Фото на документы','Ровный свет и нейтральный фон — заготовка для паспорта и визы.'),
 ('photo.html','реставрация','📸 Переделка фото','Реставрация старого снимка','Царапины, желтизна и заломы — убрать, аутентичность сохранить.'),
 ('photo.html','колоризация','📸 Переделка фото','Колоризация ч/б фотографии','Раскрасить снимок из семейного архива естественно.'),
 ('generate.html','логотип','🎨 Генерация изображений','Минималистичный логотип','Векторный знак с негативным пространством для бренда.'),
 ('texts.html','aida','✍️ Тексты','Продающий текст по AIDA','Внимание → Интерес → Желание → Действие.'),
 ('life.html','холодильник','🏡 Личная жизнь','Меню из того, что есть в холодильнике','Фото полок → три ужина на вечер и список покупок.'),
 ('life.html','вычет','🏡 Личная жизнь','Налоги и вычеты','ИИ объяснит, какие вычеты вам положены и как их оформить.'),
]

FAQ = [
 ('Что такое промпт и как им пользоваться?',
  'Промпт — текстовая инструкция для нейросети. Найдите подходящий шаблон, нажмите «Копировать», замените данные в квадратных скобках на свои и отправьте в нейросеть. Для переделки фото прикрепите к запросу фотографию.'),
 ('Какие нейросети подходят для переделки фото?',
  'Qwen-Image-Edit (бесплатно в Qwen Chat), Nano Banana в Gemini, FLUX.1 Kontext, Midjourney; для продвинутых — SDXL и ComfyUI локально. Для повышения качества и резкости — апскейлеры: Topaz Photo AI, GFPGAN, CodeFormer.'),
 ('Промпты на русском языке работают?',
  'Да. Qwen-Image-Edit и современные нейроредакторы хорошо понимают русский язык. Промпты для генерации изображений даны на английском — его лучше понимают Midjourney, DALL·E и Stable Diffusion. Текстовые промпты работают на русском в любой LLM.'),
 ('Это бесплатно?',
  'Все шаблоны на сайте бесплатны. Стоимость зависит от выбранной нейросети: Qwen Chat бесплатен, у остальных сервисов есть бесплатные лимиты или подписка.'),
 ('Какая нейросеть подойдёт для бытовых задач?',
  'Любой чат-бот: ChatGPT, Qwen Chat (бесплатно), DeepSeek, GigaChat, YandexGPT, Gemini. Для задач с фото и документами (меню из холодильника, разбор договора, техника упражнений) используйте мультимодальные — Qwen Chat, ChatGPT, Gemini — и прикрепляйте снимок к запросу. Не отправляйте в боты паспортные данные и номера карт, перепроверяйте суммы и юридические формулировки.'),
]

def build_index():
    tiles = []
    for t in TILES:
        sec = SECTIONS[t['key']]
        n = len(BY_SECTION[t['key']])
        subs = '<ul class="t-subs">' + ''.join('<li>' + esc(s) + '</li>' for s in t['subs']) + '</ul>' if t.get('subs') else ''
        tiles.append(
          '<a class="tile' + (' tile-big' if t.get('big') else '') + (' ' + t['cls'] if t.get('cls') else '') + '" href="' + sec['file'] + '">'
          '<span class="t-top"><span class="t-ic" aria-hidden="true">' + t['icon'] + '</span>'
          '<span class="t-count">' + str(n) + ' ' + ('промпта' if n != 1 else 'промпт') + '</span></span>'
          '<h2>' + esc(t['name']) + '</h2>'
          '<p>' + t['text'] + '</p>' + subs +
          '<span class="t-go">Открыть раздел →</span></a>')

    steps = ''.join('<div class="step"><span class="s-n" aria-hidden="true">' + str(i+1) + '</span><b>' + s[0] + '</b><p>' + s[1] + '</p></div>'
                    for i, s in enumerate(STEPS))

    pops = []
    for f, q, cat, title, desc in POPULAR:
        pops.append('<a class="pop" href="' + f + '?q=' + quote(q) + '">'
                    '<span class="p-cat">' + cat + '</span><h3>' + esc(title) + '</h3>'
                    '<p>' + desc + '</p><span class="p-go">Открыть промпт →</span></a>')

    faq = ''.join('<details><summary>' + esc(q) + '</summary><p>' + esc(a) + '</p></details>' for q, a in FAQ)

    ldgraph = {"@context":"https://schema.org","@graph":[
        WEBSITE_LD,
        {"@type":"WebPage","@id":SITE_URL+"/","url":SITE_URL+"/",
         "name":"ИИ в личной жизни и работе — " + str(TOTAL) + " готовых промптов, гиды и сравнения","description":SITE_DESC,
         "inLanguage":"ru","isPartOf":{"@id":SITE_URL+"/#website"}},
        {"@type":"ItemList","name":"Разделы базы промптов","numberOfItems":len(SECTION_ORDER),
         "itemListElement":[{"@type":"ListItem","position":i+1,"name":SECTIONS[k]['plain'],
                             "url":SITE_URL+"/"+SECTIONS[k]['file']} for i,k in enumerate(SECTION_ORDER)]},
        {"@type":"FAQPage","mainEntity":[{"@type":"Question","name":q,
            "acceptedAnswer":{"@type":"Answer","text":a}} for q,a in FAQ]},
    ]}

    idx_title = 'ИИ в личной жизни и работе — готовые промпты, гиды, сравнения | Ediai'

    sources_grid = (
      '<details class="sources"><summary><h2>📖 Источники</h2>'
      '<span class="src-hint">показать список</span></summary>'
      '<div class="sources-in">'
      '<p class="note">' + SRC['base_note'] + '</p>'
      '<div class="sources-grid">'
        '<div><h3>🎨 Генерация изображений</h3>' + SRC['img_ul'] + '</div>'
        '<div><h3 class="txt-head">✍️ Написание текстов</h3>' + SRC['txt_ul'] + '</div>'
        '<div><h3 class="life-head">🏡 ИИ в личной жизни</h3>' + SRC['life_ul'] + '</div>'
        '<div><h3 class="qw-head">🤖 Qwen</h3>' + SRC['qw_ul'] + '</div>'
        '<div><h3 class="ph-head">📸 Переделка фото</h3>' + SRC['photo_ul'] + '</div>'
      '</div></div></details>')

    return ('<!DOCTYPE html>\n<html lang="ru">\n<head>\n' +
      head_html(idx_title, SITE_DESC, 'index.html', 'og/og-index.png', ld(ldgraph)) +
      '\n</head>\n<body>\n' + METRIKA + gtag_snippet() +
      '<a class="skip-link" href="#main">Перейти к содержимому</a>\n'
      '<header class="hero">\n  <div class="wrap">\n'
      '    <span class="logo">⚡ EDIAI.RU · практический ИИ</span>\n'
      '    <h1>ИИ в личной жизни и работе: ' + str(TOTAL) + ' ' + plural(TOTAL, 'готовый промпт', 'готовых промпта', 'готовых промптов') + ', гиды и сравнения</h1>\n'
      '    <p class="sub">Готовые промпты, путеводитель для новичков и честные сравнения нейросетей: переделка фото, генерация изображений, тексты, ИИ в личной жизни, Qwen и основы промптинга. Скопируйте сценарий, подставьте свои данные вместо <span style="color:var(--ph);font-weight:600">[скобок]</span> — и получите результат за минуты.</p>\n'
      '    <div class="stats">'
      '<div class="stat">📚 Всего промптов: <b>' + str(TOTAL) + '</b></div>'
      '<div class="stat">🗂 Разделов: <b>6</b></div>'
      '<div class="stat">🔄 Обновлено: <b>' + esc(UPDATED) + '</b></div>'
      '</div>\n'
      '  </div>\n</header>\n'
      '<main class="wrap" id="main" tabindex="-1">\n'
      '  <h2 class="hub-h">🗂 Разделы</h2>\n'
      '  <div class="bento">' + ''.join(tiles) + '</div>\n'
      '  <h2 class="hub-h">⚡ Как пользоваться</h2>\n'
      '  <div class="steps">' + steps + '</div>\n'
      '  <div class="strips"><div class="info-strip"><span class="ic" aria-hidden="true">🛡️</span>'
      '<span><b>Этика:</b> переделывайте свои фото или те, на которые получено явное согласие человека; '
      'не создавайте дипфейки реальных людей — во многих странах это незаконно; маркируйте изображения, '
      'созданные или изменённые ИИ, в рекламе и СМИ. Памятка — в подразделе «Справочник» раздела '
      '<a href="photo.html" style="color:#4b3ecf">«Переделка фото»</a>.</span></div></div>\n'
      '  <h2 class="hub-h">🔥 Популярные промпты</h2>\n'
      '  <div class="pop-grid">' + ''.join(pops) + '</div>\n'
      '  <h2 class="hub-h">❓ Частые вопросы</h2>\n'
      '  <div class="faq">' + faq + '</div>\n'
      '</main>\n'
      '<footer>\n  <div class="wrap">\n'
      '    ' + nav_html('index.html') + '\n'
      '    ' + sources_grid + '\n'
      '    <b>⚡ Ediai — ИИ в личной жизни и работе</b> · ' + str(TOTAL) + ' проверенных сценариев и промптов: изображения, тексты, редактирование фото, гиды и сравнения.<br>\n'
      '    Шаблоны основаны на общепризнанных практиках промпт-инжиниринга и официальных гайдах; лучшие результаты даёт итерация: сгенерировали → уточнили → повторили.\n'
      '  </div>\n</footer>\n'
      '</body>\n</html>\n')

# ---------------------------------------------------------------- служебные файлы
def redirect_page(new_file, title):
    return ('<!DOCTYPE html>\n<html lang="ru">\n<head>\n'
      '<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n'
      '<title>' + esc(title) + ' — страница переехала</title>\n'
      '<meta name="robots" content="noindex">\n'
      '<link rel="canonical" href="' + SITE_URL + '/' + new_file + '">\n'
      '<meta http-equiv="refresh" content="0; url=' + new_file + '">\n'
      '<script>location.replace("' + new_file + '");</script>\n'
      '</head>\n<body style="background:#f5f6fa;color:#182135;font-family:-apple-system,\'Segoe UI\',Roboto,Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0">\n'
      '<p style="text-align:center;padding:20px;line-height:1.6">Страница переехала.<br>'
      '<a href="' + new_file + '" style="color:#0e7490;font-weight:700">Перейти: ' + esc(title) + ' →</a></p>\n'
      '</body>\n</html>\n')

def robots_txt():
    return ('User-agent: *\nAllow: /\nClean-param: q\n\nSitemap: ' + SITE_URL + '/sitemap.xml\n')

def sitemap_xml():
    pages = [('index.html','1.0')] + [(SECTIONS[k]['file'],'0.8') for k in SECTION_ORDER]
    urls = ''.join(
      '  <url><loc>' + SITE_URL + '/' + f + '</loc><lastmod>' + LASTMOD + '</lastmod>'
      '<changefreq>weekly</changefreq><priority>' + pr + '</priority></url>\n'
      for f, pr in pages)
    return ('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
            + urls + '</urlset>\n')

# ---------------------------------------------------------------- OG-картинки
def og_images():
    try:
        from PIL import Image, ImageDraw, ImageFilter, ImageFont
    except ImportError:
        print('  [!] Pillow не установлен — OG-картинки пропущены (см. README)')
        return
    os.makedirs(os.path.join(OUT, 'og'), exist_ok=True)
    FD = os.path.join(HERE, 'fonts')
    fb = lambda s: ImageFont.truetype(os.path.join(FD,'DejaVuSans-Bold.ttf'), s)
    fr = lambda s: ImageFont.truetype(os.path.join(FD,'DejaVuSans.ttf'), s)
    W, H = 1200, 630

    def wrap(text, font, maxw):
        lines, cur = [], ''
        for w in text.split():
            t = (cur + ' ' + w).strip()
            if font.getlength(t) <= maxw: cur = t
            else:
                if cur: lines.append(cur)
                cur = w
        if cur: lines.append(cur)
        return lines

    def spaced(d, x, y, text, font, fill, spacing):
        for ch in text:
            d.text((x, y), ch, font=font, fill=fill)
            x += d.textlength(ch, font=font) + spacing

    specs = [('og-index.png', 'EDIAI.RU · ПРАКТИЧЕСКИЙ ИИ', 'ИИ в личной жизни и работе',
              str(TOTAL) + ' готовых промптов, гиды и сравнения нейросетей',
              str(TOTAL) + ' промптов · 6 разделов', (139,124,248), (76,201,240))]
    for k in SECTION_ORDER:
        og = SECTIONS[k]['og']
        specs.append(('og-' + k + '.png', 'БАЗА ПРОМПТОВ ДЛЯ ИИ', og['title'], og['sub'],
                      og['pill'], og['accent'], og['accent2']))

    for fname, kicker, title, sub, pill, ac, ac2 in specs:
        base = Image.new('RGBA', (W,H), (245,246,250,255))
        glow = Image.new('RGBA', (W,H), (0,0,0,0))
        gd = ImageDraw.Draw(glow)
        gd.ellipse([W-560,-380,W+340,520], fill=ac+(64,))
        gd.ellipse([-320,H-300,420,H+340], fill=ac2+(48,))
        glow = glow.filter(ImageFilter.GaussianBlur(130))
        img = Image.alpha_composite(base, glow)
        d = ImageDraw.Draw(img)
        # верхняя акцентная полоса
        for x in range(W):
            t = x / W
            d.line([(x,0),(x,5)], fill=tuple(int(ac[i]*(1-t)+ac2[i]*t) for i in range(3))+(255,))
        spaced(d, 90, 74, kicker, fr(26), (102,112,133), 7)
        f_t, f_s, f_p = fb(76), fr(33), fb(28)
        y = 150
        for line in wrap(title, f_t, 1000):
            d.text((88, y), line, font=f_t, fill=(23,32,53)); y += 92
        y += 16
        for line in wrap(sub, f_s, 980):
            d.text((90, y), line, font=f_s, fill=(87,98,122)); y += 46
        pw = d.textlength(pill, font=f_p)
        d.rounded_rectangle([88, H-128, 88+pw+56, H-64], radius=32,
                            fill=ac+(30,), outline=ac+(230,), width=2)
        d.text((116, H-114), pill, font=f_p, fill=tuple(max(0,c-70) for c in ac))
        img.convert('RGB').save(os.path.join(OUT,'og',fname), optimize=True)
    print('  OG-картинки: ' + str(len(specs)) + ' шт.')

# ---------------------------------------------------------------- сборка
def w(path, content):
    full = os.path.join(OUT, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    open(full, 'w', encoding='utf-8', newline='\n').write(content)
    print('  ' + path + '  (' + str(len(content.encode('utf-8'))//1024) + ' КБ)')

def main():
    print('Сборка сайта → ' + OUT)
    w('index.html', build_index())
    for k in SECTION_ORDER:
        w(SECTIONS[k]['file'], build_section(k))
    w('prompt-base.html', redirect_page('index.html', 'ИИ в личной жизни и работе'))
    w('photo-edit-prompts.html', redirect_page('photo.html', 'Переделка фото нейросетью'))
    w('robots.txt', robots_txt())
    w('sitemap.xml', sitemap_xml())
    og_images()
    print('Готово. Всего промптов: ' + str(TOTAL))

if __name__ == '__main__':
    main()
