#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Генератор многостраничного сайта «Ediai — ИИ в личной жизни и работе».

Единый источник данных: data.json (211 промптов, извлечён из исходных страниц).
Генерирует в корень репозитория (OUT):
  index.html          — главная-хаб (bento-плитки, глобальный поиск, шаги, статьи, популярное, FAQ)
  photo.html          — Переделка фото (54)
  generate.html       — Создание изображений (21)
  texts.html          — Тексты (21)
  life.html           — ИИ в личной жизни (56)
  work.html           — ИИ на работе (30)
  qwen.html           — Qwen (23)
  basics.html         — Основы промптинга (6)
  start.html, models.html, glossary.html — база знаний
  keis-ii-pochta.html — статья-кейс «Сколько часов экономит ИИ на письмах и документах»
  robots.txt, sitemap.xml, og/*.png

Фильтры-ограничения на разделах («бесплатно / нужно фото-файл / 5 минут»)
выводятся функцией ftags() из данных карточки; чип показывается, только если
он отсекает часть раздела (0 < n < всего). Глобальный поиск на главной —
индекс SIDX (id/заголовок/раздел/подраздел/описание/теги) + hub.js.

Все страницы самодостаточны (CSS/JS инлайнятся) и содержат статически
отрендеренные карточки: контент виден поисковикам и работает без JS.

Запуск:  python3 build.py
Настройка домена: config.json → site_url
"""
import json, os, re, html as H
from urllib.parse import quote

HERE = os.path.dirname(os.path.abspath(__file__))
OUT  = os.path.normpath(os.path.join(HERE, '..', '..'))  # корень репозитория = готовый сайт (GitHub Pages)

cfg     = json.load(open(os.path.join(HERE, 'config.json'),  encoding='utf-8'))
data    = json.load(open(os.path.join(HERE, 'data.json'),    encoding='utf-8'))
SRC     = json.load(open(os.path.join(HERE, 'sources.json'), encoding='utf-8'))
CSS     = open(os.path.join(HERE, 'style.css'), encoding='utf-8').read()
APPJS   = open(os.path.join(HERE, 'app.js'),    encoding='utf-8').read()
HUBJS   = open(os.path.join(HERE, 'hub.js'),    encoding='utf-8').read()

SITE_URL  = cfg['site_url'].rstrip('/')
SITE_NAME = cfg['site_name']
SITE_DESC = cfg['site_description']
LASTMOD   = cfg['lastmod']
UPDATED   = cfg['updated_label']
MONTH_YEAR = UPDATED  # alias для страниц базы знаний
START_TITLE = 'С чего начать: первая неделя с ИИ — 7 шагов-сценариев | Ediai'
START_DESC  = ('Путеводитель для новичков: семь ежедневных сценариев работы с нейросетью — от формулы промпта '
               'до привычки спрашивать. Готовые промпты, проверки и правила безопасности.')
MODELS_TITLE = 'Какая нейросеть для чего: сравнение задач и моделей | Ediai'
MODELS_DESC  = ('Тексты, фото, изображения с нуля, код, анализ и строгий JSON: какими моделями решать и где '
                'бесплатные тарифы. Замены Midjourney и качество русского языка.')
GLOSS_TITLE = 'Глоссарий терминов ИИ простыми словами: 16 понятий с примерами | Ediai'
GLOSS_DESC  = ('16 понятий нейросетей с примерами из практики: промпт, токен, контекстное окно, галлюцинация, '
               'агент, RAG, few-shot и другие — без формул и маркетинга.')
GA_ID     = cfg.get('ga_id', '').strip()   # Google Analytics 4 Measurement ID (G-…)
ADS_ID    = cfg.get('ads_block_id', '').strip()  # Яндекс РСЯ: блок авторекламы (пусто = реклама выключена)

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

# Яндекс РСЯ, автореклама: два async-скрипта перед </body> на всех страницах сайта.
# Ставим в конец body, а не в head: скрипты async, но так они не конкурируют за раннюю
# загрузку со счётчиками (Метрика/GA4) и не отодвигают первый рендер.
# Рекламные блоки вставляются самим загрузчиком в поток контента.
# Пустой ads_block_id в config.json = сниппет не вставляется (реклама выключена).
def ads_snippet():
    if not ADS_ID:
        return ''
    return ('<!-- Yandex Autoplacement ' + ADS_ID + ' -->\n'
            '<script src="https://yandex.ru/ads/system/context.js" async></script>\n'
            '<script data-page-id="' + ADS_ID + '" src="https://yandex.ru/ads/system/ap-loader.js" async></script>\n'
            '<!-- /Yandex Autoplacement -->\n')

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

# ---------------------------------------------------------------- фильтры-ограничения
# Три «быстрых» тега (стратегия, этап 3): подбор сценария под ограничение пользователя.
# Значения выводятся из данных карточки, чтобы не дублировать ручную разметку:
#   free  — сценарий решается полностью бесплатной нейросетью (всё, кроме платного Midjourney);
#   photo — к запросу нужно прикрепить фото или файл (переделка фото, мультимодальные задачи);
#   quick — быстрый сценарий «один запрос → результат за ~5 минут» (без длинных планов,
#           серий, курсов и многошаговых задач).
# Чип показывается в разделе, только если он отсекает часть карточек (0 < n < всего).
FTAG_META = [
    ('free',  '🆓 Бесплатно',       'Решается бесплатной нейросетью: Qwen Chat, DeepSeek, GigaChat, YandexGPT, Gemini и др.'),
    ('photo', '📷 Нужно фото/файл', 'К запросу нужно прикрепить фотографию, видео или документ'),
    ('quick', '⚡ 5 минут',         'Быстрый сценарий: один запрос — готовый результат за ~5 минут'),
]

def ftags(p):
    """Список фильтров-ограничений промпта: ['free','photo','quick'] (подмножество)."""
    t = []
    sec, cat, sub = p['section'], p['cat'], p['sub']
    # бесплатно: всё, кроме платного Midjourney (DALL·E и SD доступны бесплатно)
    if p['model'] != 'mj':
        t.append('free')
    # нужно фото/файл: переделка фото, Qwen-Image-Edit, мультимодальные задачи «личной жизни»
    if sec == 'photo' or (sec == 'qwen' and sub.startswith('Qwen-Image-Edit')) \
       or (sec == 'life' and p.get('ds') is None):
        t.append('photo')
    # 5 минут: кроме заведомо длинных сценариев (серии и съёмки, лонгриды, планы, курсы, код)
    quick = True
    if sec == 'photo' and cat in ('shoot', 'creative'):       quick = False  # фотосессии и серии — итерации
    if sec == 'texts' and sub == 'Статьи и блоги':            quick = False  # лонгрид с фактурой
    if sec == 'life'  and cat in ('learn', 'travel', 'time'): quick = False  # курсы, маршруты, планы недели
    if sec == 'work'  and cat in ('career', 'plan'):          quick = False  # резюме, планы квартала
    if sec == 'qwen'  and sub.startswith('Qwen-Coder'):       quick = False  # код и отладка
    if quick:
        t.append('quick')
    return t

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
    ('work.html',     '💼 Работа'),
    ('qwen.html',     '🤖 Qwen'),
    ('basics.html',   '🧠 Основы'),
]

def nav_html(current, footer=False):
    links = []
    for f, label in NAV:
        cur = ' aria-current="page"' if f == current else ''
        links.append('<a href="' + f + '"' + cur + '>' + label + '</a>')
    inner = ''.join(links)
    if footer:  # в футере — обычный блок: второй nav дублировал landmark (axe: landmark-unique)
        return '<div class="sections-nav">' + inner + '</div>'
    return '<nav class="sections-nav" aria-label="Разделы сайта">' + inner + '</nav>'

# База знаний: сквозная перелинковка во всех футерах (и вверху страниц базы знаний)
KNOW_NAV = ('<div class="know-nav"><b>📚 База знаний:</b> <a href="start.html">С чего начать</a> · '
            '<a href="models.html">Какая нейросеть для чего</a> · <a href="glossary.html">Глоссарий</a> · '
            '<a href="keis-ii-pochta.html">Статьи и кейсы</a></div>')

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

WORK_STRIPS = (
  '<div class="info-strip"><span class="ic" aria-hidden="true">💡</span>'
  '<span><b>Как пользоваться:</b> раскройте карточку, скопируйте промпт и подставьте свои фактуры вместо '
  '<span style="color:var(--ph)">[скобок]</span> — письма, цифры, тезисы встреч. Шаблоны работают в любой '
  'текстовой нейросети: ChatGPT, Qwen Chat, DeepSeek, GigaChat, YandexGPT. Значок <b>Qwen&nbsp;✓</b> — '
  'проверено в Qwen Chat, <b>DeepSeek&nbsp;✓</b> — в DeepSeek (V3 для писем, R1 для анализа).</span></div>'
  '<div class="info-strip warn-strip"><span class="ic" aria-hidden="true">🔒</span>'
  '<span><b>Конфиденциальность:</b> не загружайте в публичные чат-боты коммерческую тайну, персональные данные, '
  'финотчётность и незакрытые сделки. Обезличивайте перед отправкой: имена и компании → <code>[компания]</code>, '
  'суммы → диапазоны. Юридические формулировки и цифры проверяйте по первоисточнику.</span></div>'
  '<div class="info-strip fact-strip"><span class="ic" aria-hidden="true">📊</span>'
  '<span><b>Почему это работает:</b> рабочие задачи — ~30% всех сообщений ChatGPT, а письмо и редактирование '
  'текстов — 40–42% рабочих запросов (OpenAI + NBER, 2025). Письма и отчёты — самый частый и самый '
  'благодарный кейс делегирования ИИ.</span></div>'
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
  desc='54 промпта для переделки фото нейросетью: стили (акварель, аниме, киберпанк), фотосессии, замена одежды и фона, реставрация и колоризация старых снимков.',
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
  title='Генерация изображений нейросетью — 21 промпт: от логотипа до постера',
  desc='21 промпт генерации изображений: портреты, товары, пейзажи, иллюстрации, логотипы и постеры — с пометками совместимости с Qwen-Image и бесплатными аналогами.',
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
  title='Тексты нейросетью — 21 промпт: копирайтинг, статьи, посты, редактура',
  desc='21 промпт для текстов: продающие формулы, статьи, посты для соцсетей, редактура и деловые письма — для любой текстовой нейросети, на русском языке.',
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
  desc='23 промпта по официальным гайдам Qwen: шестиблочный фреймворк, режимы /think и /no_think, контекст до 1M токенов, JSON в API, генерация изображений и код.',
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
  desc='6 формул промптинга для любой LLM: роль-контекст-задача-формат, few-shot, цепочка рассуждений, самокритика и цикл улучшения ответа — с примерами.',
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
  desc='56 идей ИИ для личной жизни: меню из продуктов под рукой, план тренировок, разбор выписки, медитации, учёба детей, поездки, договоры и почта — с примерами запросов.',
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
'work': dict(
  file='work.html', h1='💼 ИИ на работе', h1_class='',
  plain='ИИ на работе — 30 промптов',
  title='ИИ на работе — 30 промптов: письма, отчёты, встречи, резюме, документы',
  desc='30 промптов для работы: деликатные письма, exec-summary и отчёты, повестки и протоколы, переговоры, резюме под вакансию, регламенты и планы квартала.',
  sub='Рабочие сценарии, которые экономят часы каждую неделю: письма и коммуникации, отчёты и аналитика, встречи и переговоры, резюме и карьера, документы и таблицы, планы и проекты. Подставьте свои фактуры вместо <span style="color:var(--ph);font-weight:600">[скобок]</span> — и отправьте в любую текстовую нейросеть.',
  placeholder='Поиск: письмо, отчёт, переговоры, резюме, регламент, риски…',
  tabs=True,
  cats={'all':{'label':'Все промпты','icon':'📚'},'comm':{'label':'Письма','icon':'✉️'},
        'reports':{'label':'Отчёты и аналитика','icon':'📊'},'meet':{'label':'Встречи и переговоры','icon':'🤝'},
        'career':{'label':'Резюме и карьера','icon':'🚀'},'docs':{'label':'Документы и таблицы','icon':'📄'},
        'plan':{'label':'Планы и проекты','icon':'🗓'}},
  cat_order=['all','comm','reports','meet','career','docs','plan'],
  stats=[('cat','comm','✉️ Письма'),('cat','reports','📊 Отчёты'),('cat','meet','🤝 Переговоры'),
         ('cat','career','🚀 Карьера'),('cat','docs','📄 Документы'),('total',None,'Всего')],
  strips=WORK_STRIPS,
  banner=banner('texts.html','✍️','<b>Промпты для текстов</b> — 21 шаблон копирайтинга, статей, постов и редактуры: продающие формулы AIDA и PAS, деловая переписка.'),
  sources_h2='📖 Источники и данные', sources_note=SRC['work_note'],
  sources_body=SRC['work_ul'],
  foot='<b>💼 ИИ на работе</b> — раздел <a href="index.html">базы промптов для ИИ</a>.<br>Главное правило: обезличивайте перед отправкой — имена, контакты и суммы заменяйте на плейсхолдеры; конфиденциальное остаётся во внутреннем контуре компании.',
  og=dict(title='ИИ на работе', sub='Письма, отчёты, переговоры, резюме, документы — 30 промптов',
          pill='30 промптов · работа', accent=(202,102,40), accent2=(139,124,248)),
),
}
SECTION_ORDER = ['photo','generate','texts','life','work','qwen','basics']

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

def fchips_html(prompts):
    """Чипы-ограничения («бесплатно / нужно фото-файл / 5 минут»).
    Показываем только те, что отсекают часть раздела: 0 < n < len(prompts)."""
    out = []
    for key, label, title in FTAG_META:
        n = sum(1 for p in prompts if key in ftags(p))
        if 0 < n < len(prompts):
            out.append('<button type="button" class="fchip" data-ftag="' + key +
                       '" aria-pressed="false" title="' + attr(title) + '">' + label +
                       '<span class="fc-cnt">' + str(n) + '</span></button>')
    return ''.join(out)

NOSCRIPT_CSS = """
.controls{display:none!important}
.card-body{display:flex!important}
.chev,.copy-btn,#toTop{display:none!important}
pre.prompt{max-height:none!important;padding-top:14px!important}
.card-head{cursor:default}
"""

def head_html(title, desc, path, og_img, ldjson, extra='', og_type='website'):
    url = SITE_URL + '/' + path if path != 'index.html' else SITE_URL + '/'
    return (
'<meta charset="UTF-8">\n'
'<meta name="viewport" content="width=device-width, initial-scale=1.0">\n'
'<title>' + esc(title) + '</title>\n'
'<meta name="description" content="' + attr(desc) + '">\n'
'<link rel="canonical" href="' + url + '">\n'
'<meta property="og:type" content="' + og_type + '">\n'
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
    fch = fchips_html(prompts)
    fchips_row = ('      <div class="fchips" id="fchips" role="group" aria-label="Быстрые фильтры: бесплатно, нужно фото, 5 минут">' +
                  fch + '</div>\n') if fch else ''
    prompts_js = [dict(p, f=ftags(p)) for p in prompts]  # 'f' — фильтры-ограничения для app.js

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
      '<section class="controls" aria-label="Поиск и фильтры раздела">\n  <div class="wrap">\n'
      '    <div class="search-row">\n      <div class="search-box">\n'
      '        <svg fill="none" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/></svg>\n'
      '        <input id="search" type="search" aria-label="Поиск по промптам раздела" placeholder="' + attr(sec['placeholder']) + '" autocomplete="off">\n'
      '        <kbd aria-hidden="true">/</kbd>\n'
      '      </div>\n    </div>\n'
      '    ' + tabs_html(prompts, sec) + '\n'
      '    <div class="chips-row" id="chipsRow">\n'
      '      <button type="button" class="chips-toggle" id="chipsToggle" aria-expanded="false" aria-controls="chips">Подразделы ▾</button>\n'
      '      <div class="chips" id="chips">' + chips_html(prompts, sec) + '</div>\n'
      + fchips_row +
      '    </div>\n'
      '    <div class="results-line">\n'
      '      <span id="results">Показаны все ' + str(len(prompts)) + ' промпта</span>\n'
      '      <span class="mini-btns">\n'
      '        <button class="mini-btn" id="expandAll" type="button">⊞ Развернуть все</button>\n'
      '        <button class="mini-btn" id="collapseAll" type="button">⊟ Свернуть все</button>\n'
      '      </span>\n    </div>\n'
      '  </div>\n</section>\n'
      '<main class="wrap" id="main" tabindex="-1">\n'
      '  <div class="strips">' + sec['strips'] + '</div>\n'
      '  ' + sec['banner'] + '\n'
      '  <div class="grid" id="grid" data-prerendered="1">\n' + grid_html(prompts, sec['cats']) + '\n  </div>\n'
      '  <div class="empty" id="empty">\n    <div class="big" aria-hidden="true">🔍</div>\n'
      '    <p>Ничего не найдено. Попробуйте другой запрос.</p>\n  </div>\n'
      '</main>\n'
      '<footer>\n  <div class="wrap">\n'
      '    ' + nav_html(sec['file'], True) + '\n'
      '    ' + KNOW_NAV + '\n'
      '    ' + sources + '\n'
      '    ' + sec['foot'] + '\n'
      '  </div>\n</footer>\n'
      '<div id="toast" role="status" aria-live="polite"></div>\n'
      '<button id="toTop" title="Наверх" aria-label="Наверх">↑</button>\n'
      '<noscript><style>' + NOSCRIPT_CSS + '</style></noscript>\n'
      '<script>\nconst PAGE = ' + js_json(page_obj) + ';\nconst PROMPTS = ' + js_json(prompts_js) + ';\n</script>\n'
      '<script>\n' + APPJS + '\n</script>\n'
      + ads_snippet() +
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
 dict(key='work', icon='💼', name='ИИ на работе',
      text='Письма и деликатные отказы, exec-summary и отчёты, повестки и протоколы, переговоры, резюме под вакансию, регламенты и планы квартала.',
      subs=['Письма','Отчёты','Переговоры','Резюме','Документы','Планы']),
]

STEPS = [
 ('Выберите раздел','Семь разделов: переделка фото, генерация изображений, тексты, ИИ в личной жизни, ИИ на работе, Qwen и основы промптинга — всего ' + str(TOTAL) + ' шаблонов.'),
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
 ('work.html','резюме','💼 Работа','Резюме под вакансию','Подсветит релевантный опыт и переформулирует достижения с цифрами — без выдумок.'),
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
 ('Можно ли загружать рабочие документы в нейросеть?',
  'Только обезличенные: замените имена, контакты и суммы на плейсхолдеры ([компания], [сумма]). Коммерческую тайну, персональные данные и финотчётность в публичные сервисы не загружайте — для них используют корпоративные решения с условием необучения на ваших данных.'),
]
START_STEPS = [
 ('День 1','Поговорите как с человеком','Формула «Роль → Контекст → Задача → Формат» закрывает 90% задач: попросите роль («ты опытный редактор»), дайте факты и скажите, каким нужен ответ.','basics.html','роль'),
 ('День 2','Ужин из того, что есть','Сфотографируйте полки холодильника и попросите три ужина плюс список покупок — первый опыт «ИИ видит мой мир».','life.html','холодильник'),
 ('День 3','Письмо, которое откладывали','Черновик деликатного письма или ответа руководителю: ИИ предложит тон и структуру, факты останутся ваши.','texts.html','письмо'),
 ('День 4','Деловой портрет из селфи','Прикрепите фото и попросите хедшот для резюме: свет, фон, стиль — лицо без изменений.','photo.html','хедшот'),
 ('День 5','Неделя под контролем','Опишите дела и часы — ИИ соберёт реалистичный план недели с буферами, а не список желаний.','life.html','план'),
 ('День 6','Переводчик с канцелярского','Договор, инструкция или анализы «человеческим языком»: что подписывать, что опасно, что уточнить.','life.html','договор'),
 ('День 7','Пусть проверит себя','Цикл «критик → улучшение»: попросите ИИ найти слабые места собственного ответа и исправить их.','basics.html','критик'),
]

MODELS_MINI = [
 ('Тексты на русском: статьи, письма, редактура','Qwen Chat · DeepSeek-V3 · GigaChat · ChatGPT','Qwen Chat и GigaChat — бесплатно'),
 ('Разбор и редактирование фото по инструкции','Qwen-Image-Edit · Gemini · ChatGPT','Qwen-Image-Edit бесплатно в Qwen Chat'),
 ('Изображения с нуля: постеры, логотипы, персонажи','Qwen-Image · Midjourney · DALL·E · Stable Diffusion','Qwen-Image бесплатно; SD — локально'),
 ('Код и разбор ошибок','Qwen-Coder · DeepSeek-R1 · ChatGPT','Qwen-Coder и DeepSeek — бесплатно'),
 ('Анализ: таблицы, документы, решения','DeepSeek-R1 (DeepThink) · Qwen thinking · ChatGPT','У DeepSeek — переключатель DeepThink'),
 ('Очень длинные документы','Qwen (до 1M токенов) · ChatGPT · DeepSeek (до 128K — частями)','Qwen Chat — бесплатно'),
 ('Строгий JSON для интеграций','DeepSeek-V3 + response_format · Qwen API · OpenAI API','У API есть бесплатные лимиты'),
]

MODELS_FAQ = [
 ('Какая нейросеть лучше пишет по-русски?',
  'Qwen Chat, GigaChat и YandexGPT сильны в русском; DeepSeek-V3 и ChatGPT не отстают. Для официальных писем давайте примеры тона прямо в промпте (приём few-shot).'),
 ('Где бесплатно редактировать фотографии?',
  'Qwen-Image-Edit в Qwen Chat — бесплатно и понимает русский. Альтернативы с бесплатными лимитами: Gemini (Nano Banana) и FLUX.1 Kontext.'),
 ('Чем заменить платный Midjourney?',
  'Qwen-Image (бесплатно, точные надписи на картинках) и Stable Diffusion локально. Описательную часть Midjourney-промптов можно переносить в Qwen-Image без параметров --ar и --niji.'),
 ('Что выбрать для анализа большого документа?',
  'Qwen с контекстом до 1M токенов примет документ целиком; DeepSeek (до 128K) — частями с промежуточными выжимками. Включайте режим рассуждений: /think или DeepThink.'),
]

GLOSSARY = [
 ('Промпт','Текстовая инструкция для нейросети. Чем конкретнее роль, контекст и формат ответа, тем лучше результат.','«Ты нутрициолог. Составь меню на неделю без лактозы. Таблицей».'),
 ('Токен','Кусочек текста, который модель читает как единицу (в русском примерно 3–4 символа). Токенами меряют контекст и цену.','1000 токенов ≈ 150–200 слов.'),
 ('Контекстное окно','Объём текста, который модель держит «в голове» за один заход: переписка плюс загруженные файлы.','Qwen — до 1M токенов, DeepSeek — до 128K.'),
 ('Галлюцинация','Уверенно выдуманный факт: несуществующая ссылка, дата, норма закона. Лечится проверкой по первоисточнику.','Всегда сверяйте суммы, дозировки и пункты договоров.'),
 ('LLM','Большая языковая модель (large language model) — класс моделей, на котором работают чат-боты.','Qwen, GPT, Gemini, DeepSeek — всё это LLM.'),
 ('Мультимодальность','Умение модели понимать не только текст: фото, видео, голос, файлы.','«Вот видео моего приседа — разбери технику».'),
 ('Системный промпт','Скрытая установка, задающая роли и правила поведения ассистента до начала диалога.','В API задаётся полем system.'),
 ('Агент','ИИ, который не только отвечает, но и делает: вызывает инструменты, браузер, код — по шагам достигает цели.','Агент сам соберёт отчёт или забронирует стол.'),
 ('Few-shot','Приём «обучи примерами»: 2–3 образца желаемого формата прямо в промпте.','«Вот три примера моих постов — напиши в этом стиле».'),
 ('Цепочка рассуждений','Режим, когда модель сначала рассуждает пошагово, потом отвечает: сильнее в логике и математике.','/think у Qwen, DeepThink у DeepSeek.'),
 ('Негативный промпт','Перечисление того, чего НЕ должно быть на картинке: лишние пальцы, надписи, водяные знаки.','--no text, watermark в Midjourney.'),
 ('Апскейлер','Инструмент повышения разрешения и резкости готового изображения.','Topaz Photo AI; GFPGAN и CodeFormer — для лиц.'),
 ('Маркировка ИИ-контента','Пометка, что текст или фото созданы ИИ: требование площадок и зарождающихся законов.','В рекламе и СМИ обязательна во многих юрисдикциях.'),
 ('RAG','Ответ по вашим документам: поиск по базе плюс генерация — меньше выдумок.','Чат по договорам компании или конспектам.'),
 ('Дообучение (fine-tune)','Тренировка готовой модели на своих примерах, когда промптов уже мало.','Дорого: сначала попробуйте few-shot и RAG.'),
 ('Температура','Настройка случайности ответа: выше — креативнее, ниже — точнее и суше.','Для фактов 0.2–0.5, для идей 0.8–1.0.'),
]

def build_start():
    return ('''<section class="hero">
  <h1>Первая неделя с ИИ: путеводитель по семи шагам</h1>
  <p class="hub-sub">Каждый день — один сценарий на пять минут. Ссылки открывают готовый промпт в разделе сайта: копируйте, подставляйте свои детали, отмечайте, что сработало.</p>
  <p class="hub-meta">Обновлено ''' + MONTH_YEAR + ''' · Бесплатные чат-боты · Проверено на русском языке</p>
</section>
<div class="strip">
  <h2>Как идти</h2>
  <div class="guide">
''')
def _start_body():
    s = ''
    for i, (day, t, txt, pg, q) in enumerate(START_STEPS):
        s += ('    <div class="gstep"><span class="s-n">' + str(i + 1) + '</span><div><h3>' + day + ' · ' + t +
              '</h3><p>' + txt + '</p><p class="p-go"><a href="' + pg + '?q=' + q + '">Открыть промпт в разделе →</a></p></div></div>\n')
    return s
def _start_tail():
    return ('''  </div>
  <h2>Правила безопасности — коротко</h2>
  <ul>
    <li>Не отправляйте в чат-боты паспортные данные, номера карт и пароли.</li>
    <li>Перепроверяйте суммы, дозировки и юридические формулировки по первоисточнику.</li>
    <li>Не публикуйте переписку с личными данными.</li>
  </ul>
  <p class="p-go"><a href="index.html#razdely">Все сценарии по разделам →</a> · <a href="models.html">Какая нейросеть для чего →</a></p>
</div>
''')
def build_models():
    return ('''<section class="hero">
  <h1>Какая нейросеть для чего: сравнение задач и моделей</h1>
  <p class="hub-sub">Тексты, фотографии, изображения с нуля, код, анализ и строгий JSON — с бесплатными вариантами и заменами. Тарифы меняются: сверяйте даты обновлений.</p>
  <p class="hub-meta">Обновлено ''' + MONTH_YEAR + ''' · Бесплатные тарифы · Русский язык</p>
</section>
<div class="strip">
  <h2>Задача → модель</h2>
  <div class="table-wrap" tabindex="0" role="region" aria-label="Таблица с горизонтальной прокруткой">
    <table class="cmp">
      <tr><th>Задача</th><th>Чем решать</th><th>Бесплатный вариант</th></tr>
''')
def _models_body():
    s = ''
    for task, models, free in MODELS_MINI:
        s += '      <tr><td>' + task + '</td><td>' + models + '</td><td>' + free + '</td></tr>\n'
    return s
def _models_faq():
    s = '  </table>\n  </div>\n  <h2>Частые вопросы</h2>\n  <div class="faq">\n'
    for q, a in MODELS_FAQ:
        s += ('    <details><summary>' + q + '</summary><p>' + a + '</p></details>\n')
    s += ('  </div>\n  <p class="p-go"><a href="glossary.html">Глоссарий терминов →</a> · <a href="start.html">С чего начать →</a></p>\n</div>\n')
    return s
def build_glossary():
    return ('''<section class="hero">
  <h1>Глоссарий терминов ИИ простыми словами</h1>
  <p class="hub-sub">Шестнадцать понятий, которые встречаются в статьях и подсказках чат-ботов, — с короткими примерами из практики. Без формул и маркетинга.</p>
  <p class="hub-meta">Обновлено ''' + MONTH_YEAR + ''' · Простыми словами · С примерами</p>
</section>
<div class="strip">
  <h2>Термины</h2>
  <div class="gloss">
''')
def _gloss_body():
    s = ''
    for term, d, ex in GLOSSARY:
        s += '    <div class="term"><b>' + term + '</b><p>' + d + '</p><p class="ex">' + ex + '</p></div>\n'
    return s
def _gloss_tail():
    return ('''  </div>
  <p class="p-go"><a href="models.html">Какая нейросеть для чего →</a> · <a href="start.html">С чего начать →</a></p>
</div>
''')
def know_page(path, title, desc, ogimg, ldgraph, content, navcur, og_type='website'):
    return ('<!DOCTYPE html>\n<html lang="ru">\n<head>\n' +
      head_html(title, desc, path, ogimg, ld(ldgraph), og_type=og_type) +
      '\n</head>\n<body>\n' + METRIKA + gtag_snippet() +
      '<a class="skip-link" href="#main">Перейти к содержимому</a>\n'
      '<main class="wrap" id="main" tabindex="-1">\n'
      '  ' + nav_html(navcur) + '\n'
      '  ' + KNOW_NAV + '\n' + content + '\n</main>\n'
      '<footer>\n  <div class="wrap">\n    ' + nav_html(navcur, True) + '\n'
      '    ' + KNOW_NAV + '\n'
      '    <b>⚡ Ediai — ИИ в личной жизни и работе</b> · база знаний: путеводитель для новичков, сравнения моделей, глоссарий и статьи-кейсы с цифрами.<br>\n'
      '    Тарифы и возможности нейросетей меняются — сверяйте дату обновления; важные решения проверяйте по первоисточникам.\n'
      '  </div>\n</footer>\n'
      '<div id="toast" role="status" aria-live="polite"></div>\n'
      + ads_snippet() +
      '</body>\n</html>\n')

def know_start():
    ld = {"@context":"https://schema.org","@graph":[
      WEBSITE_LD,
      {"@type":"WebPage","@id":SITE_URL+"/start.html","url":SITE_URL+"/start.html",
       "name":"Первая неделя с ИИ: путеводитель по семи шагам","description":START_DESC,
       "inLanguage":"ru","isPartOf":{"@id":SITE_URL+"/#website"}},
      {"@type":"HowTo","name":"Первая неделя с ИИ",
       "step":[{"@type":"HowToStep","position":i+1,"name":day+" · "+t,"text":txt,
                "url":SITE_URL+"/"+pg+"?q="+q} for i,(day,t,txt,pg,q) in enumerate(START_STEPS)]},
    ]}
    return know_page('start.html', START_TITLE, START_DESC, 'og/og-start.png', ld,
                     build_start() + _start_body() + _start_tail(), 'start.html')

def know_models():
    ld = {"@context":"https://schema.org","@graph":[
      WEBSITE_LD,
      {"@type":"WebPage","@id":SITE_URL+"/models.html","url":SITE_URL+"/models.html",
       "name":"Какая нейросеть для чего: сравнение задач и моделей","description":MODELS_DESC,
       "inLanguage":"ru","isPartOf":{"@id":SITE_URL+"/#website"}},
      {"@type":"FAQPage","mainEntity":[{"@type":"Question","name":q,
        "acceptedAnswer":{"@type":"Answer","text":a}} for q,a in MODELS_FAQ]},
    ]}
    return know_page('models.html', MODELS_TITLE, MODELS_DESC, 'og/og-models.png', ld,
                     build_models() + _models_body() + _models_faq(), 'models.html')

def know_glossary():
    ld = {"@context":"https://schema.org","@graph":[
      WEBSITE_LD,
      {"@type":"WebPage","@id":SITE_URL+"/glossary.html","url":SITE_URL+"/glossary.html",
       "name":"Глоссарий терминов ИИ простыми словами","description":GLOSS_DESC,
       "inLanguage":"ru","isPartOf":{"@id":SITE_URL+"/#website"}},
      {"@type":"DefinedTermSet","name":"Глоссарий терминов ИИ",
       "hasPart":[{"@type":"DefinedTerm","name":t,"description":d} for t,d,ex in GLOSSARY]},
    ]}
    return know_page('glossary.html', GLOSS_TITLE, GLOSS_DESC, 'og/og-glossary.png', ld,
                     build_glossary() + _gloss_body() + _gloss_tail(), 'glossary.html')

# ---------------------------------------------------------------- статьи-кейсы
# ШАБЛОН СЕРИИ «Статьи и кейсы» (стратегия, этап 3: 1–2 статьи в месяц).
# Структура каждой статьи (копируйте для следующих):
#   1. hero: H1 с цифрой/выгодой + лид (hub-sub) + мета (hub-meta: обновление, время чтения);
#   2. «Коротко» — 3–5 тезисов (ul в .strip);
#   3. «Что говорят исследования» — таблица .cmp: цифра | что означает | источник (ссылка);
#   4. «Пример расчёта» — таблица .cmp + пометка, что расчёт иллюстративный;
#   5. Сценарий с промптами — карточки .gstep со ссылками на карточки разделов (file.html#pN);
#   6. warn-strip с ограничениями (конфиденциальность, галлюцинации);
#   7. «Как повторить» — чек-лист (ul) → дублируется HowTo в JSON-LD;
#   8. баннер на раздел-донор промптов + анонс следующей статьи;
#   9. <details class="sources"> — источники цифр.
# Разметка: Article (headline/articleBody — для контентной аналитики Метрики) + HowTo + WebPage.
# Правила: цифры — только из опубликованных исследований (со ссылкой) или явно
# помеченные как иллюстративный расчёт; никаких выдуманных «отзывов пользователей».

KEIS_FILE  = 'keis-ii-pochta.html'
KEIS_TITLE = 'Сколько часов экономит ИИ на письмах и документах — цифры и промпты | Ediai'
KEIS_DESC  = ('Кейс с цифрами: сколько времени съедают письма и документы, что показывают исследования '
              'OpenAI, NBER, Microsoft и hh.ru, расчёт экономии и 7 промптов недели.')
KEIS_H1    = 'Сколько часов экономит ИИ на письмах и документах'

# (цифра, что означает, источник — HTML со ссылкой)
KEIS_RESEARCH = [
 ('~30%', 'доля рабочих задач среди всех сообщений ChatGPT — работа давно не «меньшинство», а огромный пласт применения ИИ',
  '<a href="https://www.nber.org/system/files/working_papers/w34255/w34255.pdf" target="_blank" rel="noopener">OpenAI + NBER, WP №34255 (2025)</a>'),
 ('40–42%', 'рабочих запросов к ChatGPT — написание и редактирование текстов: письма и документы дают нейросетям чаще всего',
  '<a href="https://www.nber.org/system/files/working_papers/w34255/w34255.pdf" target="_blank" rel="noopener">OpenAI + NBER, WP №34255 (2025)</a>'),
 ('57%', 'российских компаний уже внедрили ИИ (январь 2026); 37% называют это главным успехом года — навык становится нормой',
  '<a href="https://www.cnews.ru/news/line/2026-01-23_57_kompanij_uzhe_vnedrili" target="_blank" rel="noopener">CNews (2026)</a>'),
 ('+34%', 'медианная зарплата специалистов с навыком работы с ИИ выше (II кв. 2025) — экономия времени конвертируется в деньги',
  '<a href="https://hh.ru/article/kak-ii-menyaet-professii-i-komu-nuzhno-uchitsya-s-nim-rabotat" target="_blank" rel="noopener">hh.ru (2026)</a>'),
 ('1,3 млн', 'AI-вакансий — рынок труда явно сигнализирует: «уметь работать с ИИ» из плюса превращается в базовое требование',
  '<a href="https://news.microsoft.com/annual-work-trend-index-2026/" target="_blank" rel="noopener">Microsoft Work Trend Index (2026)</a>'),
]

# (задача, без ИИ, с ИИ, пояснение) — иллюстративный расчёт рабочей недели
KEIS_CALC = [
 ('Черновик делового письма', '10–15 мин', '3–5 мин', 'ИИ даёт структуру и тон, факты и финальная редактура — ваши'),
 ('Exec-summary документа на 20 страниц', '40–60 мин', '10–15 мин', 'выжимка за один запрос; ключевые выводы перечитайте сами'),
 ('Протокол встречи', '20–30 мин', '5–10 мин', 'из ваших тезисов — документ с договорённостями и ответственными'),
 ('Отчёт недели из фактов', '45–60 мин', '10–15 мин', 'цифры ваши, сборка и формулировки — нейросети'),
 ('Пункт договора «человеческим языком»', '15–30 мин', '3–5 мин', 'риски и вопросы второй стороне; важное проверяет юрист'),
]

# (id промпта, день/ситуация, заголовок, короткое описание) — 7 промптов недели
KEIS_STEPS = [
 ('p184', 'Понедельник', 'Follow-up после встречи', 'Встреча закончилась — через 5 минут у участников резюме, договорённости и сроки.'),
 ('p182', 'Вторник', 'Отказать, не сжигая мосты', 'Вежливый, но твёрдый отказ клиенту или коллеге: тон сохраняет отношения.'),
 ('p187', 'Среда', 'Exec-summary длинного документа', 'Отчёт на 20 страниц помещается в один экран: выводы, риски, решения.'),
 ('p194', 'Четверг', 'Протокол встречи из черновика', 'Ваши тезисы превращаются в протокол с ответственными и дедлайнами.'),
 ('p190', 'Пятница', 'Отчёт недели из фактов', 'Список сделанного — в структурированный отчёт для руководителя.'),
 ('p203', 'В течение недели', 'Пункт договора человеческим языком', 'Что на самом деле подписываете: риски и вопросы второй стороне.'),
 ('p202', 'В течение недели', 'Таблица из неструктурированного текста', 'Каша из чата или файла — в аккуратную таблицу для отчёта.'),
]

KEIS_HOWTO = [
 'Выберите 2–3 задачи из таблицы расчёта, которые съедают больше всего времени именно у вас.',
 'Откройте промпт в разделе «ИИ на работе», скопируйте и замените данные в [скобках] на свои факты.',
 'Получите черновик и доуточните тон одной-двумя репликами: «короче», «формальнее», «добавь цифры».',
 'Потратьте 3–5 минут на проверку фактов, цифр и формулировок — ответственность всегда на человеке.',
 'Через две недели посчитайте фактическое время и сравните с расчётом — скорректируйте свой сценарий.',
]

def keis_content():
    s = ('<section class="hero">\n'
         '  <h1>' + KEIS_H1 + '</h1>\n'
         '  <p class="hub-sub">Кейс с цифрами: письма, отчёты и протоколы — самые частые рабочие задачи для нейросетей. '
         'Что показывают исследования 2025–2026 годов, как посчитать свою экономию и какие 7 промптов закрывают '
         'типовую рабочую неделю.</p>\n'
         '  <p class="hub-meta">Обновлено ' + MONTH_YEAR + ' · ~6 минут чтения · Кейс редакции Ediai</p>\n'
         '</section>\n'
         '<div class="strip">\n'
         '  <h2>Коротко</h2>\n'
         '  <ul>\n'
         '    <li>Письма и документы — задача №1 для ИИ на работе: <b>40–42% рабочих запросов</b> к ChatGPT — это тексты (OpenAI + NBER, 2025).</li>\n'
         '    <li>Схема экономии простая: нейросеть собирает черновик за 1–2 минуты, вы тратите 3–5 минут на факты и тон — вместо 15–60 минут на документ с нуля.</li>\n'
         '    <li>Ниже — иллюстративный расчёт рабочей недели и 7 готовых промптов из раздела <a href="work.html">«ИИ на работе»</a>.</li>\n'
         '    <li>Навык окупается буквально: медианная зарплата специалистов с умением работать с ИИ — <b>+34%</b> (hh.ru).</li>\n'
         '  </ul>\n'
         '  <h2>Что говорят исследования</h2>\n'
         '  <div class="table-wrap" tabindex="0" role="region" aria-label="Таблица с горизонтальной прокруткой">\n    <table class="cmp">\n'
         '      <tr><th>Цифра</th><th>Что означает</th><th>Источник</th></tr>\n')
    for num, mean, src in KEIS_RESEARCH:
        s += '      <tr><td>' + num + '</td><td>' + mean + '</td><td>' + src + '</td></tr>\n'
    s += ('    </table>\n  </div>\n'
          '  <h2>Пример расчёта: рабочая неделя писем и документов</h2>\n'
          '  <div class="table-wrap" tabindex="0" role="region" aria-label="Таблица с горизонтальной прокруткой">\n    <table class="cmp">\n'
          '      <tr><th>Задача</th><th>Без ИИ</th><th>С ИИ</th><th>Пояснение</th></tr>\n')
    for task, wo, w_, note in KEIS_CALC:
        s += '      <tr><td>' + task + '</td><td>' + wo + '</td><td>' + w_ + '</td><td>' + note + '</td></tr>\n'
    s += ('    </table>\n  </div>\n'
          '  <p class="art-note">Расчёт иллюстративный, а не обещание: подставьте свои цифры. Принцип один — '
          'нейросеть забирает 70–80% механической сборки черновика, человек оставляет себе факты, суждения '
          'и ответственность. Если таких задач в неделе пять-семь, высвобождается от 3–4 часов — почти '
          'половина рабочего дня.</p>\n'
          '  <h2>7 промптов на рабочую неделю</h2>\n'
          '  <div class="guide">\n')
    for i, (pid, day, t, txt) in enumerate(KEIS_STEPS):
        s += ('    <div class="gstep" id="keis-' + pid + '"><span class="s-n">' + str(i + 1) + '</span><div>'
              '<h3>' + day + ' · ' + t + '</h3><p>' + txt + '</p>'
              '<p class="p-go"><a href="work.html#' + pid + '">Открыть промпт в разделе →</a></p></div></div>\n')
    s += ('  </div>\n'
          '  <div class="info-strip warn-strip"><span class="ic" aria-hidden="true">🔒</span>'
          '<span><b>Прежде чем копировать:</b> не отправляйте в публичные чат-боты коммерческую тайну, '
          'персональные данные и финотчётность — обезличивайте: имена и компании → <code>[компания]</code>, '
          'суммы → диапазоны. ИИ галлюцинирует: цифры, даты, цитаты и юридические формулировки проверяйте '
          'по первоисточнику.</span></div>\n'
          '  <h2>Как повторить этот кейс</h2>\n'
          '  <ul>\n')
    for i, st in enumerate(KEIS_HOWTO):
        s += '    <li><b>' + str(i + 1) + '.</b> ' + st + '</li>\n'
    s += ('  </ul>\n'
          '  ' + banner('work.html', '💼', '<b>«ИИ на работе»</b> — все 30 промптов раздела: письма и деликатные '
                       'отказы, отчёты и exec-summary, встречи и переговоры, резюме, документы и планы.') + '\n'
          '  <p class="art-next">Следующий кейс серии: <b>«Неделя ИИ-меню: что вышло»</b> — эксперимент с меню '
          'из того, что есть в холодильнике: цифры, выводы и промпты из раздела '
          '<a href="life.html">«ИИ в личной жизни»</a>.</p>\n'
          '  <details class="sources"><summary><h2>📖 Источники кейса</h2>'
          '<span class="src-hint">показать список</span></summary>'
          '<div class="sources-in"><p class="note">Цифры — из опубликованных исследований по ссылкам ниже; '
          'таблица расчёта — иллюстративная модель редакции Ediai. Промпты — из раздела «ИИ на работе», '
          'составлены редакцией. Проверено: ' + UPDATED + '.</p>' + SRC['work_ul'] + '</div></details>\n'
          '</div>\n')
    return s

def know_case():
    url = SITE_URL + '/' + KEIS_FILE
    body_text = ('Письма и документы — самые частые рабочие задачи для нейросетей: 40–42% рабочих запросов '
                 'к ChatGPT — написание и редактирование текстов (OpenAI + NBER, 2025). Нейросеть собирает '
                 'черновик за 1–2 минуты, человек тратит 3–5 минут на факты и тон вместо 15–60 минут на '
                 'документ с нуля. В кейсе: цифры исследований (доля рабочих задач ~30%, 57% российских '
                 'компаний внедрили ИИ, медианная зарплата с навыком ИИ +34%, 1,3 млн AI-вакансий), '
                 'иллюстративный расчёт рабочей недели и 7 готовых промптов: follow-up после встречи, '
                 'деликатный отказ, exec-summary, протокол, отчёт недели, разбор пункта договора, таблица '
                 'из неструктурированного текста.')
    ld = {"@context":"https://schema.org","@graph":[
      WEBSITE_LD,
      {"@type":"WebPage","@id":url,"url":url,
       "name":KEIS_H1,"description":KEIS_DESC,
       "inLanguage":"ru","isPartOf":{"@id":SITE_URL+"/#website"}},
      {"@type":"Article","@id":url,"url":url,
       "headline":KEIS_H1 + ": цифры и 7 промптов",
       "description":KEIS_DESC,"inLanguage":"ru",
       "image":[SITE_URL+"/og/og-keis-pochta.png"],
       "author":{"@type":"Organization","name":"Ediai","url":SITE_URL+"/"},
       "publisher":{"@type":"Organization","name":"Ediai","url":SITE_URL+"/"},
       "datePublished":LASTMOD,"dateModified":LASTMOD,
       "articleBody":body_text,
       "keywords":"ИИ на работе, письма, документы, экономия времени, промпты, кейс, exec-summary, протокол встречи",
       "isPartOf":{"@id":SITE_URL+"/#website"},
       "mainEntityOfPage":{"@type":"WebPage","@id":url}},
      {"@type":"HowTo","name":"Как повторить кейс «ИИ на письмах и документах»",
       "step":[{"@type":"HowToStep","position":i+1,"name":st} for i,st in enumerate(KEIS_HOWTO)]},
    ]}
    return know_page(KEIS_FILE, KEIS_TITLE, KEIS_DESC, 'og/og-keis-pochta.png', ld,
                     keis_content(), KEIS_FILE, og_type='article')

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

    # глобальный поиск: компактный индекс всех промптов (без текстов — страницу не раздуваем)
    nav_by_file = {f: label for f, label in NAV}
    sidx = [{'i': p['id'], 't': p['title'], 's': p['section'], 'c': p['sub'],
             'd': p['desc'], 'g': ' '.join(p['tags'])} for p in PROMPTS]
    sectmeta = {k: {'f': SECTIONS[k]['file'], 'n': nav_by_file[SECTIONS[k]['file']]}
                for k in SECTION_ORDER}

    hub_search = (
      '  <h2 class="hub-h">🔎 Найти сценарий</h2>\n'
      '  <div class="hub-search" id="hubSearch">\n'
      '    <div class="search-box">\n'
      '      <svg fill="none" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/></svg>\n'
      '      <input id="hubQ" type="search" aria-label="Поиск по всем ' + str(TOTAL) + ' промптам базы" '
      'placeholder="Поиск по всем ' + str(TOTAL) + ' промптам: резюме, хедшот, холодильник, отчёт…" autocomplete="off">\n'
      '      <kbd aria-hidden="true">/</kbd>\n'
      '    </div>\n'
      '    <p class="hub-search-hint" id="hubHint">Начните вводить задачу — подходящие сценарии появятся здесь '
      'и откроются карточкой в нужном разделе. Хоткей «/», Esc — сброс.</p>\n'
      '    <div class="hub-res" id="hubRes" aria-live="polite" hidden></div>\n'
      '    <noscript><style>.hub-search .search-box,#hubHint{display:none!important}</style>'
      '<p class="hub-search-hint">Поиск работает с включённым JavaScript. Все ' + str(TOTAL) + ' ' +
      plural(TOTAL, 'промпт', 'промпта', 'промптов') + ' доступны и без него — выберите раздел ниже: '
      'карточки и тексты промптов отрендерены статически.</p></noscript>\n'
      '  </div>\n')

    cases_block = (
      '  <h2 class="hub-h">📈 Статьи и кейсы</h2>\n'
      '  <div class="pop-grid">\n'
      '    <a class="pop case" href="' + KEIS_FILE + '"><span class="p-cat">Кейс · ИИ на работе</span>'
      '<h3>Сколько часов экономит ИИ на письмах и документах</h3>'
      '<p>Цифры исследований OpenAI, NBER, Microsoft и hh.ru, пример расчёта рабочей недели '
      'и 7 готовых промптов: от follow-up до exec-summary и протокола встречи.</p>'
      '<span class="p-go">Читать кейс →</span></a>\n'
      '    <div class="pop soon"><span class="p-cat">Готовится</span><h3>«Неделя ИИ-меню: что вышло»</h3>'
      '<p>Следующий кейс — про быт: меню из того, что есть в холодильнике, список покупок и экономия '
      'в цифрах. Промпты — в разделе «ИИ в личной жизни».</p><span class="p-go">Скоро</span></div>\n'
      '  </div>\n')

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
        '<div><h3 class="work-head">💼 ИИ на работе</h3>' + SRC['work_ul'] + '</div>'
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
      '    <p class="sub">Готовые промпты, путеводитель для новичков, честные сравнения нейросетей и статьи-кейсы с цифрами: переделка фото, генерация изображений, тексты, ИИ в личной жизни и на работе, Qwen и основы промптинга. Скопируйте сценарий, подставьте свои данные вместо <span style="color:var(--ph);font-weight:600">[скобок]</span> — и получите результат за минуты.</p>\n'
      '    <div class="stats">'
      '<div class="stat">📚 Всего промптов: <b>' + str(TOTAL) + '</b></div>'
      '<div class="stat">🗂 Разделов: <b>' + str(len(SECTION_ORDER)) + '</b></div>'
      '<div class="stat">🔄 Обновлено: <b>' + esc(UPDATED) + '</b></div>'
      '</div>\n'
      '  </div>\n</header>\n'
      '<main class="wrap" id="main" tabindex="-1">\n'
      + hub_search +
      '  <h2 class="hub-h" id="razdely">🗂 Разделы</h2>\n'
      '  <div class="bento">' + ''.join(tiles) + '</div>\n'
      '  <h2 class="hub-h">⚡ Как пользоваться</h2>\n'
      '  <div class="steps">' + steps + '</div>\n'
      '  <div class="strips"><div class="info-strip"><span class="ic" aria-hidden="true">🛡️</span>'
      '<span><b>Этика:</b> переделывайте свои фото или те, на которые получено явное согласие человека; '
      'не создавайте дипфейки реальных людей — во многих странах это незаконно; маркируйте изображения, '
      'созданные или изменённые ИИ, в рекламе и СМИ. Памятка — в подразделе «Справочник» раздела '
      '<a href="photo.html" style="color:#4b3ecf">«Переделка фото»</a>.</span></div></div>\n'
      '  <h2 class="hub-h">🧭 С чего начать</h2>\n'
      '  <div class="pop-grid start-grid">\n' + ''.join(
          '    <a class="pop sc" href="' + pg + '?q=' + q + '"><span class="p-cat">' + day + '</span><h3>' + t +
          '</h3><p>' + txt + '</p><span class="p-go">Открыть промпт →</span></a>\n'
          for day, t, txt, pg, q in START_STEPS) +
      '    <a class="pop sc sc-all" href="start.html"><span class="p-cat">Путеводитель</span><h3>Первая неделя с ИИ</h3>'
      '<p>Семь шагов-сценариев: от формулы промпта до привычки спрашивать. Проверки и типовые ошибки новичков.</p>'
      '<span class="p-go">Открыть путеводитель →</span></a>\n'
      '  </div>\n'
      '  <h2 class="hub-h">🎯 Какая нейросеть для чего</h2>\n'
      '  <div class="table-wrap" tabindex="0" role="region" aria-label="Таблица с горизонтальной прокруткой">\n    <table class="cmp">\n'
      '      <tr><th>Задача</th><th>Чем решать</th><th>Бесплатный вариант</th></tr>\n' + ''.join(
          '      <tr><td>' + task + '</td><td>' + models + '</td><td>' + free + '</td></tr>\n'
          for task, models, free in MODELS_MINI) +
      '    </table>\n  </div>\n'
      '  <p class="mini-more"><a href="models.html">Полное сравнение: бесплатные тарифы, русский язык, замены →</a> · '
      '<a href="glossary.html">Глоссарий терминов →</a></p>\n'
      + cases_block +
      '  <h2 class="hub-h">🔥 Популярные промпты</h2>\n'
      '  <div class="pop-grid">' + ''.join(pops) + '</div>\n'
      '  <h2 class="hub-h">❓ Частые вопросы</h2>\n'
      '  <div class="faq">' + faq + '</div>\n'
      '</main>\n'
      '<footer>\n  <div class="wrap">\n'
      '    ' + nav_html('index.html', True) + '\n'
      '    ' + KNOW_NAV + '\n'
      '    ' + sources_grid + '\n'
      '    <b>⚡ Ediai — ИИ в личной жизни и работе</b> · ' + str(TOTAL) + ' проверенных сценариев и промптов: изображения, тексты, редактирование фото, гиды и сравнения.<br>\n'
      '    Шаблоны основаны на общепризнанных практиках промпт-инжиниринга и официальных гайдах; лучшие результаты даёт итерация: сгенерировали → уточнили → повторили.\n'
      '  </div>\n</footer>\n'
      '<script>\nconst SIDX = ' + js_json(sidx) + ';\nconst SECTMETA = ' + js_json(sectmeta) + ';\n</script>\n'
      '<script>\n' + HUBJS + '\n</script>\n'
      + ads_snippet() +
      '</body>\n</html>\n')

# ---------------------------------------------------------------- служебные файлы
def robots_txt():
    return ('User-agent: *\nAllow: /\nClean-param: q\n\nSitemap: ' + SITE_URL + '/sitemap.xml\n')

def sitemap_xml():
    pages = [('index.html','1.0')] + [(SECTIONS[k]['file'],'0.8') for k in SECTION_ORDER] + \
            [('start.html','0.7'),('models.html','0.7'),('glossary.html','0.6'),(KEIS_FILE,'0.7')]
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

    specs = [
      ('og-start.png', 'EDIAI.RU · БАЗА ЗНАНИЙ', 'Первая неделя с ИИ',
       'Семь шагов-сценариев: от формулы промпта до привычки спрашивать',
       'путеводитель · 7 шагов', (52,186,134), (139,124,248)),
      ('og-models.png', 'EDIAI.RU · БАЗА ЗНАНИЙ', 'Какая нейросеть для чего',
       'Задача → модель: тексты, фото, изображения, код, анализ, JSON',
       'сравнение · бесплатные тарифы', (139,124,248), (76,201,240)),
      ('og-glossary.png', 'EDIAI.RU · БАЗА ЗНАНИЙ', 'Глоссарий терминов ИИ',
       '16 понятий простыми словами: промпт, токен, галлюцинация, агент, RAG',
       'словарь · с примерами', (76,201,240), (139,124,248)),
      ('og-keis-pochta.png', 'EDIAI.RU · СТАТЬИ И КЕЙСЫ', 'Сколько часов экономит ИИ',
       'Письма и документы: цифры исследований, расчёт недели, 7 промптов',
       'кейс · цифры · 7 промптов', (235,150,60), (139,124,248)),
      ('og-index.png', 'EDIAI.RU · ПРАКТИЧЕСКИЙ ИИ', 'ИИ в личной жизни и работе',
              str(TOTAL) + ' готовых промптов, гиды и сравнения нейросетей',
              str(TOTAL) + ' промптов · ' + str(len(SECTION_ORDER)) + ' разделов', (139,124,248), (76,201,240))]
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
    w('start.html', know_start())
    w('models.html', know_models())
    w('glossary.html', know_glossary())
    w(KEIS_FILE, know_case())
    w('robots.txt', robots_txt())
    w('sitemap.xml', sitemap_xml())
    og_images()
    print('Готово. Всего промптов: ' + str(TOTAL))

if __name__ == '__main__':
    main()
