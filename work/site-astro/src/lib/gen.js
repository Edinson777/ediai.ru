/**
 * Порт генерирующих функций work/site-src/build.py на JS.
 * Каждая функция повторяет питоновскую байт-в-байт (проверяется scripts/verify.py).
 * Данные: src/vendor/sections.json (выгружается из build.py автоматически).
 */

// ---------------------------------------------------------------- helpers
export function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// аналог Python html.escape(s, quote=True)
export function attr(s) {
  return esc(s).replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
}

// подсветка [скобок] — тот же алгоритм, что в app.js
export function highlight(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\[([^\]\n]{1,120})\]/g, (m, g) => '<span class="ph">[' + g + ']</span>');
}

export function plural(n, f1, f2, f5) {
  n = Math.abs(parseInt(n, 10)) % 100;
  if (n >= 11 && n <= 14) return f5;
  const m = n % 10;
  if (m === 1) return f1;
  if (m >= 2 && m <= 4) return f2;
  return f5;
}

// JSON для вставки внутрь <script> (экранируем '</' во избежание закрытия тега)
export function jsJson(obj) {
  return JSON.stringify(obj).replace(/<\//g, '<\\/');
}

export function ld(obj) {
  return JSON.stringify(obj).replace(/<\//g, '<\\/');
}

export const CHEV = "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' aria-hidden='true'><path d='M6 9l6 6 6-6'/></svg>";
export const COPY_IC = "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' aria-hidden='true'><rect x='9' y='9' width='12' height='12' rx='2'/><path d='M5 15V5a2 2 0 0 1 2-2h10'/></svg>";

// ---------------------------------------------------------------- пилюли совместимости
export function qpillHtml(qw) {
  if (qw === 'chat') return "<span class='qpill full' title='Работает в Qwen Chat без изменений'>Qwen ✓</span>";
  if (qw === 'img') return "<span class='qpill full' title='Работает в Qwen-Image без изменений'>Qwen-Image ✓</span>";
  if (qw === 'core') {
    return ("<span class='qpill core' title='Описательная часть промпта работает в Qwen-Image; "
      + "параметры --ar / --niji / --style raw специфичны для Midjourney — размер и стиль "
      + "в Qwen задаются в интерфейсе или API'>→ Qwen-Image</span>");
  }
  return '';
}

export function dspillHtml(ds) {
  if (ds === 'ok') {
    return ("<span class='dspill full' title='Работает в DeepSeek: V3 (deepseek-chat) для текстов "
      + "и креатива, R1 (deepseek-reasoner / DeepThink) для анализа, логики и кода'>DeepSeek ✓</span>");
  }
  if (ds === 'think') {
    return ("<span class='dspill note' title='Ключи /think и /no_think специфичны для Qwen. Аналог в DeepSeek: "
      + "переключатель DeepThink (R1) в чате или выбор модели в API — deepseek-reasoner / deepseek-chat'>DeepSeek: аналог</span>");
  }
  if (ds === 'ctx') {
    return ("<span class='dspill note' title='Контекст DeepSeek — до 128K токенов, а не 1M: очень длинные документы "
      + "разбивайте на части и подавайте последовательно с промежуточными выжимками'>DeepSeek: 128K</span>");
  }
  if (ds === 'json') {
    return ("<span class='dspill note' title='Надёжный JSON даёт DeepSeek-V3 (deepseek-chat) с response_format: json_object; "
      + "слово «JSON» в промпте уже есть — это обязательное условие JSON-режима DeepSeek. "
      + "В R1 рассуждения могут примешиваться к ответу'>DeepSeek: V3</span>");
  }
  return '';
}

export function pillsHtml(p) {
  return qpillHtml(p.qw) + dspillHtml(p.ds);
}

// ---------------------------------------------------------------- фильтры-ограничения
export function ftags(p) {
  const t = [];
  const sec = p.section, cat = p.cat, sub = p.sub;
  // бесплатно: всё, кроме платного Midjourney
  if (p.model !== 'mj') t.push('free');
  // нужно фото/файл: переделка фото, Qwen-Image-Edit, мультимодальные задачи «личной жизни»
  if (sec === 'photo' || (sec === 'qwen' && sub.startsWith('Qwen-Image-Edit'))
    || (sec === 'life' && (p.ds === null || p.ds === undefined))) {
    t.push('photo');
  }
  // 5 минут: кроме заведомо длинных сценариев
  let quick = true;
  if (sec === 'photo' && (cat === 'shoot' || cat === 'creative')) quick = false;
  if (sec === 'texts' && sub === 'Статьи и блоги') quick = false;
  if (sec === 'life' && (cat === 'learn' || cat === 'travel' || cat === 'time')) quick = false;
  if (sec === 'work' && (cat === 'career' || cat === 'plan')) quick = false;
  if (sec === 'qwen' && sub.startsWith('Qwen-Coder')) quick = false;
  if (quick) t.push('quick');
  return t;
}

// ---------------------------------------------------------------- карточки
export function cardHtml(p) {
  const bodyId = 'body-' + p.id;
  const tip = p.tip ? "<div class='tip'>💡 " + p.tip + "</div>" : '';
  const tags = p.tags.map(t => "<span class='tag'>#" + esc(t) + "</span>").join('');
  return (
    "<article class='card' id='" + p.id + "' data-id='" + p.id + "'>"
    + "<div class='card-head' role='button' tabindex='0' aria-expanded='false' aria-controls='" + bodyId + "'>"
    + "<div class='head-main'>"
    + "<div class='card-top'><h3>" + esc(p.title) + "</h3><div class='badges'>"
    + "<span class='badge " + p.model + "'>" + esc(p.modelLabel) + "</span>" + pillsHtml(p)
    + "</div></div>"
    + "<p class='desc'>" + esc(p.desc) + "</p>"
    + "</div>"
    + "<span class='chev'>" + CHEV + "</span>"
    + "</div>"
    + "<div class='card-body' id='" + bodyId + "'>"
    + "<div class='prompt-wrap'><pre class='prompt'>" + highlight(p.prompt) + "</pre>"
    + "<button class='copy-btn' type='button'>" + COPY_IC + "Копировать</button></div>"
    + tip
    + "<div class='tags'>" + tags + "</div>"
    + "</div>"
    + "</article>"
  );
}

export function gridHtml(prompts, cats) {
  const out = [];
  let lastSub = null;
  for (const p of prompts) {
    if (p.sub !== lastSub) {
      lastSub = p.sub;
      out.push("<div class='section-head'><h2>" + cats[p.cat].icon + " " + esc(p.sub)
        + "</h2><div class='line' aria-hidden='true'></div></div>");
    }
    out.push(cardHtml(p));
  }
  return out.join('\n');
}

// ---------------------------------------------------------------- навигация
export function navHtml(current, footer, NAV) {
  const links = NAV.map(([f, label]) => {
    const cur = f === current ? ' aria-current="page"' : '';
    return '<a href="' + f + '"' + cur + '>' + label + '</a>';
  });
  const inner = links.join('');
  if (footer) return '<div class="sections-nav">' + inner + '</div>';
  return '<nav class="sections-nav" aria-label="Разделы сайта">' + inner + '</nav>';
}

// ---------------------------------------------------------------- статистика, табы, чипы
export function statCount(prompts, kind, key) {
  if (kind === 'total') return prompts.length;
  if (kind === 'cat') return prompts.filter(p => p.cat === key).length;
  return prompts.filter(p => p.sub === key).length;
}

export function statsHtml(prompts, sec) {
  const out = sec.stats.map(([kind, key, label]) =>
    '<div class="stat">' + esc(label) + ': <b>' + statCount(prompts, kind, key) + '</b></div>');
  return '<div class="stats">' + out.join('') + '</div>';
}

export function tabsHtml(prompts, sec) {
  if (!sec.tabs) return '<div class="tabs" id="tabs" hidden></div>';
  const out = ['<div class="tabs" id="tabs">'];
  for (const key of sec.cat_order) {
    const c = key === 'all' ? prompts.length : prompts.filter(p => p.cat === key).length;
    const cls = key === 'all' ? 'tab active' : 'tab';
    const pressed = key === 'all' ? 'true' : 'false';
    out.push('<button type="button" class="' + cls + '" aria-pressed="' + pressed + '">'
      + sec.cats[key].icon + ' ' + sec.cats[key].label
      + '<span class="cnt">' + c + '</span></button>');
  }
  out.push('</div>');
  return out.join('');
}

export function chipsHtml(prompts) {
  const subs = [];
  const seen = new Set();
  for (const p of prompts) {
    if (!seen.has(p.sub)) { seen.add(p.sub); subs.push(p.sub); }
  }
  const out = ['<button type="button" class="chip active" aria-pressed="true">Все подразделы</button>'];
  for (const s of subs) {
    out.push('<button type="button" class="chip" aria-pressed="false">' + esc(s) + '</button>');
  }
  return out.join('');
}

export function fchipsHtml(prompts, FTAG_META) {
  const out = [];
  for (const [key, label, title] of FTAG_META) {
    const n = prompts.filter(p => ftags(p).includes(key)).length;
    if (n > 0 && n < prompts.length) {
      out.push('<button type="button" class="fchip" data-ftag="' + key
        + '" aria-pressed="false" title="' + attr(title) + '">' + label
        + '<span class="fc-cnt">' + n + '</span></button>');
    }
  }
  return out.join('');
}

// ---------------------------------------------------------------- баннеры
export function banner(href, icon, text) {
  return ('<a class="page-link-banner" href="' + href + '"><span class="plb-ic" aria-hidden="true">' + icon
    + '</span><span>' + text + '</span><span class="plb-go">Открыть →</span></a>');
}
