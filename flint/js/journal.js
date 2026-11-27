/* Flint — журнал (этап 7): календарь → тренировка → упражнения → подходы;
 * справочник «Мои» + база 876 упражнений по группам мышц + программы.
 * Экраны (hash-роутер):
 *   #/day                  — календарь с точками тренировок + список за день
 *   #/start                — старт тренировки: программа → тренировка из
 *                             программы или пустая (виден, если есть программы)
 *   #/workout/<id>         — карточка тренировки (упражнения, сводки подходов)
 *   #/ex/<wid>/<eid>       — упражнение: таблица подходов + серый «прошлый раз»
 *   #/set/<wid>/<eid>/<sid?> — отдельный экран подхода (степперы, усилие,
 *                             комментарий; <sid> — редактирование)
 *   #/pick/<wid>           — выбор упражнения для тренировки (+ «Из базы»)
 *   #/library              — справочники: вкладки «Мои», «База» (группы мышц,
 *                             фильтры, «С тренировками») и «Программы»
 *   #/program/<pid>        — программа: список тренировок-шаблонов
 *   #/progw/<pid>/<tid>    — шаблон тренировки программы: упражнения, порядок
 *   #/picktpl/<pid>/<tid>  — выбор упражнения в шаблон (общий «пикер»)
 *   #/baseex/<id>          — карточка упражнения базы: техника, мышцы,
 *                             примечание; кнопка «Добавить в тренировку»
 * Имена упражнений внутри тренировки — снимок на момент добавления: пере-
 * именование в библиотеке не переписывает историю. История «прошлого раза» —
 * ближайшая предыдущая тренировка с тем же exerciseId (или тем же именем
 * для старых записей без привязки). База (FlintBaseDB) — слой только для
 * чтения, в синхронизацию не попадает; упражнения тренировки связываются с
 * ней полем baseId (или совпадением названия/алиаса). Программа хранит
 * шаблоны (name + ссылки на упражнения); при старте упражнения КОПИРУЮТСЯ
 * в живую тренировку (programId/templateId — для заметки в карточке). */
