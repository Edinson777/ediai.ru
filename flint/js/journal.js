/* Flint — журнал (этап 5): календарь → тренировка → упражнения → подходы.
 * Экраны (hash-роутер):
 *   #/day                  — календарь с точками тренировок + список за день
 *   #/workout/<id>         — карточка тренировки (упражнения, сводки подходов)
 *   #/ex/<wid>/<eid>       — упражнение: таблица подходов + серый «прошлый раз»
 *   #/set/<wid>/<eid>/<sid?> — отдельный экран подхода (степперы, усилие,
 *                             комментарий; <sid> — редактирование)
 *   #/pick/<wid>           — выбор упражнения из библиотеки (+ создание)
 *   #/library              — библиотека упражнений (справочник)
 * Имена упражнений внутри тренировки — снимок на момент добавления: пере-
 * именование в библиотеке не переписывает историю. История «прошлого раза» —
 * ближайшая предыдущая тренировка с тем же exerciseId (или тем же именем
 * для старых записей без привязки). */
window.FlintJournal = (function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);

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
      if (match && match.sets.length) return { date: w.date, ex: match };
    }
    return null;
  }

  /* ---- каркас экрана ---- */

  function showScreen(name) {
    document.querySelectorAll('.screen').forEach((s) => {
      s.classList.toggle('active', s.dataset.screen === name);
    });
    document.querySelectorAll('.tabbar .tab').forEach((t) => {
      const flow = ['workout', 'ex', 'set', 'pick'].includes(name) && t.dataset.tab === 'day';
      t.classList.toggle('on', t.dataset.tab === name || flow);
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
    $('#new-workout').addEventListener('click', newWorkout);
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
    const vol = fmtVol(workoutVolume(norm));
    const sets = workoutSets(norm);

    const exItems = norm.exercises.map((e) => `
      <div class="ex-item" data-eid="${e.id}">
        <span class="avatar">${esc((e.name || '?').trim().charAt(0).toUpperCase() || '?')}</span>
        <span class="exi-body">
          <span class="exi-name">${esc(e.name) || '<span class="muted">Без названия</span>'}</span>
          <span class="exi-sets muted">${esc(exSummary(e)) || '—'}</span>
        </span>
        <span class="exi-vol muted">${exVolume(e) ? fmtVol(exVolume(e)) + ' • ' + e.sets.length : ''}</span>
        <button type="button" class="mini-btn danger" data-delex="${e.id}" title="Убрать упражнение">✕</button>
      </div>`).join('');

    $('#screen-workout').innerHTML = `
      ${topbar('<button type="button" class="scr-btn" data-back="1">‹</button>'
        + '<h2 class="scr-title">Тренировка</h2>'
        + `<button type="button" class="scr-btn danger" data-delw="1" title="Удалить тренировку">🗑</button>`)}
      <div class="card wo-meta">
        <input id="wo-title" type="text" placeholder="Название тренировки" maxlength="80" value="${esc(w.title)}">
        <div class="wo-stats muted">
          <span>Дата: ${fmtISO(norm.date)} (${weekdayOf(norm.date)})</span>
          ${vol ? `<span>Объём: ${vol}</span>` : ''}${sets ? `<span>Подходов: ${sets}</span>` : ''}
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

  /* ==================== выбор упражнения из библиотеки ==================== */

  async function renderPick(wid, filter) {
    const w = await window.FlintDB.get(wid);
    if (!w || w.deleted) { location.hash = '#/day'; return; }
    showScreen('pick');
    const lib = await window.FlintDB.getActiveExercises();
    const q = (filter || '').trim().toLowerCase();
    const hits = q ? lib.filter((e) => e.name.toLowerCase().includes(q)) : lib;
    const exact = q && lib.some((e) => e.name.toLowerCase() === q);

    const items = hits.map((e) => `
      <button type="button" class="lib-item" data-pick="${e.id}" data-name="${esc(e.name)}">
        <span class="avatar">${esc(e.name.trim().charAt(0).toUpperCase())}</span>
        <span class="lib-name">${esc(e.name)}</span>
      </button>`).join('');
    const createRow = q && !exact
      ? `<button type="button" class="lib-item create" data-create="1">
           <span class="avatar plus">+</span>
           <span class="lib-name">Создать «${esc(filter.trim())}»</span>
         </button>`
      : '';

    $('#screen-pick').innerHTML = `
      ${topbar('<button type="button" class="scr-btn" data-back="1">‹</button>'
        + '<h2 class="scr-title">Выбрать упражнение</h2>')}
      <div class="card">
        <input id="pick-search" type="search" placeholder="Поиск или новое название…" value="${esc(filter || '')}" autocomplete="off">
      </div>
      <div class="lib-list">${createRow}${items || (q ? '' : '<p class="muted empty">Библиотека пуста — введите название, чтобы создать упражнение.</p>')}</div>`;

    $('#screen-pick').querySelector('[data-back]').addEventListener('click', () => { location.hash = '#/workout/' + wid; });
    const search = $('#pick-search');
    search.addEventListener('input', () => renderPick(wid, search.value));
    const addAndOpen = async (libId, name) => {
      const nw = await window.FlintDB.get(wid);
      const entry = { id: uuid(), exerciseId: libId || null, name: name || '', sets: [] };
      nw.exercises.push(entry);
      nw.updatedAt = Date.now();
      await window.FlintDB.put(nw);
      window.FlintSync.markDirty();
      location.hash = `#/ex/${wid}/${entry.id}`;
    };
    $('#screen-pick').querySelectorAll('[data-pick]').forEach((b) => {
      b.addEventListener('click', () => addAndOpen(b.dataset.pick, b.dataset.name));
    });
    const cr = $('#screen-pick').querySelector('[data-create]');
    if (cr) {
      cr.addEventListener('click', async () => {
        const name = filter.trim();
        const now = Date.now();
        const libRec = { id: uuid(), name, createdAt: now, updatedAt: now };
        await window.FlintDB.putExercise(libRec);
        window.FlintSync.markDirty();
        await addAndOpen(libRec.id, name);
      });
    }
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
    const prevBlock = prev
      ? `<button type="button" class="prev-note" id="prev-toggle">
           <span class="muted">*Прошлое занятие было ${fmtISO(prev.date)}</span><span class="chev">›</span>
         </button>
         <div class="prev-sets muted hidden" id="prev-sets">
           ${prev.ex.sets.map((s, i) => `<div class="prev-row"><span>${i + 1}</span><span>${fmtW(s.weight)}</span><span>${s.reps}</span></div>`).join('')}
         </div>`
      : '<p class="prev-note muted">Первое выполнение этого упражнения.</p>';

    const rows = ex.sets.map((s, i) => {
      const ef = effortOf(s.effort);
      return `<div class="set-row" data-sid="${s.id}">
          <span class="set-bar" style="background:${ef ? ef.color : 'var(--line)'}"></span>
          <span class="set-n">${i + 1}</span>
          <span class="set-w">${fmtW(s.weight)}</span>
          <span class="set-r">${s.reps}</span>
          <button type="button" class="mini-btn danger" data-delset="${s.id}" title="Удалить подход">✕</button>
        </div>`;
    }).join('');

    $('#screen-ex').innerHTML = `
      ${topbar('<button type="button" class="scr-btn" data-back="1">‹</button>'
        + '<h2 class="scr-title">Подходы</h2>')}
      <div class="card ex-head">
        <h3 class="ex-title">${esc(ex.name) || 'Без названия'}</h3>
        <p class="muted">${ex.sets.length ? fmtVol(exVolume(ex)) + ' • подходов: ' + ex.sets.length : 'Подходов пока нет'}</p>
      </div>
      <div class="sets-head"><span></span><span>№</span><span>Вес, кг</span><span>Повторы</span><span></span></div>
      <div class="sets-list">${rows || ''}</div>
      ${prevBlock}
      <div class="fab-wrap"><button type="button" class="fab" id="add-set">+ Добавить подход</button></div>`;

    $('#screen-ex').querySelector('[data-back]').addEventListener('click', () => { location.hash = '#/workout/' + wid; });
    const pt = $('#prev-toggle');
    if (pt) {
      pt.addEventListener('click', () => $('#prev-sets').classList.toggle('hidden'));
    }
    $('#screen-ex').querySelectorAll('.set-row').forEach((el) => {
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

    /* предзаполнение: правимый подход → последний подход этого упражнения →
       прошлый раз → нейтральные 20×10 */
    let dWeight = 20;
    let dReps = 10;
    if (editing) {
      dWeight = +editing.weight || 0;
      dReps = +editing.reps || 0;
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
    const dEffort = editing ? (editing.effort || '') : '';
    const dComment = editing ? (editing.comment || '') : '';

    const efforts = EFFORTS.map((e) => `
      <button type="button" class="eff-btn${dEffort === e.v ? ' on' : ''}"
        data-eff="${e.v}" style="--eff:${e.color}">${e.label}</button>`).join('');

    $('#screen-set').innerHTML = `
      ${topbar('<button type="button" class="scr-btn" data-back="1">‹</button>'
        + `<h2 class="scr-title">${editing ? 'Подход' : 'Новый подход'}</h2>`)}
      <p class="set-exname muted">${esc(ex.name)}</p>
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
        ne.sets.push({ id: uuid(), weight, reps, effort: effort || null, comment });
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

  /* ==================== библиотека (справочник) ==================== */

  async function renderLibrary(q) {
    showScreen('library');
    const lib = await window.FlintDB.getActiveExercises();
    const query = (q || '').trim().toLowerCase();
    const hits = query ? lib.filter((e) => e.name.toLowerCase().includes(query)) : lib;

    const items = hits.map((e) => `
      <div class="lib-item" data-lib="${e.id}">
        <span class="avatar">${esc(e.name.trim().charAt(0).toUpperCase())}</span>
        <span class="lib-name">${esc(e.name)}</span>
        <button type="button" class="mini-btn" data-rename="${e.id}" data-cur="${esc(e.name)}" title="Переименовать">✎</button>
        <button type="button" class="mini-btn danger" data-dellib="${e.id}" title="Удалить">✕</button>
      </div>`).join('');

    $('#screen-library').innerHTML = `
      ${topbar('<h2 class="scr-title center">Справочник упражнений</h2>')}
      <div class="card lib-add">
        <input id="lib-new" type="text" maxlength="80" placeholder="Новое упражнение…" autocomplete="off">
        <button type="button" class="btn primary small" id="lib-add-btn">Добавить</button>
      </div>
      <div class="card"><input id="lib-search" type="search" placeholder="Поиск…" value="${esc(q || '')}" autocomplete="off"></div>
      <div class="lib-list">${items || '<p class="muted empty">Пусто. Добавьте упражнения — они пригодятся при вводе тренировок.</p>'}</div>
      <p class="muted small-note pad">Упражнения из тренировок остаются как были: переименование в справочнике не переписывает историю.</p>`;

    const add = async () => {
      const inp = $('#lib-new');
      const name = inp.value.trim();
      if (!name) return;
      const now = Date.now();
      await window.FlintDB.putExercise({ id: uuid(), name, createdAt: now, updatedAt: now });
      window.FlintSync.markDirty();
      renderLibrary('');
    };
    $('#lib-add-btn').addEventListener('click', add);
    $('#lib-new').addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
    const search = $('#lib-search');
    search.addEventListener('input', () => renderLibrary(search.value));
    $('#screen-library').querySelectorAll('[data-rename]').forEach((b) => {
      b.addEventListener('click', async () => {
        const name = prompt('Новое название:', b.dataset.cur);
        if (!name || !name.trim() || name.trim() === b.dataset.cur) return;
        const rec = await window.FlintDB.getExercise(b.dataset.rename);
        rec.name = name.trim();
        rec.updatedAt = Date.now();
        await window.FlintDB.putExercise(rec);
        window.FlintSync.markDirty();
        renderLibrary(q);
      });
    });
    $('#screen-library').querySelectorAll('[data-dellib]').forEach((b) => {
      b.addEventListener('click', async () => {
        if (!confirm('Удалить упражнение из справочника? В уже записанных тренировках оно останется.')) return;
        await window.FlintDB.removeExercise(b.dataset.dellib);
        window.FlintSync.markDirty();
        renderLibrary(q);
      });
    });
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
    if (h === '#/library') return renderLibrary('');
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
