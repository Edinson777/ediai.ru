/* Flint — синхронизация с Яндекс Диском (этап 7: тренировки, библиотека и
 * программы в одном файле формата 4).
 * Форматы файла на Диске:
 *   1 — этап 3: {workouts: [{id, date, exercises: [{name, weight, reps, sets}]}]}
 *   2 — этап 4: то же + метки удаления {deleted, deletedAt}
 *   3 — этап 5: {workouts: [...v3: exercises: [{id, name, sets: [{id, weight,
 *       reps, effort, comment}]]}], exercises: [библиотека]}
 *   4 — этап 7: то же + programs: [{id, name, workouts: [{id, name,
 *       exercises: [{name, exerciseId?, baseId?}]}]}]
 * Все форматы нормализуются при чтении (FlintDB.migrateWorkout); у файлов без
 * поля programs слияние программ просто не находит записей — ничего не теряется.
 * Слияние — LWW по штампу: у живой записи updatedAt, у удалённой deletedAt;
 * счётчики в текстах статуса — только по живым записям. Библиотека и программы
 * сливаются отдельно тем же правилом. */
window.FlintSync = (function () {
  'use strict';

  const AUTO_PUSH_DELAY = 15000; // пауза после изменения — отправляем устоявшийся вариант
  const PUSH_MAX = 5 * 1024 * 1024; // совпадает с лимитом сервера

  let syncBusy = false;
  let pushTimer = null;
  let authState = { auth: false, name: '' };
  let dirty = localStorage.getItem('flint-dirty') === '1';

  /* DOM-элементы (заполняются в init) */
  let ui = null;

  /* ==================== чистые функции слияния (покрыты тестами) ==================== */

  function toV3(w) {
    return window.FlintDB ? window.FlintDB.migrateWorkout(w) : w;
  }

  function isValidEffort(v) {
    return v === null || v === undefined || v === ''
      || v === 'warmup' || v === 'easy' || v === 'medium' || v === 'hard' || v === 'max';
  }

  /* Валидация уже нормализованной (v3) записи. */
  function isValidWorkout(w) {
    return w && typeof w.id === 'string' && typeof w.date === 'string'
      && /^\d{4}-\d{2}-\d{2}$/.test(w.date)
      && Array.isArray(w.exercises)
      && w.exercises.every((e) => e && typeof e.name === 'string'
        && Array.isArray(e.sets)
        && e.sets.every((s) => s && Number.isFinite(+s.weight)
          && Number.isFinite(+s.reps) && isValidEffort(s.effort)));
  }

  function isValidExercise(e) {
    return e && typeof e.id === 'string' && typeof e.name === 'string';
  }

  /* Программа: контейнер шаблонов тренировок. Ссылки на упражнения шаблона —
     {name, exerciseId?, baseId?}: name обязателен, остальное — необязательные
     связи (старые записи без них валидны). */
  function isValidProgram(p) {
    return p && typeof p.id === 'string' && typeof p.name === 'string'
      && Array.isArray(p.workouts)
      && p.workouts.every((t) => t && typeof t.id === 'string' && typeof t.name === 'string'
        && Array.isArray(t.exercises)
        && t.exercises.every((e) => e && typeof e.name === 'string'));
  }

  /* Штамп события: у удалённой записи — время удаления, у живой — правка. */
  function stampOf(w) {
    return w.deleted ? (+w.deletedAt || 0) : (+w.updatedAt || 0);
  }

  /* Слияние журналов: ключ — id тренировки. Побеждает более поздний штамп.
     Удаление распространяется меткой; правка после удаления воскрешает.
     added/updated считаются только по живым записям (для текстов статуса). */
  function mergeWorkouts(local, remote) {
    const map = new Map();
    for (const w of local) {
      const n = toV3(w);
      if (isValidWorkout(n)) map.set(n.id, n);
    }
    let added = 0;
    let updated = 0;
    for (const r of remote) {
      const n = toV3(r);
      if (!isValidWorkout(n)) continue;
      const l = map.get(n.id);
      if (!l) {
        map.set(n.id, n);
        if (!n.deleted) added++;
      } else if (stampOf(n) > stampOf(l)) {
        map.set(n.id, n);
        if (!n.deleted) updated++;
      }
    }
    return { list: Array.from(map.values()), added, updated };
  }

  /* Слияние библиотеки упражнений: тот же LWW, ключ — id. */
  function mergeExercises(local, remote) {
    const map = new Map();
    for (const e of local) {
      if (isValidExercise(e)) map.set(e.id, e);
    }
    let added = 0;
    let updated = 0;
    for (const r of remote) {
      if (!isValidExercise(r)) continue;
      const l = map.get(r.id);
      if (!l) {
        map.set(r.id, r);
        if (!r.deleted) added++;
      } else if (stampOf(r) > stampOf(l)) {
        map.set(r.id, r);
        if (!r.deleted) updated++;
      }
    }
    return { list: Array.from(map.values()), added, updated };
  }

  /* Слияние программ: тот же LWW, ключ — id (этап 7). */
  function mergePrograms(local, remote) {
    const map = new Map();
    for (const p of local) {
      if (isValidProgram(p)) map.set(p.id, p);
    }
    let added = 0;
    let updated = 0;
    for (const r of remote) {
      if (!isValidProgram(r)) continue;
      const l = map.get(r.id);
      if (!l) {
        map.set(r.id, r);
        if (!r.deleted) added++;
      } else if (stampOf(r) > stampOf(l)) {
        map.set(r.id, r);
        if (!r.deleted) updated++;
      }
    }
    return { list: Array.from(map.values()), added, updated };
  }

  /* ==================== сетевые операции ==================== */

  function setSyncStatus(text) {
    if (ui && ui.status) ui.status.textContent = text;
  }

  async function syncApi(action, opts) {
    // таймаут 20 с: зависший запрос не должен блокировать кнопки навсегда
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    try {
      const res = await fetch('oauth/api.php?action=' + action, Object.assign({
        credentials: 'same-origin',
        signal: ctrl.signal,
      }, opts || {}));
      const j = await res.json().catch(() => ({}));
      return { res, j };
    } finally {
      clearTimeout(timer);
    }
  }

  function syncErrText(e) {
    return e && e.name === 'AbortError'
      ? 'Сервер не отвечает слишком долго — попробуйте ещё раз'
      : 'Нет сети — операция не прошла';
  }

  /* Понятные тексты ошибок Диска: 403 — приложение получило токен без права
     cloud_api:disk.app_folder; токен не «обновляется», нужен перелогин. */
  function diskErrText(j, res) {
    if (res && res.status === 403) {
      return 'Диск отклонил доступ к папке приложения: в oauth.yandex.ru включите право '
        + '«Доступ к папке приложения на Диске» (cloud_api:disk.app_folder), затем '
        + 'выйдите и войдите заново, не снимая галочку на экране согласия.';
    }
    return (j && j.detail) || ('HTTP ' + (res ? res.status : '?'));
  }

  async function refreshSyncStatus() {
    if (!authState.auth || !ui) return;
    if (!navigator.onLine) {
      setSyncStatus('Нет сети — синхронизация отложена до восстановления связи.');
      return;
    }
    setSyncStatus('Смотрим на Яндекс Диск…');
    try {
      const { res, j } = await syncApi('syncinfo');
      if (res.status === 401) {
        setSyncStatus('Сессия истекла — войдите заново.');
        return;
      }
      if (!res.ok || !j.ok) {
        setSyncStatus('Диск не отвечает: ' + diskErrText(j, res));
        return;
      }
      setSyncStatus(j.exists
        ? `Копия на Диске: от ${fmtWhen(j.modifiedAt)}, ${fmtSize(j.size)}.`
        : 'На Диске пока нет копии — «Отправить на Диск» создаст её.');
    } catch (e) {
      setSyncStatus('Нет сети — состояние Диска неизвестно.');
    }
  }

  function fmtWhen(iso) {
    const d = new Date(iso);
    return isNaN(d.getTime())
      ? '—'
      : d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function fmtSize(n) {
    n = +n || 0;
    return n < 1024 ? n + ' Б'
      : n < 1048576 ? (n / 1024).toFixed(1) + ' КБ'
        : (n / 1048576).toFixed(1) + ' МБ';
  }

  function markDirty() {
    dirty = true;
    localStorage.setItem('flint-dirty', '1');
    scheduleAutoPush();
  }

  function clearDirty() {
    dirty = false;
    localStorage.removeItem('flint-dirty');
  }

  /* Автоотправка: после каждого изменения ждём 15 секунд — уйдёт итоговая
     версия. Офлайн: таймер не ставим, правки дождутся сети. */
  function scheduleAutoPush() {
    clearTimeout(pushTimer);
    if (authState.auth && navigator.onLine) {
      pushTimer = setTimeout(() => pushNow(false), AUTO_PUSH_DELAY);
    }
  }

  /* Отправка = слияние: сначала читаем копию с Диска, объединяем журналы и
     библиотеку, отправляем объединённую версию. Ошибка чтения копии (кроме
     «копии нет») отменяет отправку — чужие правки не затираем. */
  async function pushNow(manual) {
    if (syncBusy) {
      setSyncStatus('Предыдущая операция ещё идёт — секундочку.');
      return;
    }
    if (!authState.auth) {
      setSyncStatus('Синхронизация доступна после входа.');
      return;
    }
    syncBusy = true;
    if (ui && ui.pushBtn) ui.pushBtn.disabled = true;
    setSyncStatus(manual ? 'Отправляем на Диск…' : 'Отправляем изменения на Диск…');
    try {
      const [localW, localE, localP] = await Promise.all([
        window.FlintDB.getAll(), window.FlintDB.getAllExercises(), window.FlintDB.getAllPrograms(),
      ]);
      let mergedW = localW;
      let mergedE = localE;
      let mergedP = localP;
      let mergeNote = '';
      const pr = await syncApi('pull');
      if (pr.res.status === 401) {
        setSyncStatus('Сессия истекла — войдите заново и повторите.');
        return;
      }
      if (pr.res.ok && pr.j.ok) {
        if (pr.j.exists && pr.j.data) {
          const mw = mergeWorkouts(localW, (pr.j.data.workouts || []));
          const me = mergeExercises(localE, (pr.j.data.exercises || []));
          const mp = mergePrograms(localP, (pr.j.data.programs || []));
          if (mw.added || mw.updated || me.added || me.updated || mp.added || mp.updated) {
            await Promise.all([
              window.FlintDB.replaceAll(mw.list),
              window.FlintDB.replaceAllExercises(me.list),
              window.FlintDB.replaceAllPrograms(mp.list),
            ]);
            if (window.FlintJournal) window.FlintJournal.renderAll();
            mergeNote = `; объединено: +${mw.added} тренировок, ${mw.updated} обновлено`
              + (me.added || me.updated ? `, упражнений ${me.added}/${me.updated}` : '')
              + (mp.added || mp.updated ? `, программ ${mp.added}/${mp.updated}` : '');
          }
          mergedW = mw.list;
          mergedE = me.list;
          mergedP = mp.list;
        }
      } else {
        setSyncStatus('Не получилось объединить с Диском: ' + diskErrText(pr.j, pr.res) + ' — отправка отложена.');
        if (manual && window.FlintUI) window.FlintUI.toast('Ошибка Диска');
        return;
      }

      const body = JSON.stringify({
        app: 'flint',
        format: 4,
        exportedAt: new Date().toISOString(),
        workouts: mergedW,
        exercises: mergedE,
        programs: mergedP,
      });
      if (body.length > PUSH_MAX) {
        setSyncStatus('Журнал крупнее 5 МБ — сервер не примет. Экспортируйте файл и почистите записи.');
        return;
      }
      const { res, j } = await syncApi('push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      if (res.ok && j.ok) {
        clearDirty();
        setSyncStatus(`Отправлено: тренировок ${mergedW.filter((w) => !w.deleted).length}${mergeNote}, ${fmtSize(j.size)} — ${new Date().toLocaleTimeString('ru-RU')}.`);
        if (manual && window.FlintUI) window.FlintUI.toast('Копия отправлена на Диск');
      } else if (res.status === 401) {
        setSyncStatus('Сессия истекла — войдите заново и повторите.');
      } else {
        setSyncStatus('Не получилось отправить: ' + diskErrText(j, res));
        if (manual && window.FlintUI) window.FlintUI.toast('Ошибка Диска');
      }
    } catch (e) {
      setSyncStatus(syncErrText(e) + (navigator.onLine
        ? ' — попробуйте ещё раз.'
        : '; записи сохранены на устройстве, отправим при появлении сети.'));
      scheduleAutoPush();
    } finally {
      syncBusy = false;
      if (ui && ui.pushBtn) ui.pushBtn.disabled = false;
    }
  }

  async function pullNow(manual) {
    if (syncBusy) {
      setSyncStatus('Предыдущая операция ещё идёт — секундочку.');
      return;
    }
    if (!authState.auth) {
      setSyncStatus('Синхронизация доступна после входа.');
      return;
    }
    syncBusy = true;
    if (ui && ui.pullBtn) ui.pullBtn.disabled = true;
    setSyncStatus('Загружаем с Диска…');
    try {
      const { res, j } = await syncApi('pull');
      if (res.status === 401) {
        setSyncStatus('Сессия истекла — войдите заново.');
        return;
      }
      if (!res.ok || !j.ok) {
        setSyncStatus('Не получилось загрузить: ' + diskErrText(j, res));
        if (manual && window.FlintUI) window.FlintUI.toast('Ошибка Диска');
        return;
      }
      if (!j.exists) {
        setSyncStatus('На Диске пока нет копии — сначала «Отправить на Диск».');
        if (manual && window.FlintUI) window.FlintUI.toast('На Диске нет копии');
        return;
      }
      const [localW, localE, localP] = await Promise.all([
        window.FlintDB.getAll(), window.FlintDB.getAllExercises(), window.FlintDB.getAllPrograms(),
      ]);
      const mw = mergeWorkouts(localW, (j.data && j.data.workouts) || []);
      const me = mergeExercises(localE, (j.data && j.data.exercises) || []);
      const mp = mergePrograms(localP, (j.data && j.data.programs) || []);
      if (!mw.added && !mw.updated && !me.added && !me.updated && !mp.added && !mp.updated) {
        setSyncStatus('Всё актуально: на Диске нет записей новее локальных.');
        if (manual && window.FlintUI) window.FlintUI.toast('Данные уже актуальны');
        return;
      }
      await Promise.all([
        window.FlintDB.replaceAll(mw.list),
        window.FlintDB.replaceAllExercises(me.list),
        window.FlintDB.replaceAllPrograms(mp.list),
      ]);
      if (window.FlintJournal) window.FlintJournal.renderAll();
      setSyncStatus(`Загружено с Диска: тренировок +${mw.added}, обновлено ${mw.updated}`
        + (me.added || me.updated ? `; упражнений +${me.added}, обновлено ${me.updated}` : '')
        + (mp.added || mp.updated ? `; программ +${mp.added}, обновлено ${mp.updated}` : '') + '.');
      if (manual && window.FlintUI) window.FlintUI.toast(`Загружено: +${mw.added}, обновлено ${mw.updated}`);
      markDirty(); // объединённая версия отличается от копии — уводим её на Диск
    } catch (e) {
      setSyncStatus(syncErrText(e) + '.');
    } finally {
      syncBusy = false;
      if (ui && ui.pullBtn) ui.pullBtn.disabled = false;
    }
  }

  /* После входа/выхода. Пустой журнал → тянем копию; остались невыданные
     правки (офлайн, закрытие приложения) → объединить и отправить; иначе
     показываем состояние копии. */
  function syncAfterAuth(state) {
    authState = state;
    if (ui && ui.section) ui.section.classList.toggle('hidden', !state.auth);
    clearTimeout(pushTimer);
    if (!state.auth) {
      setSyncStatus('—');
      return;
    }
    Promise.all([window.FlintDB.getAll(), window.FlintDB.getAllExercises(), window.FlintDB.getAllPrograms()]).then(([w, e, p]) => {
      if (!w.length && !e.length && !p.length) {
        pullNow(false);
      } else if (dirty) {
        pushNow(false);
      } else {
        refreshSyncStatus();
      }
    });
  }

  /* Отправка при закрытии страницы (keepalive, без слияния — копия сойдётся
     при следующей объединённой отправке). */
  function pagehidePush() {
    if (!pushTimer || !authState.auth || !navigator.onLine || syncBusy) return;
    clearTimeout(pushTimer);
    pushTimer = null;
    Promise.all([window.FlintDB.getAll(), window.FlintDB.getAllExercises(), window.FlintDB.getAllPrograms()]).then(([w, e, p]) => {
      const body = JSON.stringify({
        app: 'flint',
        format: 4,
        exportedAt: new Date().toISOString(),
        workouts: w,
        exercises: e,
        programs: p,
      });
      if (body.length > 60000) return;
      fetch('oauth/api.php?action=push', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {});
    });
  }

  function init(elements) {
    ui = elements;
    if (ui.pushBtn) ui.pushBtn.addEventListener('click', () => pushNow(true));
    if (ui.pullBtn) ui.pullBtn.addEventListener('click', () => pullNow(true));
    window.addEventListener('online', () => {
      if (!authState.auth) return;
      refreshSyncStatus();
      if (dirty) pushNow(false);
    });
    window.addEventListener('offline', () => {
      clearTimeout(pushTimer);
      if (authState.auth) {
        setSyncStatus('Нет сети — записи сохраняются на устройстве; отправим на Диск при подключении.');
      }
    });
    window.addEventListener('pagehide', pagehidePush);
  }

  return {
    mergeWorkouts,
    mergeExercises,
    mergePrograms,
    isValidWorkout,
    isValidExercise,
    toV3,
    stampOf,
    pushNow,
    pullNow,
    refreshSyncStatus,
    markDirty,
    clearDirty,
    scheduleAutoPush,
    syncAfterAuth,
    init,
    isDirty: () => dirty,
  };
})();