window.FlintJournal = (function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);

  /* Миниатюры упражнений (v1.7.4, минимальный вариант): flint/img/th/{id}.webp,
     манифест img/th/index.json читается один раз; аватар в списках и превью
     в карточке базы. Нет картинки в манифесте — буквенный аватар. */
  const FlintImg = { set: null, promise: null };
  function imgReady() {
    if (!FlintImg.promise) {
      FlintImg.promise = fetch('img/th/index.json')
        .then((r) => r.json())
        .then((a) => { FlintImg.set = new Set(a); })
        .catch(() => { FlintImg.set = new Set(); });
    }
    return FlintImg.promise;
  }
  /* <img> по id базы: dir — набор ('th' миниатюра, 'ex' сдвоенный кадр), или ''
     если картинки нет — вызывающий рисует букву */
  function imgTag(id, dir, alt) {
    return (FlintImg.set && FlintImg.set.has(id))
      ? `<img src="img/${dir || 'th'}/${encodeURIComponent(id)}.webp" alt="${alt || ''}" loading="lazy" decoding="async">`
      : '';
  }

  /* «Спросить Алису» (v1.7.6): диплинк на Яндекс-поиск с готовым вопросом —
     сверху выдачи показывается ответ нейросети, ниже статьи. В сборку ничего
     не добавляется: запрос собирается на лету из названия упражнения. */
  function aliAsk(name) {
    const n = (name || '').trim();
    if (!n) return '';
    const q = 'как правильно делать ' + n;
    return `<div class="card ask-box">
      <h4 class="bx-h">Изучить подробнее</h4>
      <a class="ext-link" href="https://yandex.ru/search/?text=${encodeURIComponent(q)}" target="_blank" rel="noopener">Спросить Алису</a>
      <p class="muted small-note">Откроется поиск Яндекса: сверху — ответ нейросети, ниже статьи и видео. Вопрос: как правильно делать ${esc(n)}?</p>
    </div>`;
  }

  const EFFORTS = [
    { v: 'warmup', label: 'Разм.', color: '#64748B' },
    { v: 'easy', label: 'Легко', color: '#EAB308' },
    { v: 'medium', label: 'Средне', color: '#F59E0B' },
    { v: 'hard', label: 'Тяжело', color: '#F97316' },
    { v: 'max', label: 'Предел', color: '#EF4444' },
  ];
  const WD_FULL = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
  const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль',
    'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

  let viewDate = null;   // выбранный день (ISO) для экрана «Дневники»
  let viewY = 0;         // показанный месяц календаря
  let viewM = 0;

  /* ---- этап 6: состояние вкладок справочника и базы упражнений ---- */

  let libTab = 'prog';      // активная вкладка справочника: 'prog' | 'my' | 'db'
  let myQuery = '';         // поиск по вкладке «Мои»
  let baseQuery = '';       // поиск по базе
  let baseEq = 'все';       // фильтр базы по оборудованию
  let baseDoneOnly = false; // фильтр «С тренировками» (есть история)
  let baseExBack = null;    // откуда открыли карточку базы («‹»)
  let openGroups = new Set();   // группы мышц, раскрытые вручную
  let closedGroups = new Set(); // группы, закрытые вручную при автраскрытии
  let setPrefill = null;        // значения из «прошлого раза» для нового подхода
  let cardTab = 'info';         // активная вкладка карточки упражнения: info | hist | prog
  let cardKey = '';             // какая карточка открыта — смена сбрасывает вкладку на «Инфо»

  const BASE_EQ = ['все', 'штанга', 'гантели', 'гири', 'блочный тренажёр', 'тренажёр',
    'без оборудования', 'эспандеры', 'медбол', 'фитбол', 'EZ-гриф', 'пенный ролик', 'другое'];
  /* Порядок групп мышц в «Базе»: анатомически сверху вниз; группа определяется
     по первой основной мышце упражнения (pm[0]), редкие значения уходят в конец
     списка по алфавиту. */
  const MUSCLE_ORDER = ['грудные', 'широчайшие', 'середина спины', 'трапеции', 'поясница',
    'плечи', 'бицепс', 'трицепс', 'предплечья', 'пресс', 'квадрицепсы', 'бицепс бедра',
    'ягодицы', 'приводящие мышцы', 'отводящие мышцы', 'икры', 'шея'];

  function normName(s) {
    return String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
  }

  /* Русское склонение числа: plural(3, ['тренировка','тренировки','тренировок']). */
  function plural(n, forms) {
    const m10 = n % 10;
    const m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return forms[0];
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return forms[1];
    return forms[2];
  }

  /* Индекс «нормализованное слово → [id базы]»: названия + русские алиасы.
     Строится один раз — база статична (кэшируется в модуле). */
  let baseWordIdx = null;
  function baseWordIndex() {
    if (baseWordIdx) return baseWordIdx;
    const idx = new Map();
    const link = (word, id) => {
      const w = normName(word);
      if (!w) return;
      if (!idx.has(w)) idx.set(w, []);
      if (idx.get(w).indexOf(id) < 0) idx.get(w).push(id);
    };
    for (const x of (window.FlintBaseDB ? window.FlintBaseDB.list : [])) {
      link(x.n, x.id);
      for (const a of x.al || []) link(a, x.id);
    }
    baseWordIdx = idx;
    return idx;
  }

  /* Поиск по базе: название, алиасы, мышцы. */
  function baseHits(query) {
    const list = window.FlintBaseDB ? window.FlintBaseDB.list : [];
    const q = normName(query);
    if (!q) return list;
    return list.filter((x) => normName(x.n).includes(q)
      || (x.al || []).some((a) => normName(a).includes(q))
      || (x.pm || []).some((m) => normName(m).includes(q))
      || (x.sm || []).some((m) => normName(m).includes(q)));
  }

  /* Запись базы для упражнения тренировки: baseId → запись справочника с
     baseId → совпадение названия/алиаса. */
  function findBaseFor(ex, libList) {
    const db = window.FlintBaseDB;
    if (!db || !db.list.length) return null;
    if (ex.baseId && db.byId.has(ex.baseId)) return db.byId.get(ex.baseId);
    if (ex.exerciseId && libList) {
      const l = libList.find((r) => r.id === ex.exerciseId);
      if (l && l.baseId && db.byId.has(l.baseId)) return db.byId.get(l.baseId);
    }
    const ids = baseWordIndex().get(normName(ex.name));
    return ids && ids.length ? db.byId.get(ids[0]) : null;
  }

  /* История по базе: baseId → число тренировок, где упражнение уже встречалось.
     «Сделал» = тренировка (не удалённая) содержит упражнение, связанное с
     записью базы напрямую (baseId), через справочник (baseId у записи lib) или
     по названию/алиасу («жим лёжа» ↔ «Жим штанги лёжа средним хватом»). */
  async function baseHistory() {
    const counts = new Map();
    const idx = baseWordIndex();
    const db = window.FlintBaseDB;
    if (!db || !db.list.length) return counts;
    const lib = await window.FlintDB.getAllExercises();
    const libToBase = new Map();
    for (const l of lib) {
      if (l.baseId && db.byId.has(l.baseId)) libToBase.set(l.id, l.baseId);
    }
    const workouts = await window.FlintDB.getActive();
    for (const w of workouts) {
      const hit = new Set();
      for (const e of w.exercises || []) {
        const viaLib = e.exerciseId ? libToBase.get(e.exerciseId) : null;
        if (viaLib) { hit.add(viaLib); continue; }
        const ids = idx.get(normName(e.name));
        if (ids) for (const id of ids) hit.add(id);
      }
      for (const id of hit) counts.set(id, (counts.get(id) || 0) + 1);
    }
    return counts;
  }

  /* Возврат фокуса в поле поиска после перерисовки экрана. */
  function refocus(sel) {
    const el = $(sel);
    if (!el) return;
    el.focus();
    try {
      const v = el.value || '';
      el.setSelectionRange(v.length, v.length);
    } catch (e) { /* type=search в части браузеров без setSelectionRange */ }
  }

  function uuid() {
    return (window.crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fmtW(v) {
    const n = +v || 0;
    return Number.isInteger(n) ? String(n) : String(n).replace('.', ',');
  }

  function fmtISO(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    if (!y || !m || !d) return iso;
    return `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}`;
  }

  function weekdayOf(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return WD_FULL[new Date(y, m - 1, d).getDay()];
  }

  function effortOf(v) {
    return EFFORTS.find((e) => e.v === v) || null;
  }

  /* ---- агрегаты ---- */

  function exVolume(e) {
    return e.sets.reduce((s, x) => s + (+x.weight || 0) * (+x.reps || 0), 0);
  }

  function workoutVolume(w) {
    return w.exercises.reduce((s, e) => s + exVolume(e), 0);
  }

  function workoutSets(w) {
    return w.exercises.reduce((s, e) => s + e.sets.length, 0);
  }

  function fmtVol(v) {
    if (!v) return '';
    return v >= 10000 ? (v / 1000).toFixed(1) + ' т' : Math.round(v) + ' кг';
  }

  function exSummary(e) {
    return e.sets.length
      ? e.sets.map((s) => `${fmtW(s.weight)}×${s.reps}`).join(', ')
      : '';
  }

  /* Ближайшая предыдущая тренировка с тем же упражнением. */
  async function prevWorkout(cur) {
    const all = (await window.FlintDB.getActive())
      .filter((w) => w.id !== cur.id && !w.deleted && w.exercises.length
        && (w.date < cur.date
          || (w.date === cur.date && (w.createdAt || 0) < (cur.createdAt || 0))))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.createdAt || 0) - (a.createdAt || 0)));
    for (const w of all) {
      const match = cur.__ex.exerciseId
        ? w.exercises.find((e) => e.exerciseId === cur.__ex.exerciseId)
        : w.exercises.find((e) => e.name === cur.__ex.name);
      if (match && match.sets.length) return { id: w.id, date: w.date, ex: match };
    }
    return null;
  }

  /* История выполнения упражнения базы (этап 7.1): ближайшие тренировки, где
     оно встречалось — по прямой ссылке baseId, через запись «Моих» с baseId
     или по названию/алиасу. Идёт от свежих к старым; sets — как сохранились. */
  async function baseHistoryEntries(baseId) {
    const db = window.FlintBaseDB;
    if (!db || !db.byId.has(baseId)) return [];
    const lib = await window.FlintDB.getAllExercises();
    const libToBase = new Map();
    for (const l of lib) {
      if (l.baseId && db.byId.has(l.baseId)) libToBase.set(l.id, l.baseId);
    }
    const out = [];
    const workouts = (await window.FlintDB.getActive()).sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
    for (const w of workouts) {
      for (const e of w.exercises) {
        let hit = e.baseId === baseId;
        if (!hit && e.exerciseId) hit = libToBase.get(e.exerciseId) === baseId;
        if (!hit) {
          const ids = baseWordIndex().get(normName(e.name));
          if (ids && ids.indexOf(baseId) >= 0) hit = true;
        }
        if (hit && e.sets.length) {
          out.push({ wid: w.id, date: w.date, sets: e.sets.slice() });
          break;
        }
      }
    }
    return out;
  }

  /* История «своего» упражнения (этап 7.2): совпадение по exerciseId,
     для старых записей без ссылки — по названию. От свежих к старым. */
  async function myHistoryEntries(rec) {
    const nm = normName(rec.name);
    const workouts = (await window.FlintDB.getActive()).sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
    const out = [];
    for (const w of workouts) {
      for (const e of w.exercises) {
        const hit = e.exerciseId ? e.exerciseId === rec.id : normName(e.name) === nm;
        if (hit && e.sets.length) {
          out.push({ wid: w.id, date: w.date, sets: e.sets.slice() });
          break;
        }
      }
    }
    return out;
  }

  /* ---- общие блоки карточки упражнения: вкладки, история, график ---- */

  function cardTabsHTML(active, histCount) {
    const tb = (k, label) =>
      `<button type="button" class="ctab${active === k ? ' on' : ''}" data-ctab="${k}">${label}</button>`;
    return `<div class="card-tabs" role="tablist">
      ${tb('info', 'Инфо')}
      ${tb('hist', 'История' + (histCount ? ' · ' + histCount : ''))}
      ${tb('prog', 'Прогресс')}
    </div>`;
  }

  function histBlockHTML(entries, maxRows) {
    const cap = maxRows || 8;
    if (!entries.length) return '<p class="muted empty">Ещё не выполнялось.</p>';
    const rows = entries.slice(0, cap).map((h) => `
      <button type="button" class="hist-row" data-hw="${h.wid}">
        <span class="hist-date">${fmtISO(h.date)}</span>
        <span class="hist-sets muted">${h.sets.map((s) => `${fmtW(s.weight)}×${s.reps}`).slice(0, 5).join(', ')}${h.sets.length > 5 ? ' …' : ''}</span>
      </button>`).join('');
    const more = entries.length > cap
      ? `<p class="muted small-note">…и ещё ${entries.length - cap} ${plural(entries.length - cap, ['тренировка', 'тренировки', 'тренировок'])} — все точки на вкладке «Прогресс»</p>`
      : '';
    return `<div class="hist-list">${rows}</div>${more}`;
  }

  function bindHistRows(root, entries) {
    root.querySelectorAll('[data-hw]').forEach((b) => {
      b.addEventListener('click', () => {
        const h = entries.find((x) => x.wid === b.dataset.hw);
        if (h) location.hash = '#/workout/' + h.wid;
      });
    });
  }

  /* Прогресс: максимум веса за тренировку по датам. Без библиотек —
     обычный SVG: линия + точки с всплывающей подсказкой (этап 7.2). */
  function progressSVG(pts) {
    const W = 320;
    const H = 176;
    const P = { t: 16, r: 14, b: 26, l: 40 };
    const X = (i) => P.l + (W - P.l - P.r) * (pts.length === 1 ? 0.5 : i / (pts.length - 1));
    const ws = pts.map((p) => p.w);
    const hi = Math.ceil(Math.max(...ws) + 1);
    const lo = Math.max(0, Math.floor(Math.min(...ws) - 1));
    const Y = (v) => P.t + (H - P.t - P.b) * (1 - (v - lo) / ((hi - lo) || 1));
    const grid = [0, 1, 2, 3].map((k) => {
      const v = lo + ((hi - lo) * k) / 3;
      const y = Y(v);
      return `<line x1="${P.l}" x2="${W - P.r}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" class="pg-grid"/>`
        + `<text x="${P.l - 6}" y="${(y + 3).toFixed(1)}" class="pg-lab" text-anchor="end">${Math.round(v)}</text>`;
    }).join('');
    const step = Math.max(1, Math.ceil(pts.length / 6));
    const xl = pts.map((p, i) => (i % step === 0 || i === pts.length - 1)
      ? `<text x="${X(i).toFixed(1)}" y="${H - 8}" class="pg-lab" text-anchor="middle">${p.d.slice(8, 10)}.${p.d.slice(5, 7)}</text>`
      : '').join('');
    const poly = pts.map((p, i) => `${X(i).toFixed(1)},${Y(p.w).toFixed(1)}`).join(' ');
    const dots = pts.map((p, i) =>
      `<circle cx="${X(i).toFixed(1)}" cy="${Y(p.w).toFixed(1)}" r="3.2" class="pg-dot"><title>${fmtISO(p.d)}: ${fmtW(p.w)} кг</title></circle>`).join('');
    return `<svg class="prog-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="График весов по датам">
      ${grid}${xl}<polyline class="pg-line" points="${poly}"/>${dots}
    </svg>`;
  }

  function progressBlockHTML(entries) {
    if (!entries.length) return '<p class="muted empty">Данных пока нет — выполните упражнение, и график появится.</p>';
    const pts = entries.slice().reverse().map((h) => ({
      d: h.date,
      w: Math.max(...h.sets.map((s) => +s.weight || 0)),
    }));
    const maxW = Math.max(...pts.map((p) => p.w));
    const best = pts.find((p) => p.w === maxW);
    const totalSets = entries.reduce((n, h) => n + h.sets.length, 0);
    return `<p class="muted small-note">Тренировок: ${entries.length} • подходов: ${totalSets} • максимум: ${fmtW(maxW)} кг (${fmtISO(best.d)})</p>${progressSVG(pts)}`;
  }

  /* ---- каркас экрана ---- */

  function showScreen(name) {
    document.querySelectorAll('.screen').forEach((s) => {
      s.classList.toggle('active', s.dataset.screen === name);
    });
    document.querySelectorAll('.tabbar .tab').forEach((t) => {
      const flowDay = ['workout', 'ex', 'set', 'pick', 'picktpl', 'start', 'addto'].includes(name) && t.dataset.tab === 'day';
      const flowLib = ['program', 'progw'].includes(name) && t.dataset.tab === 'library';
      t.classList.toggle('on', t.dataset.tab === name || flowDay || flowLib);
    });
    window.scrollTo(0, 0);
  }

  function topbar(html) {
    return `<div class="scr-top">${html}</div>`;
  }

  /* ==================== экран «Дневники»: календарь ==================== */

  async function renderDay() {
    showScreen('day');
    const all = await window.FlintDB.getActive();
    const byDate = new Map();
    for (const w of all) {
      if (!byDate.has(w.date)) byDate.set(w.date, []);
      byDate.get(w.date).push(w);
    }
    const first = new Date(viewY, viewM, 1);
    const lead = (first.getDay() + 6) % 7; // пн = 0
    const days = new Date(viewY, viewM + 1, 0).getDate();
    const tISO = todayISO();

    let cal = '<div class="cal-week">';
    for (const d of ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']) cal += `<span class="cal-wd">${d}</span>`;
    cal += '</div>';
    let cell = 0;
    let rows = '';
    let row = '';
    for (let i = 0; i < lead; i++, cell++) row += '<span class="cal-day empty"></span>';
    for (let d = 1; d <= days; d++, cell++) {
      const iso = `${viewY}-${String(viewM + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const cls = ['cal-day'];
      if (iso === tISO) cls.push('today');
      if (iso === viewDate) cls.push('sel');
      const dot = byDate.has(iso) ? '<span class="cal-dot"></span>' : '';
      row += `<button type="button" class="${cls.join(' ')}" data-date="${iso}">${d}${dot}</button>`;
      if (cell % 7 === 6) { rows += `<div class="cal-week">${row}</div>`; row = ''; }
    }
    if (row) rows += `<div class="cal-week">${row}</div>`;

    const dayWorkouts = (byDate.get(viewDate) || []).slice()
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const list = dayWorkouts.length
      ? dayWorkouts.map((w) => `
        <button type="button" class="day-item" data-w="${w.id}">
          <span class="di-check">✓</span>
          <span class="di-body">
            <span class="di-head">${fmtISO(w.date)} <span class="muted">${weekdayOf(w.date)}</span>
              <span class="di-time">${new Date(w.createdAt || 0).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span></span>
            <span class="di-title">${esc(w.title) || '<span class="muted">Без названия</span>'}</span>
          </span>
        </button>`).join('')
      : '<p class="muted empty">В этот день тренировок нет.</p>';

    $('#screen-day').innerHTML = `
      ${topbar('<button type="button" class="scr-btn" data-nav="prev">‹</button>'
        + `<h2 class="scr-title">${MONTHS[viewM]} ${viewY}</h2>`
        + '<button type="button" class="scr-btn" data-nav="next">›</button>')}
      <div class="calendar">${cal}${rows}</div>
      <div class="day-list">${list}</div>
      <div class="fab-wrap"><button type="button" class="fab" id="new-workout">+ Тренировка</button></div>`;
    $('#screen-day').querySelectorAll('.cal-day[data-date]').forEach((b) => {
      b.addEventListener('click', () => {
        viewDate = b.dataset.date;
        renderDay();
      });
    });
    const prev = $('#screen-day').querySelector('[data-nav="prev"]');
    const next = $('#screen-day').querySelector('[data-nav="next"]');
    prev.addEventListener('click', () => { viewM--; if (viewM < 0) { viewM = 11; viewY--; } renderDay(); });
    next.addEventListener('click', () => { viewM++; if (viewM > 11) { viewM = 0; viewY++; } renderDay(); });
    $('#screen-day').querySelectorAll('.day-item').forEach((b) => {
      b.addEventListener('click', () => { location.hash = '#/workout/' + b.dataset.w; });
    });
    $('#new-workout').addEventListener('click', async () => {
      const progs = await window.FlintDB.getActivePrograms();
      if (progs.length) { location.hash = '#/start'; return; } // выбор из программы
      newWorkout();
    });
  }

  async function newWorkout() {
    const now = Date.now();
    const w = {
      id: uuid(), date: viewDate || todayISO(), title: '',
      exercises: [], createdAt: now, updatedAt: now, v: 3,
    };
    await window.FlintDB.put(w);
    window.FlintSync.markDirty();
    location.hash = '#/workout/' + w.id;
  }

  /* ==================== карточка тренировки ==================== */

  async function renderWorkout(wid) {
    const w = await window.FlintDB.get(wid);
    if (!w || w.deleted) { location.hash = '#/day'; return; }
    showScreen('workout');
    const norm = await window.FlintDB.migrateWorkout(w);
    await imgReady();
    const vol = fmtVol(workoutVolume(norm));
    const sets = workoutSets(norm);

    const exItems = norm.exercises.map((e) => `
      <div class="ex-item" data-eid="${e.id}">
        <span class="avatar">${imgTag(e.baseId) || esc((e.name || '?').trim().charAt(0).toUpperCase() || '?')}</span>
        <span class="exi-body">
          <span class="exi-name">${esc(e.name) || '<span class="muted">Без названия</span>'}</span>
          <span class="exi-sets muted">${esc(exSummary(e)) || '—'}</span>
        </span>
        <span class="exi-vol muted">${exVolume(e) ? fmtVol(exVolume(e)) + ' • ' + e.sets.length : ''}</span>
        <button type="button" class="mini-btn danger" data-delex="${e.id}" title="Убрать упражнение">✕</button>
      </div>`).join('');

    /* Заметка о происхождении: тренировка начата из программы (этап 7) */
    let originNote = '';
    if (w.programId) {
      const pg = (await window.FlintDB.getAllPrograms()).find((x) => x.id === w.programId);
      if (pg && !pg.deleted) {
        const tpl = (pg.workouts || []).find((t) => t.id === w.templateId);
        originNote = `<span>Из программы: ${esc(pg.name)}${tpl ? ' → ' + esc(tpl.name) : ''}</span>`;
      }
    }

    $('#screen-workout').innerHTML = `
      ${topbar('<button type="button" class="scr-btn" data-back="1">‹</button>'
        + '<h2 class="scr-title">Тренировка</h2>'
        + `<button type="button" class="scr-btn danger" data-delw="1" title="Удалить тренировку">🗑</button>`)}
      <div class="card wo-meta">
        <input id="wo-title" type="text" placeholder="Название тренировки" maxlength="80" value="${esc(w.title)}">
        <div class="wo-stats muted">
          <span>Дата: ${fmtISO(norm.date)} (${weekdayOf(norm.date)})</span>
          ${originNote}${vol ? `<span>Объём: ${vol}</span>` : ''}${sets ? `<span>Подходов: ${sets}</span>` : ''}
        </div>
      </div>
      <div class="ex-list">${exItems || '<p class="muted empty">Упражнений пока нет — добавьте из библиотеки.</p>'}</div>
      <div class="fab-wrap"><button type="button" class="fab" id="add-ex">+ Упражнение</button></div>`;

    $('#screen-workout').querySelector('[data-back]').addEventListener('click', () => { location.hash = '#/day'; });
    $('#screen-workout').querySelector('[data-delw]').addEventListener('click', async () => {
      if (!confirm('Удалить тренировку? Она исчезнет на всех устройствах после синхронизации.')) return;
      await window.FlintDB.remove(wid);
      window.FlintSync.markDirty();
      location.hash = '#/day';
    });
    const titleEl = $('#wo-title');
    titleEl.addEventListener('change', async () => {
      const nw = await window.FlintDB.get(wid);
      nw.title = titleEl.value.trim();
      nw.updatedAt = Date.now();
      await window.FlintDB.put(nw);
      window.FlintSync.markDirty();
    });
    $('#screen-workout').querySelectorAll('.ex-item').forEach((el) => {
      el.addEventListener('click', (ev) => {
        if (ev.target.closest('[data-delex]')) return;
        location.hash = `#/ex/${wid}/${el.dataset.eid}`;
      });
    });
    $('#screen-workout').querySelectorAll('[data-delex]').forEach((b) => {
      b.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        const eid = b.dataset.delex;
        const nw = await window.FlintDB.get(wid);
        if (!confirm('Убрать упражнение из тренировки?')) return;
        nw.exercises = nw.exercises.filter((e) => e.id !== eid);
        nw.updatedAt = Date.now();
        await window.FlintDB.put(nw);
        window.FlintSync.markDirty();
        renderWorkout(wid);
      });
    });
    $('#add-ex').addEventListener('click', () => { location.hash = '#/pick/' + wid; });
  }

  /* ==================== выбор упражнения (в тренировку | в шаблон) ==================== */

  async function renderPick(wid, filter) {
    const w = await window.FlintDB.get(wid);
    if (!w || w.deleted) { location.hash = '#/day'; return; }
    return renderPicker({ kind: 'workout', wid }, filter);
  }

  async function renderPickTpl(pid, tid, filter) {
    const p = await window.FlintDB.getProgram(pid);
    if (!p || p.deleted || !p.workouts.some((t) => t.id === tid)) { location.hash = '#/library'; return; }
    return renderPicker({ kind: 'template', pid, tid }, filter);
  }

  /* ==================== «Добавить в тренировку» из карточек (v1.7.8) ==================== */

  /* Куда положить упражнение из карточки базы/«Моих»: если тренировка на эту
     дату одна — сразу в неё (не создавая новую); несколько — экран выбора
     (в т.ч. начатые из программы); ни одной — создаётся новая, как раньше. */
  async function addToWorkoutFlow(name, baseId, exerciseId) {
    const date = viewDate || todayISO();
    const all = await window.FlintDB.getActive();
    const todays = all.filter((w) => w.date === date)
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    const entry = { id: uuid(), exerciseId: exerciseId || null, baseId: baseId || null, name: name || '', sets: [] };
    baseExBack = '#/day';
    if (todays.length === 1) {
      await putEntryInto(todays[0].id, entry);
      return;
    }
    if (todays.length > 1) { renderAddTo(date, todays, entry); return; }
    const now = Date.now();
    const w = {
      id: uuid(), date, title: '', v: 3,
      exercises: [entry], createdAt: now, updatedAt: now,
    };
    await window.FlintDB.put(w);
    window.FlintSync.markDirty();
    if (window.FlintUI && window.FlintUI.toast) window.FlintUI.toast('Тренировка создана на сегодня');
    location.hash = `#/ex/${w.id}/${entry.id}`;
  }

  /* Добавить запись упражнения в тренировку и открыть экран подходов. */
  async function putEntryInto(wid, entry) {
    const w = await window.FlintDB.get(wid);
    if (!w || w.deleted) { location.hash = '#/day'; return; }
    w.exercises.push(entry);
    w.updatedAt = Date.now();
    await window.FlintDB.put(w);
    window.FlintSync.markDirty();
    if (window.FlintUI && window.FlintUI.toast) {
      window.FlintUI.toast(w.title ? `Добавлено в «${w.title}»` : 'Добавлено в тренировку');
    }
    location.hash = `#/ex/${w.id}/${entry.id}`;
  }

  /* Выбор тренировки, когда на дату их несколько. */
  function renderAddTo(date, list, entry) {
    showScreen('addto');
    const items = list.map((w) => `
      <button type="button" class="lib-item" data-addw="${w.id}">
        <span class="avatar">${esc((w.title || 'Т').charAt(0).toUpperCase())}</span>
        <span class="lib-body">
          <span class="lib-name">${esc(w.title || 'Тренировка')}</span>
          <span class="lib-sub">${w.exercises.length
            ? w.exercises.length + ' ' + plural(w.exercises.length, ['упражнение', 'упражнения', 'упражнений'])
            : 'пустая'}${w.programId ? ' · из программы' : ''}</span>
        </span>
        <span class="chev">›</span>
      </button>`).join('');
    $('#screen-addto').innerHTML = `
      ${topbar('<button type="button" class="scr-btn" data-back="1">‹</button>'
        + `<h2 class="scr-title">Куда добавить — ${fmtISO(date)}</h2>`)}
      <div class="lib-list">${items}</div>
      <div class="card"><button type="button" class="btn primary wide" id="addto-new">Новая тренировка</button></div>`;
    $('#screen-addto').querySelector('[data-back]').addEventListener('click', () => {
      location.hash = baseExBack || '#/library';
    });
    $('#screen-addto').querySelectorAll('[data-addw]').forEach((b) => {
      b.addEventListener('click', () => putEntryInto(b.dataset.addw, entry));
    });
    $('#addto-new').addEventListener('click', async () => {
      const now = Date.now();
      const w = {
        id: uuid(), date, title: '', v: 3,
        exercises: [entry], createdAt: now, updatedAt: now,
      };
      await window.FlintDB.put(w);
      window.FlintSync.markDirty();
      if (window.FlintUI && window.FlintUI.toast) window.FlintUI.toast('Тренировка создана на сегодня');
      location.hash = `#/ex/${w.id}/${entry.id}`;
    });
  }

  /* Общий «пикер»: ищет в «Моих», подсказывает из базы, умеет создать новое.
     Кладёт выбранное в живую тренировку (и открывает экран подходов) или в
     шаблон программы (возвращает к списку шаблона). */
  async function renderPicker(ctx, filter) {
    showScreen('pick');
    const lib = await window.FlintDB.getActiveExercises();
    await imgReady();
    const q = (filter || '').trim().toLowerCase();
    const hits = q ? lib.filter((e) => e.name.toLowerCase().includes(q)) : lib;
    const exact = q && lib.some((e) => e.name.toLowerCase() === q);

    const items = hits.map((e) => `
      <button type="button" class="lib-item" data-pick="${e.id}" data-name="${esc(e.name)}" data-baseid="${esc(e.baseId || '')}">
        <span class="avatar">${imgTag(e.baseId) || esc(e.name.trim().charAt(0).toUpperCase())}</span>
        <span class="lib-name">${esc(e.name)}</span>
      </button>`).join('');
    const createRow = q && !exact
      ? `<button type="button" class="lib-item create" data-create="1">
           <span class="avatar plus">+</span>
           <span class="lib-name">Создать «${esc(filter.trim())}»</span>
         </button>`
      : '';
    /* подсказки из базы (этап 6): совпадение по названию и алиасам; то, что
       уже есть в «Моих» под тем же именем, не дублируем */
    let baseBlock = '';
    if (q.length >= 2 && window.FlintBaseDB && window.FlintBaseDB.count) {
      const ownNames = new Set(lib.map((e) => normName(e.name)));
      const all = baseHits(q).filter((x) => !ownNames.has(normName(x.n)));
      const bh = all.slice(0, 50); // как в справочнике: не 6 подсказок, а весь поиск
      if (bh.length) {
        baseBlock = `<p class="muted small-note base-note">Из базы (${window.FlintBaseDB.count}):</p>`
          + bh.map((x) => `
            <button type="button" class="lib-item two" data-basepick="${esc(x.id)}" data-basename="${esc(x.n)}">
              <span class="avatar">${imgTag(x.id) || esc((x.n || '?').charAt(0).toUpperCase())}</span>
              <span class="lib-body">
                <span class="lib-name">${esc(x.n)}</span>
                <span class="lib-sub">${esc((x.pm || []).join(', '))}${x.eq ? ' · ' + esc(x.eq) : ''}</span>
              </span>
            </button>`).join('')
          + (all.length > bh.length
            ? `<p class="muted small-note">Показаны ${bh.length} из ${all.length} — уточните поиск.</p>`
            : '');
      }
    }

    const backHash = ctx.kind === 'workout'
      ? '#/workout/' + ctx.wid
      : '#/progw/' + ctx.pid + '/' + ctx.tid;

    $('#screen-pick').innerHTML = `
      ${topbar('<button type="button" class="scr-btn" data-back="1">‹</button>'
        + '<h2 class="scr-title">Выбрать упражнение</h2>')}
      <div class="card">
        <input id="pick-search" type="search" placeholder="Поиск или новое название…" value="${esc(filter || '')}" autocomplete="off">
      </div>
      <div class="lib-list">${createRow}${items}${baseBlock || (q || items ? '' : '<p class="muted empty">Библиотека пуста — введите название, чтобы создать упражнение.</p>')}</div>`;

    $('#screen-pick').querySelector('[data-back]').addEventListener('click', () => { location.hash = backHash; });
    const search = $('#pick-search');
    search.addEventListener('input', () => renderPicker(ctx, search.value));
    /* Добавить ссылку на упражнение: в тренировку (снимок + экран подходов)
       или в шаблон программы (возврат к редактору шаблона). */
    const addRef = async (libId, baseId, name) => {
      if (ctx.kind === 'workout') {
        const nw = await window.FlintDB.get(ctx.wid);
        const entry = { id: uuid(), exerciseId: libId || null, baseId: baseId || null, name: name || '', sets: [] };
        nw.exercises.push(entry);
        nw.updatedAt = Date.now();
        await window.FlintDB.put(nw);
        window.FlintSync.markDirty();
        location.hash = `#/ex/${ctx.wid}/${entry.id}`;
      } else {
        const p = await window.FlintDB.getProgram(ctx.pid);
        const t = p.workouts.find((x) => x.id === ctx.tid);
        t.exercises.push({ exerciseId: libId || null, baseId: baseId || null, name: name || '' });
        p.updatedAt = Date.now();
        await window.FlintDB.putProgram(p);
        window.FlintSync.markDirty();
        location.hash = backHash;
        renderProgWorkout(ctx.pid, ctx.tid);
      }
    };
    $('#screen-pick').querySelectorAll('[data-pick]').forEach((b) => {
      b.addEventListener('click', () => addRef(b.dataset.pick, b.dataset.baseid, b.dataset.name));
    });
    const cr = $('#screen-pick').querySelector('[data-create]');
    if (cr) {
      cr.addEventListener('click', async () => {
        const name = filter.trim();
        const now = Date.now();
        const libRec = { id: uuid(), name, createdAt: now, updatedAt: now };
        await window.FlintDB.putExercise(libRec);
        window.FlintSync.markDirty();
        await addRef(libRec.id, null, name);
      });
    }
    $('#screen-pick').querySelectorAll('[data-basepick]').forEach((b) => {
      b.addEventListener('click', async () => {
        const bx = window.FlintBaseDB.byId.get(b.dataset.basepick);
        const name = b.dataset.basename;
        const now = Date.now();
        const libRec = { id: uuid(), name, baseId: bx ? bx.id : null, createdAt: now, updatedAt: now };
        await window.FlintDB.putExercise(libRec);
        window.FlintSync.markDirty();
        await addRef(libRec.id, bx ? bx.id : null, name);
      });
    });
    search.focus();
  }

  /* ==================== упражнение: подходы + прошлый раз ==================== */

  async function renderExercise(wid, eid) {
    const w = await window.FlintDB.get(wid);
    if (!w || w.deleted) { location.hash = '#/day'; return; }
    const norm = await window.FlintDB.migrateWorkout(w);
    const ex = norm.exercises.find((e) => e.id === eid);
    if (!ex) { location.hash = '#/workout/' + wid; return; }
    norm.__ex = ex;
    showScreen('ex');

    const prev = await prevWorkout(norm);

    /* (i) — карточка упражнения: база, а без связи — «своя» карточка (этап 7.2) */
    const libAll = await window.FlintDB.getAllExercises();
    const baseX = findBaseFor(ex, libAll);
    const infoBtn = (baseX || ex.exerciseId)
      ? `<button type="button" class="ex-info" id="ex-tech" title="Карточка упражнения">i</button>` : '';

    /* Схема прошлого раза серым под названием: «4×8» */
    let scheme = '';
    if (prev && prev.ex.sets.length) {
      const last = prev.ex.sets[prev.ex.sets.length - 1];
      scheme = `<p class="ex-scheme muted">${prev.ex.sets.length}×${last.reps}</p>`;
    }

    /* Единая таблица подходов (этап 7.3, как в референсе): яркие строки —
       этот раз (тап — правка, ✕ — удаление), ниже серым — прошлый раз;
       тап по серой подставляет её значения, и после ввода подход занимает
       эту же строку, но уже ярким (заполнение по порядку). */
    const prevSets = prev && prev.ex.sets.length ? prev.ex.sets : null;
    let rows = ex.sets.map((s, i) => {
      const ef = effortOf(s.effort);
      return `<div class="set-row" data-sid="${s.id}">
        <span class="set-bar" style="background:${ef ? ef.color : 'var(--line)'}"></span>
        <span class="set-n">${i + 1}</span>
        <span class="set-w">${fmtW(s.weight)}</span>
        <span class="set-r">${s.reps}</span>
        <button type="button" class="mini-btn danger" data-delset="${s.id}" title="Удалить подход">✕</button>
      </div>`;
    }).join('');
    for (let j = ex.sets.length; prevSets && j < prevSets.length; j++) {
      const p = prevSets[j];
      const ef = effortOf(p.effort);
      rows += `<button type="button" class="set-row prev" data-prevset="${j}" title="Клик — записать этот подход">
        <span class="set-bar" style="background:${ef ? ef.color : 'var(--line)'}"></span>
        <span class="set-n">${j + 1}</span>
        <span class="set-w">${fmtW(p.weight)}</span>
        <span class="set-r">${p.reps}</span>
      </button>`;
    }
    const totalRows = ex.sets.length + (prevSets ? Math.max(0, prevSets.length - ex.sets.length) : 0);
    const tableBlock = `
      ${totalRows ? `<div class="sets-head"><span></span><span>№</span><span>Вес, кг</span><span>Повторы</span><span></span></div>
      <div class="sets-list">${rows}</div>` : ''}
      ${prev ? `<button type="button" class="prev-note" id="prev-open">
          <span class="muted">*Прошлое занятие было ${fmtISO(prev.date)}</span><span class="chev">›</span>
        </button>` : ''}`;

    $('#screen-ex').innerHTML = `
      ${topbar('<button type="button" class="scr-btn" data-back="1">‹</button>'
        + `<h2 class="scr-title">${fmtISO(norm.date)}</h2>`)}
      <div class="card ex-head">
        <div class="ex-title-row">
          <h3 class="ex-title">${esc(ex.name) || 'Без названия'}</h3>
          ${infoBtn}
        </div>
        ${scheme}
        <p class="muted">${ex.sets.length ? fmtVol(exVolume(ex)) + ' • подходов: ' + ex.sets.length : (prevSets ? 'Кликните по серой строке прошлого раза или добавьте подход' : 'Подходов пока нет — добавьте первый')}</p>
      </div>
      ${tableBlock}
      <div class="fab-wrap"><button type="button" class="fab" id="add-set">+ Добавить подход</button></div>`;

    $('#screen-ex').querySelector('[data-back]').addEventListener('click', () => { location.hash = '#/workout/' + wid; });
    const tech = $('#ex-tech');
    if (tech) {
      tech.addEventListener('click', () => {
        baseExBack = '#/ex/' + wid + '/' + eid;
        location.hash = baseX ? '#/baseex/' + baseX.id : '#/myex/' + ex.exerciseId;
      });
    }
    const po = $('#prev-open');
    if (po) po.addEventListener('click', () => { location.hash = '#/workout/' + prev.id; });
    $('#screen-ex').querySelectorAll('[data-prevset]').forEach((b) => {
      b.addEventListener('click', () => {
        const i = +b.dataset.prevset;
        const s = prevSets[i];
        setPrefill = { weight: s.weight, reps: s.reps, effort: s.effort || '', comment: s.comment || '', from: prev.date, insertIndex: i };
        location.hash = `#/set/${wid}/${eid}`;
      });
    });
    $('#screen-ex').querySelectorAll('.set-row[data-sid]').forEach((el) => {
      el.addEventListener('click', (ev) => {
        if (ev.target.closest('[data-delset]')) return;
        location.hash = `#/set/${wid}/${eid}/${el.dataset.sid}`;
      });
    });
    $('#screen-ex').querySelectorAll('[data-delset]').forEach((b) => {
      b.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        if (!confirm('Удалить этот подход?')) return;
        const nw = await window.FlintDB.get(wid);
        const ne = nw.exercises.find((e) => e.id === eid);
        ne.sets = ne.sets.filter((s) => s.id !== b.dataset.delset);
        nw.updatedAt = Date.now();
        await window.FlintDB.put(nw);
        window.FlintSync.markDirty();
        renderExercise(wid, eid);
      });
    });
    $('#add-set').addEventListener('click', () => { location.hash = `#/set/${wid}/${eid}`; });
  }

  /* ==================== отдельный экран подхода ==================== */

  async function renderSet(wid, eid, sid) {
    const w = await window.FlintDB.get(wid);
    if (!w || w.deleted) { location.hash = '#/day'; return; }
    const norm = await window.FlintDB.migrateWorkout(w);
    const ex = norm.exercises.find((e) => e.id === eid);
    if (!ex) { location.hash = '#/workout/' + wid; return; }
    norm.__ex = ex;
    showScreen('set');
    const editing = sid ? ex.sets.find((s) => s.id === sid) : null;
    /* Предзаполнение из «прошлого раза» (этап 7.1): клик по строке прошлой
       тренировки кладёт значения в setPrefill; читаем один раз. */
    const prefill = !editing && setPrefill ? setPrefill : null;
    setPrefill = null;

    /* предзаполнение: правимый подход → значения из прошлого раза →
       последний подход этого упражнения → прошлый раз → нейтральные 20×10 */
    let dWeight = 20;
    let dReps = 10;
    if (editing) {
      dWeight = +editing.weight || 0;
      dReps = +editing.reps || 0;
    } else if (prefill) {
      dWeight = +prefill.weight || 0;
      dReps = +prefill.reps || 0;
    } else if (ex.sets.length) {
      const last = ex.sets[ex.sets.length - 1];
      dWeight = +last.weight || 0;
      dReps = +last.reps || 0;
    } else {
      const prev = await prevWorkout(norm);
      if (prev && prev.ex.sets.length) {
        const p = prev.ex.sets[0];
        dWeight = +p.weight || 0;
        dReps = +p.reps || 0;
      }
    }
    const dEffort = editing ? (editing.effort || '') : (prefill ? (prefill.effort || '') : '');
    const dComment = editing ? (editing.comment || '') : (prefill ? (prefill.comment || '') : '');

    const efforts = EFFORTS.map((e) => `
      <button type="button" class="eff-btn${dEffort === e.v ? ' on' : ''}"
        data-eff="${e.v}" style="--eff:${e.color}">${e.label}</button>`).join('');

    $('#screen-set').innerHTML = `
      ${topbar('<button type="button" class="scr-btn" data-back="1">‹</button>'
        + `<h2 class="scr-title">${editing ? 'Подход' : 'Новый подход'}</h2>`)}
      <p class="set-exname muted">${esc(ex.name)}</p>
      ${prefill ? `<p class="set-from muted">Значения из прошлого раза (${fmtISO(prefill.from)})</p>` : ''}
      <div class="stepper">
        <span class="step-label">Вес, кг</span>
        <div class="step-row">
          <button type="button" class="step-btn" data-step="weight" data-d="-1">−</button>
          <input id="set-weight" type="number" inputmode="decimal" min="0" max="500" step="0.5" value="${dWeight}">
          <button type="button" class="step-btn" data-step="weight" data-d="1">+</button>
        </div>
      </div>
      <div class="stepper">
        <span class="step-label">Повторы</span>
        <div class="step-row">
          <button type="button" class="step-btn" data-step="reps" data-d="-1">−</button>
          <input id="set-reps" type="number" inputmode="numeric" min="0" max="200" step="1" value="${dReps}">
          <button type="button" class="step-btn" data-step="reps" data-d="1">+</button>
        </div>
      </div>
      <div class="stepper">
        <span class="step-label">Усилие</span>
        <div class="eff-row">${efforts}</div>
      </div>
      <div class="stepper">
        <span class="step-label">Комментарий</span>
        <input id="set-comment" type="text" maxlength="140" placeholder="Добавить комментарий" value="${esc(dComment)}">
      </div>
      <div class="set-actions">
        <button type="button" class="btn ghost" id="set-cancel">Отмена</button>
        ${editing
          ? '<button type="button" class="btn danger" id="set-delete">Удалить</button><button type="button" class="btn primary" id="set-save">Сохранить</button>'
          : '<button type="button" class="btn primary" id="set-add">Добавить</button>'}
      </div>`;

    const back = () => { location.hash = `#/ex/${wid}/${eid}`; };
    $('#screen-set').querySelector('[data-back]').addEventListener('click', back);
    $('#set-cancel').addEventListener('click', back);
    $('#screen-set').querySelectorAll('.step-btn').forEach((b) => {
      b.addEventListener('click', () => {
        const inp = b.dataset.step === 'weight' ? $('#set-weight') : $('#set-reps');
        const step = b.dataset.step === 'weight' ? 1 : 1;
        const v = Math.max(0, (parseFloat(inp.value.replace(',', '.')) || 0) + step * (+b.dataset.d));
        inp.value = b.dataset.step === 'weight' ? String(Math.round(v * 10) / 10) : String(Math.round(v));
      });
    });
    let effort = dEffort;
    $('#screen-set').querySelectorAll('.eff-btn').forEach((b) => {
      b.addEventListener('click', () => {
        const on = b.classList.contains('on');
        $('#screen-set').querySelectorAll('.eff-btn').forEach((x) => x.classList.remove('on'));
        if (on) { effort = ''; return; } // повторный тап снимает выбор
        b.classList.add('on');
        effort = b.dataset.eff;
      });
    });

    async function saveSet() {
      const weight = Math.max(0, parseFloat($('#set-weight').value.replace(',', '.')) || 0);
      const reps = Math.max(0, Math.round(parseFloat($('#set-reps').value) || 0));
      if (!weight && !reps) {
        if (window.FlintUI) window.FlintUI.toast('Укажите вес и повторы');
        return;
      }
      if (!reps) {
        if (window.FlintUI) window.FlintUI.toast('Укажите повторы');
        return;
      }
      const nw = await window.FlintDB.get(wid);
      const ne = nw.exercises.find((e) => e.id === eid);
      const comment = $('#set-comment').value.trim();
      if (editing) {
        const s = ne.sets.find((x) => x.id === sid);
        Object.assign(s, { weight, reps, effort: effort || null, comment });
      } else {
        const rec = { id: uuid(), weight, reps, effort: effort || null, comment };
        /* Клик по серой строке прошлого (insertIndex): после ввода подход
           встанет в эту же строку таблицы (этап 7.3) */
        const at = (prefill && Number.isInteger(prefill.insertIndex))
          ? Math.min(prefill.insertIndex, ne.sets.length)
          : ne.sets.length;
        ne.sets.splice(at, 0, rec);
      }
      nw.updatedAt = Date.now();
      await window.FlintDB.put(nw);
      window.FlintSync.markDirty();
      back();
    }
    const addBtn = $('#set-add');
    if (addBtn) addBtn.addEventListener('click', saveSet);
    const saveBtn = $('#set-save');
    if (saveBtn) saveBtn.addEventListener('click', saveSet);
    const delBtn = $('#set-delete');
    if (delBtn) {
      delBtn.addEventListener('click', async () => {
        if (!confirm('Удалить этот подход?')) return;
        const nw = await window.FlintDB.get(wid);
        const ne = nw.exercises.find((e) => e.id === eid);
        ne.sets = ne.sets.filter((s) => s.id !== sid);
        nw.updatedAt = Date.now();
        await window.FlintDB.put(nw);
        window.FlintSync.markDirty();
        back();
      });
    }
  }

  /* ==================== справочники: «Мои» + «База» ==================== */

  async function renderLibrary() {
    showScreen('library');
    const dbCount = window.FlintBaseDB ? window.FlintBaseDB.count : 0;
    await imgReady();

    let bodyHtml;
    if (libTab === 'my') {
      const lib = await window.FlintDB.getActiveExercises();
      const q = normName(myQuery);
      const hits = q ? lib.filter((e) => normName(e.name).includes(q)) : lib;
      const items = hits.map((e) => `
        <div class="lib-item" data-lib="${e.id}">
          <span class="avatar">${imgTag(e.baseId) || esc(e.name.trim().charAt(0).toUpperCase())}</span>
          <span class="lib-body">
            <span class="lib-name">${esc(e.name)}</span>
          </span>
          <button type="button" class="mini-btn" data-rename="${e.id}" data-cur="${esc(e.name)}" title="Переименовать">✎</button>
          <button type="button" class="mini-btn danger" data-dellib="${e.id}" title="Удалить">✕</button>
        </div>`).join('');
      bodyHtml = `
        <div class="card lib-add">
          <input id="lib-new" type="text" maxlength="80" placeholder="Новое упражнение…" autocomplete="off">
          <button type="button" class="btn primary small" id="lib-add-btn">Добавить</button>
        </div>
        <div class="card"><input id="lib-search" type="search" placeholder="Поиск…" value="${esc(myQuery)}" autocomplete="off"></div>
        <div class="lib-list">${items || '<p class="muted empty">Пусто. Добавьте упражнения — они пригодятся при вводе тренировок.</p>'}</div>
        <p class="muted small-note pad">Тап по упражнению открывает карточку: история, прогресс и техника. Переименование и удаление — кнопками справа.</p>`;
    } else if (libTab === 'prog') {
      const progs = await window.FlintDB.getActivePrograms();
      const items = progs.map((p) => `
        <div class="lib-item" data-prog="${p.id}">
          <span class="avatar">${esc((p.name || '?').charAt(0).toUpperCase())}</span>
          <span class="lib-body">
            <span class="lib-name">${esc(p.name)}</span>
            <span class="lib-sub">${p.workouts.length ? p.workouts.length + ' ' + plural(p.workouts.length, ['тренировка', 'тренировки', 'тренировок']) : 'нет тренировок'}</span>
          </span>
          <button type="button" class="mini-btn danger" data-delprog="${p.id}" title="Удалить программу">✕</button>
        </div>`).join('');
      bodyHtml = `
        <div class="card lib-add">
          <input id="prog-new" type="text" maxlength="80" placeholder="Новая программа — например, «Верх/низ»…" autocomplete="off">
          <button type="button" class="btn primary small" id="prog-add-btn">Добавить</button>
        </div>
        <div class="lib-list">${items || '<p class="muted empty">Программ пока нет. Создайте и добавьте в неё тренировки — например, «Верх A» и «Низ A».</p>'}</div>
        <p class="muted small-note pad">Программа — набор тренировок-шаблонов. При старте («+ Тренировка») упражнения из шаблона копируются
          в живую тренировку на выбранный день; сама программа остаётся без изменений.</p>`;
    } else {
      const counts = await baseHistory();
      let hits = baseHits(baseQuery);
      if (baseEq !== 'все') hits = hits.filter((x) => x.eq === baseEq);
      if (baseDoneOnly) hits = hits.filter((x) => counts.has(x.id));

      /* Группы мышц (этап 7): при простом просмотре — свернуты, при активном
         поиске или фильтрах подходящие группы раскрываются автоматически. */
      const autoOpen = !!(baseQuery.trim() || baseEq !== 'все' || baseDoneOnly);
      const groups = new Map(); // мышца → [упражнения]
      for (const x of hits) {
        const g = (x.pm && x.pm[0]) || 'другие мышцы';
        if (!groups.has(g)) groups.set(g, []);
        groups.get(g).push(x);
      }
      const gKeys = [...groups.keys()].sort((a, b) => {
        const ia = MUSCLE_ORDER.indexOf(a);
        const ib = MUSCLE_ORDER.indexOf(b);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b, 'ru');
      });
      const rowOf = (x) => {
        const c = counts.get(x.id);
        return `
        <button type="button" class="lib-item two" data-base="${esc(x.id)}">
          <span class="avatar">${imgTag(x.id) || esc((x.n || '?').charAt(0).toUpperCase())}</span>
          <span class="lib-body">
            <span class="lib-name">${esc(x.n)}</span>
            <span class="lib-sub">${esc((x.pm || []).slice(1).join(', '))}${x.eq ? (x.pm.length > 1 ? ' · ' : '') + esc(x.eq) : ''}</span>
          </span>
          ${c ? `<span class="done-badge" title="Тренировок с этим упражнением: ${c}">${c}</span>` : ''}
        </button>`;
      };
      /* Все заголовки групп видны всегда; строки рендерятся только у раскрытых
         групп (лениво), кап на группу — чтобы не рисовать сотни рядов разом. */
      const GROUP_CAP = 40;
      const blocks = gKeys.map((g) => {
        const items = groups.get(g);
        const open = autoOpen ? !closedGroups.has(g) : openGroups.has(g);
        const take = open ? items.slice(0, GROUP_CAP) : [];
        return `
        <div class="grp${open ? ' open' : ''}">
          <button type="button" class="grp-head" data-grp="${esc(g)}">
            <span class="chev">›</span>
            <span class="grp-name">${esc(g)}</span>
            <span class="grp-count">${items.length}</span>
          </button>
          <div class="grp-body"${open ? '' : ' hidden'}>
            ${take.map(rowOf).join('')}
            ${open && items.length > take.length ? `<p class="muted small-note grp-more">Показаны ${take.length} из ${items.length} — уточните поиск.</p>` : ''}
          </div>
        </div>`;
      }).join('');

      const chips = `<button type="button" class="chip${baseDoneOnly ? ' on' : ''}" data-eq="__done__">С тренировками</button>`
        + BASE_EQ.map((e) => `<button type="button" class="chip${baseEq === e ? ' on' : ''}" data-eq="${esc(e)}">${esc(e)}</button>`).join('');
      bodyHtml = `
        <div class="card"><input id="base-search" type="search" placeholder="Поиск: название, алиас («жим лёжа»), мышца…" value="${esc(baseQuery)}" autocomplete="off"></div>
        <div class="chip-row">${chips}</div>
        <p class="muted small-note" id="base-count">Найдено: ${hits.length} из ${dbCount} — группы по основной мышце</p>
        <div class="grp-list">${blocks || '<p class="muted empty">Ничего не найдено. Ослабьте фильтры или измените поиск.</p>'}</div>
        <p class="muted small-note pad">База — ${dbCount} упражнений с техникой, мышцами и примечаниями (источник RU-free-exercise-db, общественное достояние).
          «С тренировками» показывает только то, что вы уже выполняли; число справа — сколько тренировок.</p>`;
    }

    $('#screen-library').innerHTML = `
      <div class="seg" role="tablist">
        <button type="button" class="seg-btn${libTab === 'prog' ? ' on' : ''}" data-seg="prog">Программы</button>
        <button type="button" class="seg-btn${libTab === 'my' ? ' on' : ''}" data-seg="my">Мои упражнения</button>
        <button type="button" class="seg-btn${libTab === 'db' ? ' on' : ''}" data-seg="db">База упражнений · ${dbCount}</button>
      </div>
      ${bodyHtml}`;

    $('#screen-library').querySelectorAll('.seg-btn').forEach((b) => {
      b.addEventListener('click', () => { libTab = b.dataset.seg; renderLibrary(); });
    });

    if (libTab === 'my') {
      const add = async () => {
        const inp = $('#lib-new');
        const name = inp.value.trim();
        if (!name) return;
        const now = Date.now();
        await window.FlintDB.putExercise({ id: uuid(), name, createdAt: now, updatedAt: now });
        window.FlintSync.markDirty();
        myQuery = '';
        renderLibrary();
      };
      $('#lib-add-btn').addEventListener('click', add);
      $('#lib-new').addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
      const search = $('#lib-search');
      search.addEventListener('input', () => { myQuery = search.value; renderLibrary().then(() => refocus('#lib-search')); });
      $('#screen-library').querySelectorAll('[data-rename]').forEach((b) => {
        b.addEventListener('click', async () => {
          const name = prompt('Новое название:', b.dataset.cur);
          if (!name || !name.trim() || name.trim() === b.dataset.cur) return;
          const rec = await window.FlintDB.getExercise(b.dataset.rename);
          rec.name = name.trim();
          rec.updatedAt = Date.now();
          await window.FlintDB.putExercise(rec);
          window.FlintSync.markDirty();
          renderLibrary().then(() => refocus('#lib-search'));
        });
      });
      $('#screen-library').querySelectorAll('[data-dellib]').forEach((b) => {
        b.addEventListener('click', async (ev) => {
          ev.stopPropagation();
          if (!confirm('Удалить упражнение из справочника? В уже записанных тренировках оно останется.')) return;
          await window.FlintDB.removeExercise(b.dataset.dellib);
          window.FlintSync.markDirty();
          renderLibrary().then(() => refocus('#lib-search'));
        });
      });
      // тап по строке — карточка упражнения (Инфо · История · Прогресс)
      $('#screen-library').querySelectorAll('[data-lib]').forEach((b) => {
        b.addEventListener('click', (ev) => {
          if (ev.target.closest('[data-rename],[data-dellib]')) return;
          baseExBack = '#/library';
          location.hash = '#/myex/' + b.dataset.lib;
        });
      });
    } else if (libTab === 'prog') {
      const addProg = async () => {
        const inp = $('#prog-new');
        const name = inp.value.trim();
        if (!name) return;
        const now = Date.now();
        const p = { id: uuid(), name, v: 1, workouts: [], createdAt: now, updatedAt: now };
        await window.FlintDB.putProgram(p);
        window.FlintSync.markDirty();
        location.hash = '#/program/' + p.id; // сразу к шаблонам
      };
      $('#prog-add-btn').addEventListener('click', addProg);
      $('#prog-new').addEventListener('keydown', (e) => { if (e.key === 'Enter') addProg(); });
      $('#screen-library').querySelectorAll('[data-delprog]').forEach((b) => {
        b.addEventListener('click', async (ev) => {
          ev.stopPropagation();
          if (!confirm('Удалить программу? Уже начатые тренировки останутся.')) return;
          await window.FlintDB.removeProgram(b.dataset.delprog);
          window.FlintSync.markDirty();
          renderLibrary();
        });
      });
      $('#screen-library').querySelectorAll('[data-prog]').forEach((b) => {
        b.addEventListener('click', () => { location.hash = '#/program/' + b.dataset.prog; });
      });
    } else {
      const search = $('#base-search');
      search.addEventListener('input', () => { baseQuery = search.value; renderLibrary().then(() => refocus('#base-search')); });
      $('#screen-library').querySelectorAll('.chip').forEach((b) => {
        b.addEventListener('click', () => {
          if (b.dataset.eq === '__done__') baseDoneOnly = !baseDoneOnly;
          else baseEq = b.dataset.eq;
          renderLibrary().then(() => refocus('#base-search'));
        });
      });
      $('#screen-library').querySelectorAll('[data-grp]').forEach((b) => {
        b.addEventListener('click', () => {
          const g = b.dataset.grp;
          const isOpen = b.closest('.grp').classList.contains('open');
          if (isOpen) { closedGroups.add(g); openGroups.delete(g); }
          else { openGroups.add(g); closedGroups.delete(g); }
          renderLibrary().then(() => refocus('#base-search'));
        });
      });
      $('#screen-library').querySelectorAll('[data-base]').forEach((b) => {
        b.addEventListener('click', () => {
          baseExBack = '#/library';
          location.hash = '#/baseex/' + b.dataset.base;
        });
      });
    }
  }

  /* ==================== карточка упражнения базы ==================== */

  async function renderBaseEx(id) {
    const db = window.FlintBaseDB;
    const x = db && db.byId.get(id);
    if (!x) { location.hash = '#/library'; return; }
    showScreen('baseex');
    // подсветка вкладки: из справочника → «Справочники», из тренировки → «Дневники»
    const flowTab = (baseExBack && baseExBack.indexOf('#/ex/') === 0) ? 'day' : 'library';
    document.querySelectorAll('.tabbar .tab').forEach((t) => {
      t.classList.toggle('on', t.dataset.tab === flowTab);
    });
    if (cardKey !== 'b:' + id) { cardTab = 'info'; cardKey = 'b:' + id; }
    await imgReady();

    const chips = [
      x.eq ? `<span class="bx-chip hl">${esc(x.eq)}</span>` : '',
      x.lv ? `<span class="bx-chip">${esc(x.lv)}</span>` : '',
      x.me ? `<span class="bx-chip">${esc(x.me)}</span>` : '',
      x.cat ? `<span class="bx-chip">${esc(x.cat)}</span>` : '',
    ].join('');
    const steps = (x.ins || []).map((s) => `<li>${esc(s)}</li>`).join('');
    const prim = (x.pm || []).join(', ');
    const sec = (x.sm || []).join(', ');

    /* Вкладки (этап 7.2): Инфо · История · Прогресс */
    const hist = await baseHistoryEntries(x.id);
    let tabBody;
    if (cardTab === 'hist') {
      tabBody = histBlockHTML(hist);
    } else if (cardTab === 'prog') {
      tabBody = progressBlockHTML(hist);
    } else {
      tabBody = `
        ${steps ? `<div class="card"><h4 class="bx-h">Как выполняется</h4><ol class="bx-steps">${steps}</ol></div>` : ''}
        ${prim || sec ? `<div class="card"><h4 class="bx-h">Мышцы</h4>
          <p class="bx-mus"><span class="muted">Основные:</span> <b>${esc(prim)}</b></p>
          ${sec ? `<p class="bx-mus"><span class="muted">Дополнительные:</span> ${esc(sec)}</p>` : ''}
        </div>` : ''}
        ${x.tip ? `<div class="card note-box"><h4 class="bx-h">Примечание</h4><p class="bx-note">${esc(x.tip)}</p></div>` : ''}
        ${aliAsk(x.n)}`;
    }

    $('#screen-baseex').innerHTML = `
      ${topbar('<button type="button" class="scr-btn" data-back="1">‹</button>'
        + '<h2 class="scr-title">Упражнение</h2>')}
      <div class="card bx-head">
        <h3 class="bx-name">${esc(x.n)}</h3>
        <div class="bx-chips">${chips}</div>
      </div>
      ${imgTag(id, 'ex', 'Техника упражнения: старт и финиш')
        ? `<div class="card bx-pics">${imgTag(id, 'ex', 'Техника упражнения: старт и финиш')}</div>` : ''}
      ${cardTabsHTML(cardTab, hist.length)}
      ${tabBody}
      <div class="fab-wrap"><button type="button" class="fab" id="baseex-add">+ Добавить в тренировку</button></div>`;

    $('#screen-baseex').querySelector('[data-back]').addEventListener('click', () => {
      location.hash = baseExBack || '#/library';
    });
    $('#screen-baseex').querySelectorAll('[data-ctab]').forEach((b) => {
      b.addEventListener('click', () => { cardTab = b.dataset.ctab; renderBaseEx(id); });
    });
    bindHistRows($('#screen-baseex'), hist);
    $('#baseex-add').addEventListener('click', () => addToWorkoutFlow(x.n, x.id, null));
  }

  /* Карточка «своего» упражнения (этап 7.2): те же вкладки, что и у базы —
     Инфо (связь с базой), История и Прогресс считаются по exerciseId. */
  async function renderMyEx(id) {
    const lib = await window.FlintDB.getAllExercises();
    const rec = lib.find((e) => e.id === id);
    if (!rec) { location.hash = '#/library'; return; }
    showScreen('myex');
    document.querySelectorAll('.tabbar .tab').forEach((t) => {
      t.classList.toggle('on', t.dataset.tab === 'library');
    });
    if (cardKey !== 'my:' + id) { cardTab = 'info'; cardKey = 'my:' + id; }

    const baseRec = rec.baseId && window.FlintBaseDB ? window.FlintBaseDB.byId.get(rec.baseId) : null;
    const chips = baseRec
      ? `<button type="button" class="bx-chip hl" id="myex-base">Техника в базе: ${esc(baseRec.n)}</button>`
      : '';

    const hist = await myHistoryEntries(rec);
    let tabBody;
    if (cardTab === 'hist') {
      tabBody = histBlockHTML(hist);
    } else if (cardTab === 'prog') {
      tabBody = progressBlockHTML(hist);
    } else {
      tabBody = baseRec
        ? `<div class="card note-box"><h4 class="bx-h">Как выполняется</h4>
             <p class="bx-note">Техника и мышцы описаны в карточке базы — открывается кнопкой выше. Здесь ведётся история именно этого упражнения из ваших тренировок.</p>
           </div>`
        : '<div class="card note-box"><p class="bx-note">Свое упражнение без привязки к базе. История и прогресс собираются по совпадению названия в тренировках.</p></div>'
          + aliAsk(rec.name);
    }

    $('#screen-myex').innerHTML = `
      ${topbar('<button type="button" class="scr-btn" data-back="1">‹</button>'
        + '<h2 class="scr-title">Упражнение</h2>')}
      <div class="card bx-head">
        <h3 class="bx-name">${esc(rec.name)}</h3>
        <div class="bx-chips">${chips}</div>
      </div>
      ${cardTabsHTML(cardTab, hist.length)}
      ${tabBody}
      <div class="fab-wrap"><button type="button" class="fab" id="myex-add">+ Добавить в тренировку</button></div>`;

    $('#screen-myex').querySelector('[data-back]').addEventListener('click', () => {
      location.hash = baseExBack && baseExBack.indexOf('#/ex/') === 0 ? baseExBack : '#/library';
    });
    const baseBtn = $('#myex-base');
    if (baseBtn) {
      baseBtn.addEventListener('click', () => {
        baseExBack = '#/myex/' + id;
        location.hash = '#/baseex/' + rec.baseId;
      });
    }
    $('#screen-myex').querySelectorAll('[data-ctab]').forEach((b) => {
      b.addEventListener('click', () => { cardTab = b.dataset.ctab; renderMyEx(id); });
    });
    bindHistRows($('#screen-myex'), hist);
    $('#myex-add').addEventListener('click', () => addToWorkoutFlow(rec.name, rec.baseId || null, rec.id));
  }

  /* ==================== программы (этап 7) ==================== */

  async function renderProgram(pid) {
    const p = await window.FlintDB.getProgram(pid);
    if (!p || p.deleted) { location.hash = '#/library'; return; }
    showScreen('program');
    const tItems = p.workouts.map((t, i) => `
      <div class="lib-item two" data-tpl="${t.id}">
        <span class="avatar">${esc((t.name || '?').charAt(0).toUpperCase())}</span>
        <span class="lib-body">
          <span class="lib-name">${esc(t.name)}</span>
          <span class="lib-sub">${t.exercises.length ? t.exercises.length + ' ' + plural(t.exercises.length, ['упражнение', 'упражнения', 'упражнений']) : 'без упражнений'}</span>
        </span>
        <button type="button" class="mini-btn" data-mvup="${t.id}" title="Выше"${i === 0 ? ' disabled' : ''}>↑</button>
        <button type="button" class="mini-btn" data-mvdn="${t.id}" title="Ниже"${i === p.workouts.length - 1 ? ' disabled' : ''}>↓</button>
        <button type="button" class="mini-btn" data-renameT="${t.id}" data-cur="${esc(t.name)}" title="Переименовать">✎</button>
        <button type="button" class="mini-btn danger" data-deltpl="${t.id}" title="Удалить тренировку из программы">✕</button>
      </div>`).join('');

    $('#screen-program').innerHTML = `
      ${topbar('<button type="button" class="scr-btn" data-back="1">‹</button>'
        + '<h2 class="scr-title">Программа</h2>'
        + '<button type="button" class="scr-btn" data-renp="1" title="Переименовать программу">✎</button>'
        + '<button type="button" class="scr-btn danger" data-delp="1" title="Удалить программу">🗑</button>')}
      <div class="card prog-head">
        <h3 class="bx-name">${esc(p.name)}</h3>
        <p class="muted small-note">${p.workouts.length ? p.workouts.length + ' ' + plural(p.workouts.length, ['тренировка', 'тренировки', 'тренировок']) : 'Добавьте первую тренировку'}</p>
      </div>
      <div class="card lib-add">
        <input id="tpl-new" type="text" maxlength="80" placeholder="Новая тренировка — например, «Верх A»…" autocomplete="off">
        <button type="button" class="btn primary small" id="tpl-add-btn">Добавить</button>
      </div>
      <div class="lib-list">${tItems}</div>
      <p class="muted small-note pad">При старте («+ Тренировка») упражнения из шаблона копируются в живую тренировку; состав и порядок шаблона правятся здесь.</p>`;

    $('#screen-program').querySelector('[data-back]').addEventListener('click', () => { location.hash = '#/library'; });
    $('#screen-program').querySelector('[data-renp]').addEventListener('click', async () => {
      const name = prompt('Название программы:', p.name);
      if (!name || !name.trim() || name.trim() === p.name) return;
      const np = await window.FlintDB.getProgram(pid);
      np.name = name.trim();
      np.updatedAt = Date.now();
      await window.FlintDB.putProgram(np);
      window.FlintSync.markDirty();
      renderProgram(pid);
    });
    $('#screen-program').querySelector('[data-delp]').addEventListener('click', async () => {
      if (!confirm('Удалить программу «' + p.name + '»? Уже начатые тренировки останутся.')) return;
      await window.FlintDB.removeProgram(pid);
      window.FlintSync.markDirty();
      location.hash = '#/library';
    });
    const addTpl = async () => {
      const inp = $('#tpl-new');
      const name = inp.value.trim();
      if (!name) return;
      const np = await window.FlintDB.getProgram(pid);
      np.workouts.push({ id: uuid(), name, exercises: [] });
      np.updatedAt = Date.now();
      await window.FlintDB.putProgram(np);
      window.FlintSync.markDirty();
      renderProgram(pid);
    };
    $('#tpl-add-btn').addEventListener('click', addTpl);
    $('#tpl-new').addEventListener('keydown', (e) => { if (e.key === 'Enter') addTpl(); });
    $('#screen-program').querySelectorAll('[data-tpl]').forEach((b) => {
      b.addEventListener('click', () => { location.hash = `#/progw/${pid}/${b.dataset.tpl}`; });
    });
    $('#screen-program').querySelectorAll('[data-renameT]').forEach((b) => {
      b.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        const name = prompt('Название тренировки:', b.dataset.cur);
        if (!name || !name.trim() || name.trim() === b.dataset.cur) return;
        await saveProgram(pid, (np) => {
          const t = np.workouts.find((x) => x.id === b.dataset.renameT);
          if (t) t.name = name.trim();
        });
        renderProgram(pid);
      });
    });
    $('#screen-program').querySelectorAll('[data-deltpl]').forEach((b) => {
      b.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        if (!confirm('Удалить тренировку из программы?')) return;
        await saveProgram(pid, (np) => {
          np.workouts = np.workouts.filter((x) => x.id !== b.dataset.deltpl);
        });
        renderProgram(pid);
      });
    });
    /* Перемещение тренировок вверх/вниз (этап 7.3) */
    $('#screen-program').querySelectorAll('[data-mvup],[data-mvdn]').forEach((b) => {
      b.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        const tid = b.dataset.mvup || b.dataset.mvdn;
        const dir = b.dataset.mvup ? -1 : 1;
        await saveProgram(pid, (np) => {
          const i = np.workouts.findIndex((x) => x.id === tid);
          const j = i + dir;
          if (i < 0 || j < 0 || j >= np.workouts.length) return;
          [np.workouts[i], np.workouts[j]] = [np.workouts[j], np.workouts[i]];
        });
        renderProgram(pid);
      });
    });
  }

  /* Правка программы одним ходом: fn(np) мутирует запись, штамп обновляется,
     сохраняем и помечаем синхронизацию. */
  async function saveProgram(pid, fn) {
    const np = await window.FlintDB.getProgram(pid);
    fn(np);
    np.updatedAt = Date.now();
    await window.FlintDB.putProgram(np);
    window.FlintSync.markDirty();
  }

  async function renderProgWorkout(pid, tid) {
    const p = await window.FlintDB.getProgram(pid);
    const t = p && !p.deleted ? p.workouts.find((x) => x.id === tid) : null;
    if (!t) { location.hash = '#/library'; return; }
    showScreen('progw');
    const libAll = await window.FlintDB.getAllExercises();
    await imgReady();
    const rows = t.exercises.map((ref, i) => {
      const bx = findBaseFor(ref, libAll);
      return `
      <div class="lib-item two">
        <span class="avatar">${imgTag(bx ? bx.id : '') || esc((ref.name || '?').charAt(0).toUpperCase())}</span>
        <span class="lib-body">
          <span class="lib-name">${esc(ref.name)}</span>
          <span class="lib-sub">${bx ? esc((bx.pm || []).join(', ')) + (bx.eq ? ' · ' + esc(bx.eq) : '') : 'своё упражнение'}</span>
        </span>
        <button type="button" class="mini-btn" data-act="up" data-i="${i}" title="Выше"${i === 0 ? ' disabled' : ''}>↑</button>
        <button type="button" class="mini-btn" data-act="down" data-i="${i}" title="Ниже"${i === t.exercises.length - 1 ? ' disabled' : ''}>↓</button>
        <button type="button" class="mini-btn danger" data-act="del" data-i="${i}" title="Убрать упражнение">✕</button>
      </div>`;
    }).join('');

    $('#screen-progw').innerHTML = `
      ${topbar('<button type="button" class="scr-btn" data-back="1">‹</button>'
        + '<h2 class="scr-title">Тренировка программы</h2>')}
      <div class="card">
        <div class="ex-title-row">
          <h3 class="bx-name">${esc(t.name)}</h3>
          <button type="button" class="btn ghost small" id="tpl-rename">Переименовать</button>
        </div>
        <p class="muted small-note">Программа: ${esc(p.name)} • порядок упражнений — стрелками</p>
      </div>
      <div class="lib-list">${rows || '<p class="muted empty">Упражнений нет — добавьте из библиотеки или базы.</p>'}</div>
      <div class="fab-wrap"><button type="button" class="fab" id="tpl-addex">+ Упражнение</button></div>`;

    $('#screen-progw').querySelector('[data-back]').addEventListener('click', () => { location.hash = '#/program/' + pid; });
    $('#tpl-rename').addEventListener('click', async () => {
      const name = prompt('Название тренировки:', t.name);
      if (!name || !name.trim() || name.trim() === t.name) return;
      const np = await window.FlintDB.getProgram(pid);
      const nt = np.workouts.find((x) => x.id === tid);
      nt.name = name.trim();
      np.updatedAt = Date.now();
      await window.FlintDB.putProgram(np);
      window.FlintSync.markDirty();
      renderProgWorkout(pid, tid);
    });
    const mutateTpl = async (ev) => {
      const b = ev.currentTarget;
      const i = +b.dataset.i;
      const np = await window.FlintDB.getProgram(pid);
      const nt = np.workouts.find((x) => x.id === tid);
      if (b.dataset.act === 'up' && i > 0) {
        [nt.exercises[i - 1], nt.exercises[i]] = [nt.exercises[i], nt.exercises[i - 1]];
      } else if (b.dataset.act === 'down' && i < nt.exercises.length - 1) {
        [nt.exercises[i + 1], nt.exercises[i]] = [nt.exercises[i], nt.exercises[i + 1]];
      } else if (b.dataset.act === 'del') {
        nt.exercises.splice(i, 1);
      } else {
        return;
      }
      np.updatedAt = Date.now();
      await window.FlintDB.putProgram(np);
      window.FlintSync.markDirty();
      renderProgWorkout(pid, tid);
    };
    $('#screen-progw').querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', mutateTpl));
    $('#tpl-addex').addEventListener('click', () => { location.hash = `#/picktpl/${pid}/${tid}`; });
  }

  /* ==================== старт тренировки ==================== */

  async function renderStart() {
    showScreen('start');
    const progs = await window.FlintDB.getActivePrograms();
    const blocks = progs.map((p) => `
      <div class="card">
        <h4 class="bx-h">${esc(p.name)}</h4>
        ${p.workouts.length ? p.workouts.map((t) => `
          <button type="button" class="lib-item" data-start="${p.id}/${t.id}">
            <span class="avatar">${esc((t.name || '?').charAt(0).toUpperCase())}</span>
            <span class="lib-body">
              <span class="lib-name">${esc(t.name)}</span>
              <span class="lib-sub">${t.exercises.length ? t.exercises.length + ' ' + plural(t.exercises.length, ['упражнение', 'упражнения', 'упражнений']) : 'пустой шаблон'}</span>
            </span>
            <span class="chev">›</span>
          </button>`).join('') : '<p class="muted small-note">В программе пока нет тренировок.</p>'}
      </div>`).join('');

    $('#screen-start').innerHTML = `
      ${topbar('<button type="button" class="scr-btn" data-back="1">‹</button>'
        + `<h2 class="scr-title">Тренировка ${fmtISO(viewDate || todayISO())}</h2>`)}
      ${blocks || '<p class="muted empty">Программ пока нет — создайте в «Справочниках» → «Программы», чтобы начинать тренировку в один тап.</p>'}
      <div class="card"><button type="button" class="btn primary wide" id="start-empty">Пустая тренировка</button></div>`;

    $('#screen-start').querySelector('[data-back]').addEventListener('click', () => { location.hash = '#/day'; });
    $('#start-empty').addEventListener('click', newWorkout);
    $('#screen-start').querySelectorAll('[data-start]').forEach((b) => {
      b.addEventListener('click', () => {
        const [pid, tid] = b.dataset.start.split('/');
        startFromProgram(pid, tid);
      });
    });
  }

  /* Тренировка из шаблона программы: упражнения копируются (снимок имён,
     ссылки exerciseId/baseId сохраняются), программа остаётся нетронутой. */
  async function startFromProgram(pid, tid) {
    const p = await window.FlintDB.getProgram(pid);
    const t = p && !p.deleted ? p.workouts.find((x) => x.id === tid) : null;
    if (!t) { location.hash = '#/day'; return; }
    const now = Date.now();
    const w = {
      id: uuid(), date: viewDate || todayISO(), title: t.name, v: 3,
      programId: pid, templateId: tid,
      exercises: t.exercises.map((ref) => ({
        id: uuid(), exerciseId: ref.exerciseId || null, baseId: ref.baseId || null,
        name: ref.name || '', sets: [],
      })),
      createdAt: now, updatedAt: now,
    };
    await window.FlintDB.put(w);
    window.FlintSync.markDirty();
    if (window.FlintUI && window.FlintUI.toast) window.FlintUI.toast(`Тренировка из программы «${p.name}»`);
    location.hash = '#/workout/' + w.id;
  }

  /* ==================== роутер ==================== */

  function route() {
    const h = location.hash || '#/day';
    let m;
    if (h === '#/more') return showScreen('more');
    if ((m = h.match(/^#\/workout\/(.+)$/))) return renderWorkout(m[1]);
    if ((m = h.match(/^#\/ex\/(.+?)\/(.+)$/))) return renderExercise(m[1], m[2]);
    if ((m = h.match(/^#\/set\/(.+?)\/(.+?)(?:\/(.+))?$/))) return renderSet(m[1], m[2], m[3] || null);
    if ((m = h.match(/^#\/pick\/(.+)$/))) return renderPick(m[1], '');
    if (h === '#/library') return renderLibrary();
    if ((m = h.match(/^#\/baseex\/(.+)$/))) return renderBaseEx(m[1]);
    if ((m = h.match(/^#\/myex\/(.+)$/))) return renderMyEx(m[1]);
    if (h === '#/start') return renderStart();
    if ((m = h.match(/^#\/program\/(.+)$/))) return renderProgram(m[1]);
    if ((m = h.match(/^#\/progw\/(.+?)\/(.+)$/))) return renderProgWorkout(m[1], m[2]);
    if ((m = h.match(/^#\/picktpl\/(.+?)\/(.+)$/))) return renderPickTpl(m[1], m[2], '');
    viewDate = viewDate || todayISO();
    return renderDay();
  }

  function renderAll() {
    route();
  }

  function init() {
    if (!viewDate) {
      const t = todayISO();
      viewDate = t;
      viewY = +t.slice(0, 4);
      viewM = +t.slice(5, 7) - 1;
    }
    window.addEventListener('hashchange', route);
    route();
  }

  return { init, renderAll, route };
})();
