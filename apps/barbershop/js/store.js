/* Хранилище записей, даты, расчёт свободных окон, демо-генератор.
   Все даты в локальном времени пользователя: ключ дня "YYYY-MM-DD", время в минутах от полуночи. */
(function () {
  "use strict";

  const D = window.APP_DATA;
  const SHOP = D.shop;
  const KEY = {
    bookings: "stal.v1.bookings",
    mine: "stal.v1.mine",
    seeded: "stal.v1.seededFor",
    admin: "stal.v1.admin"
  };

  /* ---------- localStorage с запасным хранилищем в памяти ---------- */

  const memory = {};
  let storageOk = true;

  function read(key, fallback) {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === null) return key in memory ? memory[key] : fallback;
      return JSON.parse(raw);
    } catch (e) {
      storageOk = false;
      return key in memory ? memory[key] : fallback;
    }
  }

  function write(key, value) {
    memory[key] = value;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      storageOk = false;
    }
  }

  function remove(key) {
    delete memory[key];
    try {
      window.localStorage.removeItem(key);
    } catch (e) {
      storageOk = false;
    }
  }

  /* ---------- Даты ---------- */

  const pad = (n) => String(n).padStart(2, "0");
  const dateKey = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  function parseKey(key) {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  function addDays(key, n) {
    const d = parseKey(key);
    d.setDate(d.getDate() + n);
    return dateKey(d);
  }
  const todayKey = () => dateKey(new Date());
  function nowMinutes() {
    const n = new Date();
    return n.getHours() * 60 + n.getMinutes();
  }
  const weekday = (key) => parseKey(key).getDay();
  const isWeekend = (key) => {
    const w = weekday(key);
    return w === 0 || w === 6;
  };
  function diffDays(a, b) {
    return Math.round((parseKey(b) - parseKey(a)) / 86400000);
  }
  function mondayOf(key) {
    const w = weekday(key);
    return addDays(key, w === 0 ? -6 : 1 - w);
  }

  const fmtTime = (m) => pad(Math.floor(m / 60)) + ":" + pad(m % 60);
  const WD_SHORT = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
  const WD_LONG = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
  const MONTHS_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
  const MONTHS_SHORT = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

  function fmtDate(key, opts) {
    const d = parseKey(key);
    const o = opts || {};
    const base = d.getDate() + " " + (o.short ? MONTHS_SHORT[d.getMonth()] : MONTHS_GEN[d.getMonth()]);
    if (o.weekday) return base + ", " + (o.short ? WD_SHORT[d.getDay()] : WD_LONG[d.getDay()]);
    return base;
  }
  function relDay(key) {
    const diff = diffDays(todayKey(), key);
    if (diff === 0) return "Сегодня";
    if (diff === 1) return "Завтра";
    if (diff === -1) return "Вчера";
    return "";
  }

  const fmtMoney = (n) => Math.round(n).toLocaleString("ru-RU").replace(/ /g, " ") + " ₽";
  function fmtDur(min) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (!h) return m + " мин";
    return h + " ч" + (m ? " " + m + " мин" : "");
  }
  function plural(n, one, few, many) {
    const a = Math.abs(n) % 100;
    const b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b > 1 && b < 5) return few;
    if (b === 1) return one;
    return many;
  }

  /* ---------- Справочники ---------- */

  const serviceById = (id) => D.services.find((s) => s.id === id);
  const masterById = (id) => D.masters.find((m) => m.id === id);

  function totals(serviceIds, masterId) {
    const list = serviceIds.map(serviceById).filter(Boolean);
    const dur = list.reduce((s, x) => s + x.dur, 0);
    let price = list.reduce((s, x) => s + x.price, 0);
    const m = masterId ? masterById(masterId) : null;
    if (m && m.top) price = Math.round((price * (1 + SHOP.topMarkup)) / 50) * 50;
    return { dur, price, list };
  }

  function worksOn(masterId, key) {
    const m = masterById(masterId);
    return !!m && !m.daysOff.includes(weekday(key));
  }

  /* ---------- Записи ---------- */

  let bookings = read(KEY.bookings, null);

  function persist() {
    write(KEY.bookings, bookings);
  }

  const isActive = (b) => b.status !== "cancelled";
  const all = () => bookings.slice();
  const byId = (id) => bookings.find((b) => b.id === id);

  function forDay(key, masterId) {
    return bookings
      .filter((b) => b.date === key && isActive(b) && (!masterId || b.masterId === masterId))
      .sort((a, b) => a.start - b.start);
  }

  function makeCode() {
    const used = new Set(bookings.map((b) => b.code));
    let code;
    do {
      code = "С-" + String(1000 + Math.floor(Math.random() * 9000));
    } while (used.has(code));
    return code;
  }

  function uid() {
    return "b" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /* Свободен ли мастер в интервале [start, start + dur) */
  function isFree(masterId, key, start, dur, excludeId) {
    if (!worksOn(masterId, key)) return false;
    if (start < SHOP.open || start + dur > SHOP.close) return false;
    return !bookings.some(
      (b) =>
        b.masterId === masterId &&
        b.date === key &&
        isActive(b) &&
        b.id !== excludeId &&
        b.start < start + dur &&
        start < b.start + b.dur
    );
  }

  /* Первое допустимое время для сегодняшнего дня: через 15 минут от «сейчас», по сетке */
  function earliestStart(key) {
    const t = todayKey();
    if (key < t) return Infinity;
    if (key > t) return SHOP.open;
    const n = nowMinutes() + SHOP.step;
    return Math.max(SHOP.open, Math.ceil(n / SHOP.step) * SHOP.step);
  }

  const anyPool = () => D.masters.filter((m) => !m.top).map((m) => m.id);

  /* Все слоты дня с причиной недоступности.
     masterId: id мастера или "any" (любой, кроме топ-мастера). */
  function slotsFor(key, masterId, dur, excludeId) {
    const pool = masterId === "any" ? anyPool() : [masterId];
    const earliest = earliestStart(key);
    const out = [];
    for (let s = SHOP.open; s < SHOP.close; s += SHOP.step) {
      let reason = "";
      let free = [];
      if (s < earliest) reason = "past";
      else if (s + dur > SHOP.close) reason = "late";
      else {
        free = pool.filter((id) => isFree(id, key, s, dur, excludeId));
        if (!free.length) reason = "busy";
      }
      out.push({ start: s, free, reason });
    }
    return out;
  }

  function dayStatus(key, masterId, dur) {
    const pool = masterId === "any" ? anyPool() : [masterId];
    if (!pool.some((id) => worksOn(id, key))) return { off: true, count: 0 };
    const count = slotsFor(key, masterId, dur).filter((s) => !s.reason).length;
    return { off: false, count };
  }

  function nearestFreeDay(fromKey, masterId, dur) {
    const t = todayKey();
    for (let i = 0; i < SHOP.daysAhead; i++) {
      const k = addDays(t, i);
      if (k <= fromKey) continue;
      if (dayStatus(k, masterId, dur).count > 0) return k;
    }
    for (let i = 0; i < SHOP.daysAhead; i++) {
      const k = addDays(t, i);
      if (dayStatus(k, masterId, dur).count > 0) return k;
    }
    return null;
  }

  /* Для «любого мастера» выбираем наименее загруженного в этот день */
  function pickMaster(key, candidates) {
    const load = (id) => forDay(key, id).reduce((s, b) => s + b.dur, 0);
    return candidates.slice().sort((a, b) => load(a) - load(b))[0];
  }

  function create(data) {
    const t = totals(data.services, data.masterId);
    const b = {
      id: uid(),
      code: makeCode(),
      masterId: data.masterId,
      date: data.date,
      start: data.start,
      dur: t.dur,
      services: data.services.slice(),
      price: t.price,
      name: data.name,
      phone: data.phone,
      comment: data.comment || "",
      remind: !!data.remind,
      status: "confirmed",
      source: data.source || "client",
      createdAt: Date.now()
    };
    bookings.push(b);
    persist();
    if (b.source === "client") {
      const mine = read(KEY.mine, []);
      mine.push(b.id);
      write(KEY.mine, mine);
    }
    return b;
  }

  function update(id, patch) {
    const b = byId(id);
    if (!b) return null;
    Object.assign(b, patch);
    persist();
    return b;
  }

  function cancel(id, by) {
    return update(id, { status: "cancelled", cancelledBy: by, cancelledAt: Date.now() });
  }

  function mine() {
    const ids = read(KEY.mine, []);
    return ids.map(byId).filter(Boolean);
  }

  /* ---------- Демо-генератор (детерминированный) ---------- */

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  /* Наборы услуг с весами: частые визиты чаще */
  const COMBOS = [
    [["cut"], 26],
    [["combo"], 18],
    [["clipper"], 14],
    [["beard"], 12],
    [["clipper", "beard"], 8],
    [["shave"], 7],
    [["kids"], 6],
    [["cut", "gray"], 4],
    [["gray"], 3],
    [["beard", "gray"], 2]
  ];

  function pickCombo(rnd, masterId) {
    const m = masterById(masterId);
    const weights = COMBOS.map(([ids, w]) => {
      let k = w;
      if (m.id === "orlov" && ids.includes("kids")) k *= 3;
      if (m.id === "galiev" && (ids.includes("beard") || ids.includes("gray"))) k *= 2;
      if (m.id === "volkov" && ids.includes("shave")) k *= 2.5;
      if (m.id === "sokolov" && ids.includes("clipper")) k *= 2;
      return k;
    });
    const sum = weights.reduce((a, b) => a + b, 0);
    let r = rnd() * sum;
    for (let i = 0; i < COMBOS.length; i++) {
      r -= weights[i];
      if (r <= 0) return COMBOS[i][0];
    }
    return COMBOS[0][0];
  }

  const SEED = 20260917;

  function seedDemo() {
    const today = todayKey();
    const nowM = nowMinutes();
    const list = [];
    const dayLen = SHOP.close - SHOP.open;
    const usedCodes = new Set();
    for (let offset = -6; offset <= 13; offset++) {
      const key = addDays(today, offset);
      D.masters.forEach((m, mi) => {
        if (!worksOn(m.id, key)) return;
        /* Детерминированность: seed зависит от постоянного числа, смещения дня и мастера,
           поэтому при одном «сегодня» генератор всегда даёт одно и то же расписание. */
        const rnd = mulberry32(SEED + hashStr(offset + ":" + m.id) + mi);
        /* Прошлые дни и ближайшие загружены плотнее, дальние слабее (записываются ближе к дате) */
        const ahead = Math.max(0, offset);
        let hi = 0.8 - ahead * 0.025;
        let lo = 0.66 - ahead * 0.015;
        /* За пределами двух недель вокруг сегодня: редкие ранние записи */
        if (offset > 7) {
          hi = 0.5 - (offset - 8) * 0.05;
          lo = Math.max(0.08, 0.28 - (offset - 8) * 0.03);
        }
        const target = lo + rnd() * (hi - lo);
        const picks = [];
        let busy = 0;
        let guard = 0;
        while (busy < target * dayLen - 20 && guard++ < 40) {
          const combo = pickCombo(rnd, m.id);
          const t = totals(combo, m.id);
          if (busy + t.dur > target * dayLen + 25) continue;
          picks.push({ combo, t });
          busy += t.dur;
        }
        /* Свободное время раскладываем несколькими крупными окнами (по сетке 15 минут),
           как в живом расписании: пара длинных пауз и немного мелких */
        let freeSteps = Math.floor((dayLen - busy) / SHOP.step);
        const gaps = new Array(picks.length + 1).fill(0);
        const chunks = 2 + Math.floor(rnd() * 3);
        for (let c = 0; c < chunks && freeSteps > 0; c++) {
          const size = c === chunks - 1 ? freeSteps : Math.max(2, Math.round((freeSteps / (chunks - c)) * (0.6 + rnd() * 0.8)));
          const take = Math.min(size, freeSteps);
          gaps[Math.floor(rnd() * gaps.length)] += take;
          freeSteps -= take;
        }
        let cursor = SHOP.open + gaps[0] * SHOP.step;
        picks.forEach((p, i) => {
          const name = D.demoNames[Math.floor(rnd() * D.demoNames.length)];
          const comment = D.demoComments[Math.floor(rnd() * D.demoComments.length)];
          const op = String(10 + Math.floor(rnd() * 89));
          const num = String(1000000 + Math.floor(rnd() * 8999999));
          let status = "confirmed";
          const endM = cursor + p.t.dur;
          const past = offset < 0 || (offset === 0 && endM <= nowM);
          if (past) status = rnd() < 0.08 ? "noshow" : "arrived";
          let code;
          do {
            code = "С-" + String(1000 + Math.floor(rnd() * 9000));
          } while (usedCodes.has(code));
          usedCodes.add(code);
          list.push({
            id: "d" + offset + m.id + i,
            code,
            masterId: m.id,
            date: key,
            start: cursor,
            dur: p.t.dur,
            services: p.combo,
            price: p.t.price,
            name,
            phone: "+7 (9" + op + ") " + num.slice(0, 3) + "-" + num.slice(3, 5) + "-" + num.slice(5, 7),
            comment,
            remind: rnd() < 0.6,
            status,
            source: rnd() < 0.7 ? "online" : "phone",
            createdAt: 0
          });
          cursor = endM + gaps[i + 1] * SHOP.step;
        });
      });
    }
    bookings = list;
    persist();
    write(KEY.seeded, today);
    remove(KEY.mine);
  }

  if (!Array.isArray(bookings)) seedDemo();

  function resetDemo() {
    seedDemo();
  }

  /* ---------- Админ-режим (без авторизации, только флаг демо) ---------- */
  const adminEntered = () => read(KEY.admin, false) === true;
  const setAdmin = (v) => (v ? write(KEY.admin, true) : remove(KEY.admin));

  /* ---------- Аналитика для панели ---------- */

  function dayStats(key) {
    const day = forDay(key);
    const working = D.masters.filter((m) => worksOn(m.id, key)).length;
    const capacity = working * (SHOP.close - SHOP.open);
    const counted = day.filter((b) => b.status !== "noshow");
    const revenue = counted.reduce((s, b) => s + b.price, 0);
    const received = day.filter((b) => b.status === "arrived").reduce((s, b) => s + b.price, 0);
    const busy = day.reduce((s, b) => s + b.dur, 0);
    return {
      count: day.length,
      noshow: day.length - counted.length,
      revenue,
      received,
      expected: revenue - received,
      load: capacity ? busy / capacity : 0,
      avg: counted.length ? revenue / counted.length : 0,
      working
    };
  }

  window.Store = {
    SHOP,
    storageOk: () => storageOk,
    dateKey,
    parseKey,
    addDays,
    todayKey,
    nowMinutes,
    weekday,
    isWeekend,
    diffDays,
    mondayOf,
    fmtTime,
    fmtDate,
    relDay,
    fmtMoney,
    fmtDur,
    plural,
    WD_SHORT,
    WD_LONG,
    MONTHS_SHORT,
    serviceById,
    masterById,
    totals,
    worksOn,
    all,
    byId,
    forDay,
    isFree,
    slotsFor,
    dayStatus,
    nearestFreeDay,
    pickMaster,
    earliestStart,
    create,
    update,
    cancel,
    mine,
    resetDemo,
    adminEntered,
    setAdmin,
    dayStats,
    reload() {
      const fresh = read(KEY.bookings, null);
      if (Array.isArray(fresh)) bookings = fresh;
    }
  };
})();
