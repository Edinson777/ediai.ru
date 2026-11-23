/* Flint — слой данных (IndexedDB). Этап 1: локальное хранение без синхронизации.
 * Хранилище «workouts», ключ — id (строка). Сортировка выдачи: дата по убыванию,
 * при равных датах — более поздняя по времени создания. */
(function () {
  'use strict';

  const DB_NAME = 'flint';
  const DB_VERSION = 1;
  const STORE = 'workouts';

  let dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const st = db.createObjectStore(STORE, { keyPath: 'id' });
          st.createIndex('date', 'date', { unique: false });
        }
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

  function sortDesc(list) {
    return list.sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
  }

  async function getAll() {
    const db = await openDB();
    const all = await reqToPromise(db.transaction(STORE).objectStore(STORE).getAll());
    return sortDesc(all);
  }

  async function get(id) {
    const db = await openDB();
    return reqToPromise(db.transaction(STORE).objectStore(STORE).get(id));
  }

  async function put(workout) {
    const db = await openDB();
    return reqToPromise(db.transaction(STORE, 'readwrite').objectStore(STORE).put(workout));
  }

  async function remove(id) {
    const db = await openDB();
    return reqToPromise(db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id));
  }

  async function replaceAll(list) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE, 'readwrite');
      const st = t.objectStore(STORE);
      st.clear();
      list.forEach((w) => st.put(w));
      t.oncomplete = () => resolve(true);
      t.onerror = () => reject(t.error || new Error('Не удалось записать данные'));
    });
  }

  window.FlintDB = { getAll, get, put, remove, replaceAll };
})();
