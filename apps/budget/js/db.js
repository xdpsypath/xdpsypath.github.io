/* Хранилище «Копилки».
   Основной вариант: IndexedDB (две таблицы: tx для записей и kv для настроек).
   Если IndexedDB недоступна (приватный режим, старый браузер, запрет сайта),
   используется localStorage, а если нет и его, данные живут в памяти до перезагрузки.
   Все методы возвращают промисы, поэтому код приложения не зависит от варианта. */
(function () {
  'use strict';

  var DB_NAME = 'kopilka';
  var DB_VERSION = 1;
  var LS_TX = 'kopilka.tx';
  var LS_KV = 'kopilka.kv';

  function reqToPromise(req) {
    return new Promise(function (resolve, reject) {
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  /* ---------- IndexedDB ---------- */
  function openIDB() {
    return new Promise(function (resolve, reject) {
      var req;
      try {
        req = window.indexedDB.open(DB_NAME, DB_VERSION);
      } catch (e) { reject(e); return; }
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains('tx')) db.createObjectStore('tx', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
      req.onblocked = function () { reject(new Error('IndexedDB заблокирована')); };
    });
  }

  function idbAdapter(db) {
    function store(name, mode) { return db.transaction(name, mode).objectStore(name); }
    function done(tx) {
      return new Promise(function (resolve, reject) {
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
        tx.onabort = function () { reject(tx.error); };
      });
    }
    return {
      kind: 'indexeddb',
      getAll: function () { return reqToPromise(store('tx', 'readonly').getAll()); },
      put: function (item) { var t = db.transaction('tx', 'readwrite'); t.objectStore('tx').put(item); return done(t); },
      remove: function (id) { var t = db.transaction('tx', 'readwrite'); t.objectStore('tx').delete(id); return done(t); },
      replaceAll: function (items) {
        var t = db.transaction('tx', 'readwrite');
        var s = t.objectStore('tx');
        s.clear();
        items.forEach(function (it) { s.put(it); });
        return done(t);
      },
      getKV: function (key) { return reqToPromise(store('kv', 'readonly').get(key)); },
      setKV: function (key, value) { var t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(value, key); return done(t); },
      clearAll: function () {
        var t = db.transaction(['tx', 'kv'], 'readwrite');
        t.objectStore('tx').clear();
        t.objectStore('kv').clear();
        return done(t);
      }
    };
  }

  /* ---------- localStorage / память ---------- */
  function lsAvailable() {
    try {
      var k = '__kopilka_probe__';
      window.localStorage.setItem(k, '1');
      window.localStorage.removeItem(k);
      return true;
    } catch (e) { return false; }
  }

  function memoryAdapter(useLS) {
    var mem = { tx: [], kv: {} };
    function load() {
      if (!useLS) return;
      try {
        mem.tx = JSON.parse(window.localStorage.getItem(LS_TX) || '[]');
        mem.kv = JSON.parse(window.localStorage.getItem(LS_KV) || '{}');
      } catch (e) { mem.tx = []; mem.kv = {}; }
    }
    function save() {
      if (!useLS) return;
      try {
        window.localStorage.setItem(LS_TX, JSON.stringify(mem.tx));
        window.localStorage.setItem(LS_KV, JSON.stringify(mem.kv));
      } catch (e) { /* хранилище переполнено или запрещено: данные остаются в памяти */ }
    }
    load();
    return {
      kind: useLS ? 'localstorage' : 'memory',
      getAll: function () { return Promise.resolve(mem.tx.slice()); },
      put: function (item) {
        var i = mem.tx.findIndex(function (t) { return t.id === item.id; });
        if (i >= 0) mem.tx[i] = item; else mem.tx.push(item);
        save();
        return Promise.resolve();
      },
      remove: function (id) {
        mem.tx = mem.tx.filter(function (t) { return t.id !== id; });
        save();
        return Promise.resolve();
      },
      replaceAll: function (items) { mem.tx = items.slice(); save(); return Promise.resolve(); },
      getKV: function (key) { return Promise.resolve(mem.kv[key]); },
      setKV: function (key, value) { mem.kv[key] = value; save(); return Promise.resolve(); },
      clearAll: function () { mem.tx = []; mem.kv = {}; save(); return Promise.resolve(); }
    };
  }

  function open() {
    var hasIDB = false;
    try { hasIDB = !!window.indexedDB; } catch (e) { hasIDB = false; }
    if (!hasIDB) return Promise.resolve(memoryAdapter(lsAvailable()));
    return openIDB().then(idbAdapter).catch(function () {
      return memoryAdapter(lsAvailable());
    });
  }

  window.KDB = { open: open };
})();
