/* Flint — логика журнала (этап 1, офлайн).
 * Ввод/редактирование/удаление тренировок, экспорт и импорт JSON,
 * темы, установка PWA. Данные — только на устройстве (FlintDB, IndexedDB). */
(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);

  const form = $('#workout-form');
  const exList = $('#ex-list');
  const formTitle = $('#form-title');
  const saveBtn = $('#save-btn');
  const cancelEdit = $('#cancel-edit');
  const formError = $('#form-error');
  const workoutList = $('#workout-list');
  const emptyMsg = $('#empty');
  const stat = $('#stat');

  let editingId = null;

  /* ---------- вспомогательные ---------- */

  function uuid() {
    return (window.crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
  function fmtDate(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    if (!y || !m || !d) return iso;
    const wd = WD[new Date(y, m - 1, d).getDay()];
    return `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y} (${wd})`;
  }

  function num(v, fallback) {
    const n = parseFloat(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : fallback;
  }

  function showMsg(text) {
    formError.textContent = text;
    formError.classList.remove('hidden');
  }
  function hideMsg() {
    formError.classList.add('hidden');
  }

  /* ---------- строки упражнений ---------- */

  function addExRow(data) {
    const d = data || {};
    const row = document.createElement('div');
    row.className = 'ex-row';

    const name = document.createElement('input');
    name.type = 'text';
    name.className = 'ex-name';
    name.placeholder = 'Упражнение';
    name.maxLength = 80;
    name.value = d.name || '';

    const weight = document.createElement('input');
    weight.type = 'number';
    weight.className = 'ex-weight';
    weight.placeholder = 'кг';
    weight.min = '0';
    weight.step = '0.5';
    weight.inputMode = 'decimal';
    weight.title = 'Вес, кг';
    weight.value = (d.weight !== undefined && d.weight !== null) ? d.weight : '';

    const reps = document.createElement('input');
    reps.type = 'number';
    reps.className = 'ex-reps';
    reps.placeholder = 'повт';
    reps.min = '1';
    reps.step = '1';
    reps.inputMode = 'numeric';
    reps.title = 'Повторы в подходе';
    reps.value = (d.reps !== undefined && d.reps !== null) ? d.reps : '';

    const sets = document.createElement('input');
    sets.type = 'number';
    sets.className = 'ex-sets';
    sets.placeholder = 'подх';
    sets.min = '1';
    sets.step = '1';
    sets.inputMode = 'numeric';
    sets.title = 'Число подходов';
    sets.value = (d.sets !== undefined && d.sets !== null) ? d.sets : '';

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'btn danger-mini';
    del.textContent = '✕';
    del.title = 'Убрать упражнение';
    del.setAttribute('aria-label', 'Убрать упражнение');

    row.append(name, weight, reps, sets, del);
    exList.appendChild(row);
    if (!data) name.focus();
  }

  function collectExercises() {
    const out = [];
    exList.querySelectorAll('.ex-row').forEach((row) => {
      const name = row.querySelector('.ex-name').value.trim();
      const weight = num(row.querySelector('.ex-weight').value, 0);
      const reps = num(row.querySelector('.ex-reps').value, 0);
      const sets = num(row.querySelector('.ex-sets').value, 0);
      const isEmpty = !name && !row.querySelector('.ex-weight').value
        && !row.querySelector('.ex-reps').value && !row.querySelector('.ex-sets').value;
      if (isEmpty) return; // полностью пустые строки игнорируем
      out.push({ name, weight, reps, sets });
    });
    return out;
  }

  function validExercises(list) {
    if (!list.length) return 'Добавьте хотя бы одно упражнение.';
    for (const e of list) {
      if (!e.name) return 'У каждого упражнения должно быть название.';
      if (e.weight < 0) return 'Вес не может быть отрицательным.';
      if (e.reps < 1) return 'Укажите повторы (не меньше 1).';
      if (e.sets < 1) return 'Укажите число подходов (не меньше 1).';
    }
    return null;
  }

  /* ---------- сохранение / редактирование / удаление ---------- */

  function resetForm() {
    editingId = null;
    form.reset();
    $('#f-date').value = todayISO();
    exList.innerHTML = '';
    addExRow();
    formTitle.textContent = 'Новая тренировка';
    saveBtn.textContent = 'Сохранить';
    cancelEdit.classList.add('hidden');
    hideMsg();
  }

  async function onSave(e) {
    e.preventDefault();
    hideMsg();

    const date = $('#f-date').value;
    if (!date) { showMsg('Укажите дату тренировки.'); return; }

    const exercises = collectExercises();
    const err = validExercises(exercises);
    if (err) { showMsg(err); return; }

    const now = Date.now();
    const prev = editingId ? await FlintDB.get(editingId) : null;
    const workout = {
      id: editingId || uuid(),
      date,
      title: $('#f-title').value.trim(),
      exercises,
      createdAt: prev ? prev.createdAt : now,
      updatedAt: now
    };

    try {
      await FlintDB.put(workout);
      await renderList();
      resetForm();
      $('#form-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (ex) {
      showMsg('Не удалось сохранить: ' + ex.message);
    }
  }

  async function startEdit(id) {
    const w = await FlintDB.get(id);
    if (!w) return;
    resetForm();
    editingId = id;
    $('#f-date').value = w.date;
    $('#f-title').value = w.title || '';
    exList.innerHTML = '';
    w.exercises.forEach((ex) => addExRow(ex));
    if (!w.exercises.length) addExRow();
    formTitle.textContent = 'Редактирование тренировки';
    saveBtn.textContent = 'Сохранить изменения';
    cancelEdit.classList.remove('hidden');
    $('#form-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function removeWorkout(id) {
    if (!confirm('Удалить эту тренировку? Действие нельзя отменить.')) return;
    await FlintDB.remove(id);
    await renderList();
  }

  /* ---------- список ---------- */

  function workoutVolume(w) {
    return w.exercises.reduce((s, e) => s + e.weight * e.reps * e.sets, 0);
  }

  function fmtVol(v) {
    if (!v) return '';
    return v >= 10000 ? (v / 1000).toFixed(1) + ' т' : Math.round(v) + ' кг';
  }

  function fmtWeight(w) {
    return Number.isInteger(w) ? String(w) : String(w).replace('.', ',');
  }

  async function renderList() {
    const all = await FlintDB.getAll();
    workoutList.innerHTML = '';
    emptyMsg.classList.toggle('hidden', all.length > 0);
    stat.textContent = all.length ? `тренировок: ${all.length}` : '';

    all.forEach((w) => {
      const card = document.createElement('article');
      card.className = 'workout';

      const head = document.createElement('div');
      head.className = 'w-head';
      const dateEl = document.createElement('span');
      dateEl.className = 'w-date';
      dateEl.textContent = fmtDate(w.date);
      const titleEl = document.createElement('span');
      titleEl.className = 'w-title';
      titleEl.textContent = w.title || '';
      head.append(dateEl, titleEl);
      card.appendChild(head);

      const vol = document.createElement('p');
      vol.className = 'w-vol';
      vol.textContent = 'объём: ' + fmtVol(workoutVolume(w));
      card.appendChild(vol);

      w.exercises.forEach((e) => {
        const line = document.createElement('div');
        line.className = 'ex-line';
        const nameEl = document.createElement('span');
        nameEl.className = 'ex-name';
        nameEl.textContent = e.name;
        const numsEl = document.createElement('span');
        numsEl.className = 'ex-nums';
        numsEl.textContent = `${fmtWeight(e.weight)} кг × ${e.reps} × ${e.sets}`;
        line.append(nameEl, numsEl);
        card.appendChild(line);
      });

      const actions = document.createElement('div');
      actions.className = 'w-actions';
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'btn ghost small';
      editBtn.textContent = 'Изменить';
      editBtn.addEventListener('click', () => startEdit(w.id));
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'btn danger-mini';
      delBtn.textContent = 'Удалить';
      delBtn.addEventListener('click', () => removeWorkout(w.id));
      actions.append(editBtn, delBtn);
      card.appendChild(actions);

      workoutList.appendChild(card);
    });
  }

  /* ---------- экспорт / импорт ---------- */

  async function exportJSON() {
    const all = await FlintDB.getAll();
    const payload = { app: 'flint', format: 1, exportedAt: new Date().toISOString(), workouts: all };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `flint-backup-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function isValidWorkout(w) {
    return w && typeof w.id === 'string' && typeof w.date === 'string'
      && /^\d{4}-\d{2}-\d{2}$/.test(w.date)
      && Array.isArray(w.exercises)
      && w.exercises.every((e) => typeof e.name === 'string' && Number.isFinite(+e.weight)
        && Number.isFinite(+e.reps) && Number.isFinite(+e.sets));
  }

  async function importJSON(file) {
    let data;
    try {
      data = JSON.parse(await file.text());
    } catch (e) {
      alert('Файл не похож на JSON: ' + e.message);
      return;
    }
    const list = Array.isArray(data) ? data : (data && Array.isArray(data.workouts) ? data.workouts : null);
    if (!list) { alert('В файле нет массива тренировок.'); return; }
    const bad = list.filter((w) => !isValidWorkout(w)).length;
    if (bad) { alert(`В файле ${bad} некорректных записей — импорт отменён.`); return; }
    if (!confirm(`Заменить текущие данные на ${list.length} записей из файла?`)) return;
    try {
      await FlintDB.replaceAll(list);
      await renderList();
      resetForm();
    } catch (e) {
      alert('Ошибка импорта: ' + e.message);
    }
  }

  /* ---------- тема ---------- */

  const themeBtn = $('#theme-btn');
  function applyThemeIcon() {
    const t = document.documentElement.dataset.theme;
    themeBtn.textContent = t === 'dark' ? '☀️' : (t === 'light' ? '🌙' : '🌓');
  }
  themeBtn.addEventListener('click', () => {
    const t = document.documentElement.dataset.theme;
    const next = !t ? 'dark' : (t === 'dark' ? 'light' : '');
    if (next) {
      document.documentElement.dataset.theme = next;
      localStorage.setItem('flint-theme', next);
    } else {
      delete document.documentElement.dataset.theme;
      localStorage.removeItem('flint-theme');
    }
    applyThemeIcon();
  });
  (function initTheme() {
    const saved = localStorage.getItem('flint-theme');
    if (saved === 'dark' || saved === 'light') document.documentElement.dataset.theme = saved;
    applyThemeIcon();
  })();

  /* ---------- установка PWA ---------- */

  let deferredInstall = null;
  const installBtn = $('#install-btn');
  const iosHint = $('#ios-hint');

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstall = e;
    installBtn.classList.remove('hidden');
  });
  installBtn.addEventListener('click', async () => {
    if (!deferredInstall) return;
    deferredInstall.prompt();
    const choice = await deferredInstall.userChoice;
    if (choice.outcome === 'accepted') installBtn.classList.add('hidden');
    deferredInstall = null;
  });
  window.addEventListener('appinstalled', () => installBtn.classList.add('hidden'));
  (function detectIOS() {
    const ua = navigator.userAgent;
    const isIOS = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (isIOS && !window.navigator.standalone) iosHint.classList.remove('hidden');
  })();

  /* ---------- service worker ---------- */

  /* Service worker: localhost/127.0.0.1 и https — secure context, SW доступен.
   * На хостинге сайт работает по https://ediai.ru/flint/ — регистрация пройдёт. */
  if ('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('service-worker.js').catch((err) => {
        console.warn('SW не зарегистрирован:', err);
      });
    });
  }

  /* ---------- запуск ---------- */

  form.addEventListener('submit', onSave);
  cancelEdit.addEventListener('click', () => { resetForm(); });
  $('#add-ex').addEventListener('click', () => addExRow());
  exList.addEventListener('click', (e) => {
    const btn = e.target.closest('button.danger-mini');
    if (btn) {
      const rows = exList.querySelectorAll('.ex-row');
      if (rows.length > 1) btn.closest('.ex-row').remove();
      else { // последнюю строку не удаляем — очищаем
        btn.closest('.ex-row').querySelectorAll('input').forEach((i) => { i.value = ''; });
      }
    }
  });
  $('#export-btn').addEventListener('click', exportJSON);
  $('#import-btn').addEventListener('click', () => $('#import-file').click());
  $('#import-file').addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (f) importJSON(f);
    e.target.value = '';
  });

  resetForm();
  renderList();
})();
