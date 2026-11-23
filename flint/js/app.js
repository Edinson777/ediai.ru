/* Flint — каркас приложения (этап 5): темы, service worker, вход через
 * Яндекс ID, офлайн-баннер, экспорт/импорт, вкладки.
 * Экраны журнала — в js/journal.js, синхронизация — в js/app-sync.js,
 * хранилище — в js/db.js. */
(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);

  console.log('Flint: интерфейс v1.5.1');

  /* После деплоя новый service worker перехватывает управление — страница
     один раз перезагружается, чтобы HTML и JS гарантированно были одной
     версии (иначе возможна смесь: новый HTML без обработчиков старого JS). */
  if (navigator.serviceWorker) {
    let flintRefreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (flintRefreshing) return;
      flintRefreshing = true;
      location.reload();
    });
  }

  window.FlintUI = {
    toast(msg) {
      const t = document.createElement('div');
      t.className = 'toast';
      t.textContent = msg;
      document.body.appendChild(t);
      setTimeout(() => t.classList.add('show'), 20);
      setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 3500);
    },
  };

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

  /* ---------- офлайн-баннер ---------- */

  const offlineBanner = $('#offline-banner');
  function setOfflineUI(offline) {
    offlineBanner.classList.toggle('hidden', !offline);
  }
  window.addEventListener('online', () => setOfflineUI(false));
  window.addEventListener('offline', () => setOfflineUI(true));
  setOfflineUI(!navigator.onLine);

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

  if ('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('service-worker.js').catch((err) => {
        console.warn('SW не зарегистрирован:', err);
      });
    });
  }

  /* ---------- вкладки ---------- */

  document.querySelectorAll('.tabbar .tab').forEach((t) => {
    t.addEventListener('click', () => { location.hash = t.dataset.hash; });
  });

  /* ---------- авторизация (экран «Ещё») ---------- */

  const loginBtn = $('#login-btn');
  const logoutBtn = $('#logout-btn');
  const authStatus = $('#auth-status');

  function setAuthUI(auth, name) {
    loginBtn.classList.toggle('hidden', !!auth);
    logoutBtn.classList.toggle('hidden', !auth);
    authStatus.textContent = auth ? ('Вы вошли как ' + name) : 'Вход не выполнен — синхронизация отключена.';
    localStorage.setItem('flint-auth', JSON.stringify({ auth: !!auth, name: name || '' }));
  }

  async function refreshAuth() {
    // при офлайне показываем кэшированный статус: сервер недоступен, сессия не
    // меняется; таймаут 10 с — зависший сервер не держит «Проверяем вход…» вечно
    let state = { auth: false, name: '' };
    try { state = JSON.parse(localStorage.getItem('flint-auth') || 'null') || state; } catch (e) {}
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    try {
      const res = await fetch('oauth/api.php?action=me', { credentials: 'same-origin', signal: ctrl.signal });
      if (res.ok) {
        const j = await res.json();
        state = j.auth ? { auth: true, name: j.user.name } : { auth: false, name: '' };
      }
    } catch (e) { /* таймаут или нет сети — остаёмся с кэшем */ }
    clearTimeout(timer);
    setAuthUI(state.auth, state.name);
    return state;
  }

  loginBtn.addEventListener('click', () => { location.href = 'oauth/login.php'; });
  logoutBtn.addEventListener('click', async () => {
    try {
      await fetch('oauth/api.php?action=logout', { method: 'POST', credentials: 'same-origin' });
    } catch (e) { /* офлайн: выходим локально */ }
    setAuthUI(false, '');
    window.FlintSync.syncAfterAuth({ auth: false, name: '' });
  });

  /* ---------- экспорт / импорт (экран «Ещё») ---------- */

  function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  async function exportJSON() {
    const [w, e] = await Promise.all([
      window.FlintDB.getActive(), window.FlintDB.getActiveExercises(),
    ]);
    const payload = {
      app: 'flint', format: 3, exportedAt: new Date().toISOString(),
      workouts: w, exercises: e,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `flint-backup-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
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
    const norm = list.map((w) => window.FlintSync.toV3(w));
    const bad = norm.filter((w) => !window.FlintSync.isValidWorkout(w)).length;
    if (bad) { alert(`В файле ${bad} некорректных записей — импорт отменён.`); return; }
    const lib = data && Array.isArray(data.exercises) ? data.exercises : [];
    if (!confirm(`Заменить текущие данные на ${norm.length} тренировок${lib.length ? ' и ' + lib.length + ' упражнений справочника' : ''} из файла?`)) return;
    try {
      await Promise.all([
        window.FlintDB.replaceAll(norm),
        window.FlintDB.replaceAllExercises(lib.filter((e) => e && typeof e.id === 'string' && typeof e.name === 'string')),
      ]);
      window.FlintJournal.renderAll();
      window.FlintSync.markDirty();
      window.FlintUI.toast('Импорт выполнен');
    } catch (e) {
      alert('Ошибка импорта: ' + e.message);
    }
  }

  $('#export-btn').addEventListener('click', exportJSON);
  $('#import-btn').addEventListener('click', () => $('#import-file').click());
  $('#import-file').addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (f) importJSON(f);
    e.target.value = '';
  });

  /* ---------- запуск ---------- */

  window.FlintSync.init({
    section: $('#sync-section'),
    status: $('#sync-status'),
    pushBtn: $('#sync-push-btn'),
    pullBtn: $('#sync-pull-btn'),
  });

  /* Подсказка на случай зависания запуска. Показывается только пока журнал
     не отрисовался (нет активного экрана): если журнал открылся, а «зависла»
     лишь проверка входа, она завершится сама — таймаутом или ответом. */
  const authStatusEl = $('#auth-status');
  function bootHint(text) {
    if (document.querySelector('.screen.active')) return;
    const more = document.querySelector('#screen-more');
    if (more) more.classList.add('active');
    if (authStatusEl) authStatusEl.textContent = text;
  }

  window.addEventListener('flint-db-blocked', () => {
    bootHint('Обновление базы ждёт, пока закроется Flint в другой вкладке этого браузера '
      + '(или в установленном приложении). Закройте его там — загрузка продолжится сама.');
  });

  const readyPromise = window.FlintDB.ready();
  const hintTimer = setTimeout(() => {
    bootHint('База данных открывается дольше обычного. Если это продолжается — закройте Flint '
      + 'в других вкладках и на других устройствах, затем обновите эту страницу.');
  }, 4000);

  readyPromise.then(async () => {
    clearTimeout(hintTimer);
    window.FlintJournal.init();
    const s = await refreshAuth();
    const params = new URLSearchParams(location.search);
    window.FlintSync.syncAfterAuth(s);
    if (params.get('login') === '1') {
      history.replaceState(null, '', location.pathname);
      if (s.auth) window.FlintUI.toast('Вы вошли как ' + s.name);
    }
  }).catch((err) => {
    clearTimeout(hintTimer);
    bootHint('Не удалось открыть базу данных: ' + (err && err.message ? err.message : 'неизвестная ошибка')
      + '. Данные не потеряны — обновите страницу.');
    console.warn('Flint: ошибка запуска', err);
  });
})();
