/* Flint — слой данных (IndexedDB). Этап 7: подходы, библиотека, программы.
 * Хранилища:
 *  - «workouts»: тренировки. Упражнение внутри тренировки — запись с массивом
 *    подходов sets: [{id, weight, reps, effort, comment}]; effort —
 *    'warmup'|'easy'|'medium'|'hard'|'max'|null. Удаление тренировки — метка
 *    (deleted/deletedAt), как в этапе 4.
 *  - «exercises»: библиотека упражнений {id, name, createdAt, updatedAt,
 *    deleted?, deletedAt?} — тоже с метками удаления (разъезжаются по Диску).
 *  - «programs» (этап 7): программы {id, name, v:1, workouts: [{id, name,
 *    exercises: [{exerciseId?, baseId?, name}]}], createdAt, updatedAt,
 *    deleted?, deletedAt?} — шаблоны тренировок; при старте из программы
 *    упражнения копируются в живую тренировку, сама программа не меняется.
 * Миграция этапов 1–4 (упражнение = {name, weight, reps, sets}) выполняется
 * один раз при открытии базы: старое упражнение становится записью с одним
 * подходом. id при миграции вычисляются ДЕТЕРМИНИРОВАННО (хэш содержимого),
 * чтобы два устройства, мигрировавшие независимо, получили одинаковые id и
 * слияние не создало дублей.
 * getAll/getActive работают с любым хранилищем (параметр store). */
(function () {
  'use strict';

  const DB_NAME = 'flint';
  const DB_VERSION = 3;
  const WORKOUTS = 'workouts';
  const EXERCISES = 'exercises';
  const PROGRAMS = 'programs';

  let dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(WORKOUTS)) {
          const st = db.createObjectStore(WORKOUTS, { keyPath: 'id' });
          st.createIndex('date', 'date', { unique: false });
        }
        if (!db.objectStoreNames.contains(EXERCISES)) {
          db.createObjectStore(EXERCISES, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(PROGRAMS)) {
          db.createObjectStore(PROGRAMS, { keyPath: 'id' });
        }
      };
      // Другая вкладка этого браузера держит базу старой версии — обновление
      // ждёт её закрытия. Без обработчика страница висела бы молча: сообщаем
      // интерфейсу (см. boot в app.js), а когда вкладку закроют, запрос всё
      // равно завершится сам и загрузка продолжится.
      req.onblocked = () => {
        try { window.dispatchEvent(new CustomEvent('flint-db-blocked')); } catch (e) {}
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IndexedDB недоступна'));
    });
    return dbPromise;
  }

  function reqToPromise(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('Ошибка обращения к базе'));
    });
  }

  /* Детерминированный id миграции: FNV-1a по строке-паспорту записи. */
  function stableHash(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return 'm' + h.toString(16) + ('00000000' + str.length.toString(16)).slice(-4);
  }

  /* ---- миграция формата этапов 1–4 в формат этапа 5 ---- */

  function migrateWorkout(w) {
    if (!w || w.v === 3 || !Array.isArray(w.exercises)) return w;
    const exList = w.exercises.map((e, ei) => {
      const passport = [w.id, ei, e.name || '', e.weight, e.reps, e.sets].join('|');
      // старый формат: одно упражнение = один подход (weight×reps, повторённый sets раз)
      const setList = [];
      const n = Math.max(1, Math.min(50, +e.sets || 1));
      for (let si = 0; si < n; si++) {
        setList.push({
          id: stableHash(passport + '#' + si),
          weight: +e.weight || 0,
          reps: +e.reps || 0,
          effort: null,
          comment: '',
        });
      }
      return {
        id: stableHash(passport),
        exerciseId: null, // старые записи не привязаны к библиотеке
        name: e.name || '',
        sets: setList,
      };
    });
    return Object.assign({}, w, { v: 3, exercises: exList });
  }

  /* Миграция выполняется ОДНОЙ транзакцией и без единого await внутри:
     некоторые браузеры (Safari) автокоммитят транзакцию при возврате в цикл
     событий между await, и запись после ожидания падает. Все put — синхронно
     в колбэке getAll; сбой одной записи (put в try/catch) не валит загрузку —
     миграция идемпотентна и доделается при следующем запуске. */
  function migrateAll(db) {
    return new Promise((resolve, reject) => {
      let migrated = 0;
      let broken = 0;
      const t = db.transaction(WORKOUTS, 'readwrite');
      const st = t.objectStore(WORKOUTS);
      const g = st.getAll();
      g.onsuccess = () => {
        for (const w of g.result) {
          const nw = migrateWorkout(w);
          if (nw !== w && nw && typeof nw.id === 'string') {
            try {
              st.put(nw);
              migrated++;
            } catch (e) {
              broken++;
            }
          }
        }
      };
      t.oncomplete = () => {
        if (migrated) console.log('Flint: миграция журнала в v3 — записей: ' + migrated + (broken ? ', пропущено: ' + broken : ''));
        resolve(broken);
      };
      t.onerror = () => reject(t.error || new Error('Ошибка миграции данных'));
      t.onabort = () => reject(t.error || new Error('Миграция данных прервана'));
    });
  }

  /* ---- чтение/запись ---- */

  function sortDesc(list) {
    return list.sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
  }

  async function getAll(store) {
    const db = await openDB();
    if (store === EXERCISES || store === PROGRAMS) {
      return reqToPromise(db.transaction(store).objectStore(store).getAll());
    }
    const all = await reqToPromise(db.transaction(WORKOUTS).objectStore(WORKOUTS).getAll());
    return sortDesc(all);
  }

  async function getActive(store) {
    const all = await getAll(store);
    return store === EXERCISES || store === PROGRAMS
      ? all.filter((x) => !x.deleted).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ru'))
      : sortDesc(all.filter((w) => !w.deleted));
  }

  async function get(store, id) {
    const db = await openDB();
    return reqToPromise(db.transaction(store).objectStore(store).get(id));
  }

  async function put(store, record) {
    const db = await openDB();
    return reqToPromise(db.transaction(store, 'readwrite').objectStore(store).put(record));
  }

  /* Удаление = метка (tombstone). Тренировка помечается целиком; упражнение
     внутри тренировки удаляется правкой самой тренировки (v3-запись уходит
     на Диск целиком), отдельная метка ему не нужна. */
  async function remove(store, id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction(store, 'readwrite');
      const st = t.objectStore(store);
      const req = st.get(id);
      req.onsuccess = () => {
        const rec = req.result
          || (store === EXERCISES
            ? { id, name: '', createdAt: 0, updatedAt: 0 }
            : store === PROGRAMS
              ? { id, name: '', workouts: [], createdAt: 0, updatedAt: 0 }
              : { id, date: '1970-01-01', title: '', exercises: [], createdAt: 0, updatedAt: 0 });
        st.put(Object.assign({}, rec, { deleted: true, deletedAt: Date.now() }));
      };
      t.oncomplete = () => resolve(true);
      t.onerror = () => reject(t.error || new Error('Не удалось пометить удаление'));
    });
  }

  async function replaceAll(store, list) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction(store, 'readwrite');
      const st = t.objectStore(store);
      st.clear();
      list.forEach((r) => st.put(r));
      t.oncomplete = () => resolve(true);
      t.onerror = () => reject(t.error || new Error('Не удалось записать данные'));
    });
  }

  /* Открытие базы с гарантированной миграцией (один раз на открытие страницы). */
  async function ready() {
    const db = await openDB();
    if (!ready.done) {
      await migrateAll(db);
      ready.done = true;
    }
    return db;
  }

  window.FlintDB = {
    ready,
    WORKOUTS,
    EXERCISES,
    PROGRAMS,
    getAll: () => getAll(WORKOUTS),
    getActive: () => getActive(WORKOUTS),
    getAllExercises: () => getAll(EXERCISES),
    getActiveExercises: () => getActive(EXERCISES),
    getAllPrograms: () => getAll(PROGRAMS),
    getActivePrograms: () => getActive(PROGRAMS),
    get: (id) => get(WORKOUTS, id),
    getExercise: (id) => get(EXERCISES, id),
    getProgram: (id) => get(PROGRAMS, id),
    put: (w) => put(WORKOUTS, w),
    putExercise: (e) => put(EXERCISES, e),
    putProgram: (p) => put(PROGRAMS, p),
    remove: (id) => remove(WORKOUTS, id),
    removeExercise: (id) => remove(EXERCISES, id),
    removeProgram: (id) => remove(PROGRAMS, id),
    replaceAll: (list) => replaceAll(WORKOUTS, list),
    replaceAllExercises: (list) => replaceAll(EXERCISES, list),
    replaceAllPrograms: (list) => replaceAll(PROGRAMS, list),
    stableHash,
    migrateWorkout,
  };
})();
