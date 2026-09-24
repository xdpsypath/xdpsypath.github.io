/* Копилка: логика приложения.
   Экраны переключаются по hash (#/overview, #/ops, #/budgets, #/settings),
   поэтому всё работает и с диска (file://), и с GitHub Pages.
   Суммы хранятся в копейках (целые числа), даты в виде строки ГГГГ-ММ-ДД. */
(function () {
  'use strict';

  var D = window.APP_DATA;
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  var MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  var MONTHS_PREP = ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре'];
  var WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
  var MINUS = '−';
  var NBSP = ' ';
  var ROUTES = ['overview', 'ops', 'budgets', 'settings'];
  var WIPE_WORD = 'удалить';
  var SNACK_MS = 5000;

  var DEFAULT_SETTINGS = { currency: 'RUB', theme: 'system', cents: false, limits: {} };

  var state = {
    db: null,
    tx: [],
    settings: clone(DEFAULT_SETTINGS),
    month: '',
    route: 'overview',
    filters: { q: '', type: 'all', cat: 'all' },
    editing: null,
    lastCat: { expense: 'food', income: 'salary' },
    amountRaw: '',
    limitCat: null,
    confirmAction: null,
    installEvent: null,
    paceDay: null
  };

  /* =================================================================
     Утилиты
     ================================================================= */
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function isoDate(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function today() { return isoDate(new Date()); }
  function monthOf(iso) { return iso.slice(0, 7); }
  function currentMonth() { return monthOf(today()); }
  function parseISO(iso) { var p = iso.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2] || 1); }
  function daysIn(ym) { var p = ym.split('-').map(Number); return new Date(p[0], p[1], 0).getDate(); }
  function shiftMonth(ym, delta) {
    var p = ym.split('-').map(Number);
    var d = new Date(p[0], p[1] - 1 + delta, 1);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1);
  }
  function monthIndex(ym) { return Number(ym.split('-')[1]) - 1; }
  function monthTitle(ym) { return MONTHS[monthIndex(ym)] + ' ' + ym.split('-')[0]; }
  function monthLower(ym) { return MONTHS[monthIndex(ym)].toLowerCase(); }

  function plural(n, forms) {
    var a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return forms[2];
    if (b > 1 && b < 5) return forms[1];
    if (b === 1) return forms[0];
    return forms[2];
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function icon(name, cls) {
    return '<svg class="icon' + (cls ? ' ' + cls : '') + '" aria-hidden="true"><use href="#i-' + name + '"/></svg>';
  }

  function currency() {
    var id = state.settings.currency;
    for (var i = 0; i < D.currencies.length; i++) if (D.currencies[i].id === id) return D.currencies[i];
    return D.currencies[0];
  }

  var nfCache = {};
  function nf(digits) {
    if (!nfCache[digits]) nfCache[digits] = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits });
    return nfCache[digits];
  }

  /* Сумма в копейках -> «12 300 ₽». sign: 'auto' (минус только у отрицательных), 'always' (+/−), 'none'. */
  function money(minor, sign) {
    var digits = state.settings.cents ? 2 : 0;
    var abs = Math.abs(minor) / 100;
    var s = nf(digits).format(abs) + NBSP + currency().symbol;
    if (sign === 'none') return s;
    if (minor < 0) return MINUS + s;
    if (sign === 'always' && minor > 0) return '+' + s;
    return s;
  }
  function signed(tx) { return tx.type === 'income' ? tx.amount : -tx.amount; }

  function compact(rub) {
    if (rub >= 1e6) return nf(0).format(Math.round(rub / 1e5) / 10) + NBSP + 'млн';
    if (rub >= 1000) return nf(0).format(Math.round(rub / 1000)) + NBSP + 'тыс';
    return nf(0).format(Math.round(rub));
  }

  /* «1 250,5» -> 125050 копеек; NaN, если не число */
  function parseAmount(str) {
    var s = String(str || '').replace(/[\s  ]/g, '').replace('.', ',');
    if (!/^\d+(,\d{0,2})?$/.test(s)) return NaN;
    var parts = s.split(',');
    var minor = Number(parts[0]) * 100 + (parts[1] ? Number((parts[1] + '0').slice(0, 2)) : 0);
    return minor;
  }

  /* Приводит ввод к виду «12 345,67» (не больше 9 цифр до запятой, 2 после) */
  function normalizeRaw(str) {
    var s = String(str || '').replace(/\./g, ',').replace(/[^\d,]/g, '');
    var i = s.indexOf(',');
    var int = i >= 0 ? s.slice(0, i) : s;
    var dec = i >= 0 ? s.slice(i + 1).replace(/,/g, '').slice(0, 2) : null;
    int = int.replace(/^0+(?=\d)/, '').slice(0, 9);
    if (int === '' && dec !== null) int = '0';
    return int + (dec !== null ? ',' + dec : '');
  }
  function groupRaw(raw) {
    var i = raw.indexOf(',');
    var int = i >= 0 ? raw.slice(0, i) : raw;
    var rest = i >= 0 ? raw.slice(i) : '';
    return int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + rest;
  }
  function rawFromMinor(minor) {
    var r = Math.floor(minor / 100), k = minor % 100;
    return String(r) + (k ? ',' + pad2(k).replace(/0$/, '') : '');
  }

  function uid() { return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  function allCats() { return D.categories.expense.concat(D.categories.income); }
  function catOf(type, id) {
    var list = D.categories[type] || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return { id: id, name: 'Другое', icon: 'ellipsis', slot: 0 };
  }

  function byNewest(a, b) {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return (b.createdAt || 0) - (a.createdAt || 0);
  }

  function monthTx(ym) { return state.tx.filter(function (t) { return monthOf(t.date) === ym; }); }
  function totals(list) {
    var r = { inc: 0, exp: 0 };
    list.forEach(function (t) { if (t.type === 'income') r.inc += t.amount; else r.exp += t.amount; });
    return r;
  }

  function dayLabel(iso) {
    var t = today();
    var y = isoDate(new Date(parseISO(t).getTime() - 864e5));
    if (iso === t) return 'сегодня';
    if (iso === y) return 'вчера';
    var d = parseISO(iso);
    return d.getDate() + ' ' + MONTHS_GEN[d.getMonth()] + ', ' + WEEKDAYS[d.getDay()];
  }
  function shortDate(iso) { var d = parseISO(iso); return d.getDate() + ' ' + MONTHS_GEN[d.getMonth()]; }

  /* =================================================================
     Хранилище
     ================================================================= */
  function persistSettings() { return state.db.setKV('settings', state.settings).catch(function () {}); }

  function loadAll() {
    return window.KDB.open().then(function (db) {
      state.db = db;
      return Promise.all([db.getAll(), db.getKV('settings'), db.getKV('lastCat')]);
    }).then(function (res) {
      state.tx = Array.isArray(res[0]) ? res[0] : [];
      if (res[1] && typeof res[1] === 'object') state.settings = Object.assign(clone(DEFAULT_SETTINGS), res[1]);
      if (!state.settings.limits || typeof state.settings.limits !== 'object') state.settings.limits = {};
      if (res[2] && typeof res[2] === 'object') state.lastCat = Object.assign(state.lastCat, res[2]);
    });
  }

  /* =================================================================
     Тема
     ================================================================= */
  function applyTheme() {
    var t = state.settings.theme;
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
    var bg = getComputedStyle(document.body).backgroundColor;
    $$('meta[name="theme-color"]').forEach(function (m) {
      if (t === 'system') {
        if (m.dataset.initial) m.setAttribute('content', m.dataset.initial);
      } else {
        if (!m.dataset.initial) m.dataset.initial = m.getAttribute('content');
        m.setAttribute('content', bg);
      }
    });
  }

  /* =================================================================
     Маршрутизация
     ================================================================= */
  function routeFromHash() {
    var r = (location.hash || '').replace(/^#\/?/, '');
    return ROUTES.indexOf(r) >= 0 ? r : 'overview';
  }

  function showRoute(focus) {
    state.route = routeFromHash();
    ROUTES.forEach(function (r) {
      var el = $('#screen-' + r);
      el.hidden = r !== state.route;
    });
    $$('.tabbar__link').forEach(function (a) {
      if (a.dataset.route === state.route) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    updateMonthbarVisibility();
    var titles = { overview: 'Обзор', ops: 'Операции', budgets: 'Бюджеты', settings: 'Настройки' };
    document.title = titles[state.route] + '. Копилка';
    if (focus) {
      window.scrollTo(0, 0);
      var h = $('#screen-' + state.route + ' h1');
      if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
    }
  }

  function updateMonthbarVisibility() {
    $('#monthbar').hidden = state.route === 'settings' || state.tx.length === 0;
  }

  /* =================================================================
     Месяц
     ================================================================= */
  function earliestMonth() {
    var min = currentMonth();
    state.tx.forEach(function (t) { var m = monthOf(t.date); if (m < min) min = m; });
    return min;
  }

  function renderMonthbar() {
    $('#month-label').textContent = monthTitle(state.month);
    $('#month-next').disabled = state.month >= currentMonth();
    $('#month-prev').disabled = state.month <= earliestMonth();
  }

  /* =================================================================
     Обзор
     ================================================================= */
  function renderOverview() {
    var empty = state.tx.length === 0;
    $('#overview-empty').hidden = !empty;
    $('#overview-content').hidden = empty;
    $('#overview-end').hidden = empty;
    if (empty) return;

    var list = monthTx(state.month);
    var t = totals(list);
    var bal = t.inc - t.exp;
    $('#hero-label').textContent = 'Баланс за ' + monthLower(state.month);
    $('#hero-value').textContent = money(bal, 'always');
    $('#hero-income').textContent = '+' + money(t.inc, 'none');
    $('#hero-expense').textContent = (t.exp ? MINUS : '') + money(t.exp, 'none');

    renderAllowance(t);
    renderDonut(list);
    renderPace();
    renderRecent(list);
  }

  function renderAllowance(t) {
    var card = $('#allowance');
    var title = $('#allowance-title'), value = $('#allowance-value'), note = $('#allowance-note');
    var ic = $('.allowance__icon use', card);
    card.classList.remove('allowance--warn', 'allowance--muted');
    var bal = t.inc - t.exp;
    var ym = state.month;
    var dim = daysIn(ym);

    if (ym < currentMonth()) {
      card.classList.add('allowance--muted');
      ic.setAttribute('href', '#i-calendar');
      title.textContent = 'В среднем тратили в день';
      value.textContent = money(Math.round(t.exp / dim));
      note.textContent = bal >= 0 ? 'Месяц закрыт, отложено ' + money(bal) : 'Месяц закрыт с перерасходом ' + money(-bal, 'none');
      return;
    }
    var day = parseISO(today()).getDate();
    var left = dim - day + 1;
    if (t.inc === 0) {
      card.classList.add('allowance--muted');
      ic.setAttribute('href', '#i-info');
      title.textContent = 'Можно тратить в день';
      value.textContent = 'Нужен доход';
      note.textContent = 'Добавьте доход за ' + monthLower(ym) + ', и Копилка посчитает дневной лимит';
      return;
    }
    if (bal <= 0) {
      card.classList.add('allowance--warn');
      ic.setAttribute('href', '#i-triangle-alert');
      title.textContent = 'Расходы больше доходов';
      value.textContent = money(-bal, 'none');
      note.textContent = 'Перерасход в ' + MONTHS_PREP[monthIndex(ym)] + '. Лучше подождать с покупками до новых поступлений';
      return;
    }
    ic.setAttribute('href', '#i-wallet');
    title.textContent = 'Можно тратить в день';
    value.textContent = money(Math.floor(bal / left));
    note.textContent = 'Осталось ' + money(bal) + ' на ' + left + ' ' + plural(left, ['день', 'дня', 'дней']) + ', включая сегодня';
  }

  /* ---------- Кольцевая диаграмма ---------- */
  function donutData(list) {
    var sums = {};
    list.forEach(function (t) { if (t.type === 'expense') sums[t.category] = (sums[t.category] || 0) + t.amount; });
    var total = 0;
    var cats = D.categories.expense.map(function (c) {
      var v = sums[c.id] || 0; total += v;
      return { id: c.id, name: c.name, slot: c.slot, value: v };
    }).filter(function (c) { return c.value > 0; });
    /* Не больше пяти именованных сегментов, остальное в серое «Остальное».
       Цвет закреплён за категорией, а не за местом в рейтинге. */
    var colored = cats.filter(function (c) { return c.slot > 0; }).sort(function (a, b) { return b.value - a.value; });
    var named = colored.slice(0, 5);
    var rest = cats.filter(function (c) { return named.indexOf(c) < 0; });
    var segs = named.slice().sort(function (a, b) { return a.slot - b.slot; });
    if (rest.length) {
      segs.push({
        id: '__rest', slot: 0,
        name: rest.length === 1 ? rest[0].name : 'Остальное',
        sub: rest.length > 1 ? rest.sort(function (a, b) { return b.value - a.value; }).map(function (c) { return c.name; }).join(', ') : '',
        value: rest.reduce(function (s, c) { return s + c.value; }, 0),
        catId: rest.length === 1 ? rest[0].id : null
      });
    }
    return { total: total, segs: segs };
  }

  function pctText(v, total) {
    var p = total ? (v / total) * 100 : 0;
    return (p > 0 && p < 1 ? '<1' : Math.round(p)) + '%';
  }

  function renderDonut(list) {
    var dd = donutData(list);
    var svg = $('#donut-svg');
    var legend = $('#donut-legend');
    var hasData = dd.total > 0;
    $('#donut').hidden = !hasData;
    $('#donut-empty').hidden = hasData;
    if (!hasData) return;

    var R = 80, C = 2 * Math.PI * R, GAP = dd.segs.length > 1 ? 2.2 : 0;
    var offset = 0;
    var html = '<desc id="donut-desc">Расходы за ' + esc(monthLower(state.month)) + ': ' + esc(money(dd.total)) + '. ' +
      dd.segs.map(function (s) { return esc(s.name) + ' ' + pctText(s.value, dd.total); }).join(', ') + '</desc>';
    html += '<circle class="donut__track" cx="100" cy="100" r="' + R + '"/>';
    dd.segs.forEach(function (s) {
      var len = (s.value / dd.total) * C;
      var dash = Math.max(len - GAP, 0.8);
      html += '<circle class="donut__seg s-' + s.slot + '" data-key="' + s.id + '" cx="100" cy="100" r="' + R + '" ' +
        'stroke-dasharray="' + dash.toFixed(2) + ' ' + (C - dash).toFixed(2) + '" stroke-dashoffset="' + (-offset).toFixed(2) + '" ' +
        'transform="rotate(-90 100 100)"/>';
      offset += len;
    });
    svg.innerHTML = html;

    var sorted = dd.segs.slice().sort(function (a, b) {
      if (a.id === '__rest') return 1;
      if (b.id === '__rest') return -1;
      return b.value - a.value;
    });
    legend.innerHTML = sorted.map(function (s) {
      return '<li><button class="legend__btn s-' + s.slot + '" type="button" data-key="' + s.id + '" data-cat="' + (s.id === '__rest' ? (s.catId || '') : s.id) + '">' +
        '<span class="legend__dot" aria-hidden="true"></span>' +
        '<span class="legend__name"><span class="legend__title">' + esc(s.name) + '</span>' +
        (s.sub ? '<span class="legend__sub">' + esc(s.sub) + '</span>' : '') + '</span>' +
        '<span class="legend__amount">' + esc(money(s.value)) + '</span>' +
        '<span class="legend__pct">' + pctText(s.value, dd.total) + '</span>' +
        '<span class="visually-hidden">. Открыть операции</span>' +
        '</button></li>';
    }).join('');

    legend._data = dd;
    setDonutActive(null);
  }

  function setDonutActive(key) {
    var dd = $('#donut-legend')._data;
    if (!dd) return;
    var fig = $('#donut');
    fig.classList.toggle('donut--focus', !!key);
    $$('.donut__seg', fig).forEach(function (s) { s.classList.toggle('is-active', s.dataset.key === key); });
    $$('.legend__btn', fig).forEach(function (b) { b.classList.toggle('is-active', b.dataset.key === key); });
    var seg = null;
    dd.segs.forEach(function (s) { if (s.id === key) seg = s; });
    $('#donut-center-label').textContent = seg ? seg.name : 'Всего';
    $('#donut-center-value').textContent = money(seg ? seg.value : dd.total);
    $('#donut-center-share').textContent = seg ? pctText(seg.value, dd.total) + ' расходов' : monthLower(state.month);
  }

  /* ---------- Темп расходов ---------- */
  function cumulative(ym, upto) {
    var arr = [0];
    var byDay = {};
    monthTx(ym).forEach(function (t) {
      if (t.type !== 'expense') return;
      var d = Number(t.date.slice(8, 10));
      byDay[d] = (byDay[d] || 0) + t.amount;
    });
    var sum = 0;
    for (var d = 1; d <= upto; d++) { sum += byDay[d] || 0; arr[d] = sum; }
    return arr;
  }

  function niceMax(v) {
    if (v <= 0) return 1000;
    var half = v / 2;
    var p = Math.pow(10, Math.floor(Math.log10(half)));
    var steps = [1, 2, 2.5, 5, 10];
    for (var i = 0; i < steps.length; i++) if (steps[i] * p >= half) return steps[i] * p * 2;
    return 20 * p;
  }

  function paceModel() {
    var ym = state.month;
    var prev = shiftMonth(ym, -1);
    var dim = daysIn(ym), pdim = daysIn(prev);
    var isCur = ym === currentMonth();
    var last = isCur ? parseISO(today()).getDate() : dim;
    var cur = cumulative(ym, last);
    var hasPrev = monthTx(prev).some(function (t) { return t.type === 'expense'; });
    var pr = hasPrev ? cumulative(prev, pdim) : null;
    var maxDays = Math.max(dim, hasPrev ? pdim : 0);
    var maxV = Math.max(cur[last] || 0, pr ? pr[pdim] : 0) / 100;
    return { ym: ym, prev: prev, dim: dim, pdim: pdim, last: last, cur: cur, pr: pr, maxDays: maxDays, top: niceMax(maxV) };
  }

  function renderPace() {
    var box = $('#pace');
    var svg = $('#pace-svg');
    var m = paceModel();
    box._m = m;
    var W = Math.max(box.clientWidth, 240), H = box.clientHeight || 176;
    var M = { t: 10, r: 8, b: 24, l: 44 };
    var pw = W - M.l - M.r, ph = H - M.t - M.b;
    var x = function (d) { return M.l + ((d - 1) / Math.max(m.maxDays - 1, 1)) * pw; };
    var y = function (rub) { return M.t + ph - (rub / m.top) * ph; };
    box._geo = { x: x, y: y, M: M, W: W, H: H, pw: pw };

    var h = '';
    [0, 0.5, 1].forEach(function (f) {
      var v = m.top * f, yy = Math.round(y(v)) + 0.5;
      h += '<line class="' + (f === 0 ? 'pace__base' : 'pace__grid') + '" x1="' + M.l + '" x2="' + (W - M.r) + '" y1="' + yy + '" y2="' + yy + '"/>';
      h += '<text class="pace__tick" x="' + (M.l - 8) + '" y="' + (yy + 4) + '" text-anchor="end">' + compact(v) + '</text>';
    });
    [1, 8, 15, 22, 29].forEach(function (d) {
      if (d > m.maxDays) return;
      h += '<text class="pace__tick" x="' + x(d) + '" y="' + (H - 6) + '" text-anchor="middle">' + d + '</text>';
    });

    function pathFor(arr, upto) {
      var p = '';
      for (var d = 1; d <= upto; d++) p += (d === 1 ? 'M' : 'L') + x(d).toFixed(1) + ' ' + y(arr[d] / 100).toFixed(1);
      return p;
    }
    if (m.pr) h += '<path class="pace__line pace__line--prev" d="' + pathFor(m.pr, m.pdim) + '"/>';
    var curPath = pathFor(m.cur, m.last);
    h += '<path class="pace__area" d="' + curPath + 'L' + x(m.last).toFixed(1) + ' ' + y(0) + 'L' + x(1).toFixed(1) + ' ' + y(0) + 'Z"/>';
    h += '<path class="pace__line pace__line--cur" d="' + curPath + '"/>';
    var ex = x(m.last), ey = y(m.cur[m.last] / 100);
    var nearRight = ex > W - 90;
    h += '<text class="pace__endlabel" x="' + (nearRight ? ex - 8 : ex + 8) + '" y="' + (ey - 10) + '" text-anchor="' + (nearRight ? 'end' : 'start') + '">' + esc(money(m.cur[m.last])) + '</text>';
    h += '<circle class="pace__dot pace__dot--cur" cx="' + ex + '" cy="' + ey + '" r="5"/>';
    h += '<g id="pace-hover"></g>';
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.innerHTML = h;

    $('#pace-key-cur').textContent = MONTHS[monthIndex(m.ym)];
    $('#pace-key-prev').textContent = MONTHS[monthIndex(m.prev)];
    $('#pace-key-prev').parentNode.hidden = !m.pr;

    var hl = $('#pace-headline');
    var spent = m.cur[m.last];
    if (m.pr) {
      var cmpDay = Math.min(m.last, m.pdim);
      var diff = spent - m.pr[cmpDay];
      var when = m.ym === currentMonth() ? 'к ' + cmpDay + ' ' + MONTHS_GEN[monthIndex(m.prev)] : 'за ' + monthLower(m.prev);
      if (Math.abs(diff) < 100) hl.innerHTML = icon('check') + '<span>Столько же, сколько ' + esc(when) + '</span>';
      else if (diff < 0) hl.innerHTML = icon('arrow-down-right') + '<span>На <strong>' + esc(money(-diff)) + '</strong> меньше, чем ' + esc(when) + '</span>';
      else hl.innerHTML = icon('arrow-up-right') + '<span>На <strong>' + esc(money(diff)) + '</strong> больше, чем ' + esc(when) + '</span>';
    } else {
      hl.innerHTML = icon('info') + '<span>Потрачено <strong>' + esc(money(spent)) + '</strong> за ' + m.last + ' ' + plural(m.last, ['день', 'дня', 'дней']) + '. Сравнение появится со следующего месяца</span>';
    }

    var th = '<caption class="visually-hidden">Накопленные расходы по дням</caption><thead><tr><th scope="col">День</th><th scope="col">' + MONTHS[monthIndex(m.ym)] + '</th>' +
      (m.pr ? '<th scope="col">' + MONTHS[monthIndex(m.prev)] + '</th>' : '') + '</tr></thead><tbody>';
    for (var d = 1; d <= m.last; d++) {
      th += '<tr><td>' + d + '</td><td>' + esc(money(m.cur[d])) + '</td>' + (m.pr ? '<td>' + (d <= m.pdim ? esc(money(m.pr[d])) : '') + '</td>' : '') + '</tr>';
    }
    $('#pace-table').innerHTML = th + '</tbody>';
    if (state.paceDay) showPaceDay(state.paceDay);
  }

  function showPaceDay(day) {
    var box = $('#pace'), m = box._m, g = box._geo;
    if (!m || !g) return;
    day = Math.max(1, Math.min(m.maxDays, day));
    state.paceDay = day;
    var hov = $('#pace-hover');
    var xx = g.x(day);
    var h = '<line class="pace__cross" x1="' + xx + '" x2="' + xx + '" y1="' + g.M.t + '" y2="' + (g.H - g.M.b) + '"/>';
    var rows = [];
    if (m.pr && day <= m.pdim) {
      h += '<circle class="pace__dot pace__dot--prev" cx="' + xx + '" cy="' + g.y(m.pr[day] / 100) + '" r="4"/>';
      rows.push({ cls: 'prev', name: MONTHS[monthIndex(m.prev)], v: m.pr[day] });
    }
    if (day <= m.last) {
      h += '<circle class="pace__dot pace__dot--cur" cx="' + xx + '" cy="' + g.y(m.cur[day] / 100) + '" r="5"/>';
      rows.unshift({ cls: 'cur', name: MONTHS[monthIndex(m.ym)], v: m.cur[day] });
    }
    hov.innerHTML = h;

    var tip = $('#pace-tip');
    tip.innerHTML = '<span class="tip__date">' + day + '-й день месяца, накопленные расходы</span>' + rows.map(function (r) {
      return '<span class="tip__row"><span class="keys__line keys__line--' + (r.cls === 'cur' ? 'accent' : 'context') + '" aria-hidden="true"></span><strong>' + esc(money(r.v)) + '</strong><span>' + esc(r.name) + '</span></span>';
    }).join('') + (rows.length ? '' : '<span class="tip__row"><span>Нет данных за этот день</span></span>');
    tip.hidden = false;
    var tw = tip.offsetWidth;
    var left = xx + 12;
    if (left + tw > g.W) left = xx - tw - 12;
    tip.style.left = Math.max(0, left) + 'px';
    tip.style.top = '0px';
    $('#pace-live').textContent = day + '-й день: ' + rows.map(function (r) { return r.name + ' ' + money(r.v); }).join(', ');
  }

  function hidePace() {
    state.paceDay = null;
    var hov = $('#pace-hover'); if (hov) hov.innerHTML = '';
    $('#pace-tip').hidden = true;
  }

  function dayFromPointer(e) {
    var box = $('#pace'), m = box._m, g = box._geo;
    var rect = box.getBoundingClientRect();
    var px = (e.clientX - rect.left) * (g.W / rect.width);
    return Math.round(((px - g.M.l) / g.pw) * (m.maxDays - 1)) + 1;
  }

  /* ---------- Списки операций ---------- */
  function txRow(t, withDelete) {
    var c = catOf(t.type, t.category);
    var note = t.note && t.note !== c.name ? t.note : '';
    var title = note || c.name;
    var sub = note ? c.name : (t.type === 'income' ? 'Доход' : 'Расход');
    var amount = (t.type === 'income' ? '+' : MINUS) + money(t.amount, 'none');
    var label = (t.type === 'income' ? 'Доход' : 'Расход') + ', ' + c.name + (t.note ? ', ' + t.note : '') + ', ' + amount + ', ' + shortDate(t.date);
    return '<li class="tx tx--' + t.type + '" data-id="' + esc(t.id) + '">' +
      (withDelete ? '<div class="tx__behind" aria-hidden="true">' + icon('trash-2') + 'Удалить</div>' : '') +
      '<div class="tx__front">' +
      '<button class="tx__main" type="button" data-edit="' + esc(t.id) + '" aria-label="Изменить: ' + esc(label) + '">' +
      '<span class="tx__tile" aria-hidden="true">' + icon(c.icon) + '</span>' +
      '<span class="tx__text"><span class="tx__title">' + esc(title) + '</span><span class="tx__sub">' + esc(sub) + '</span></span>' +
      '<span class="tx__amount">' + esc(amount) + '</span>' +
      '</button>' +
      (withDelete ? '<button class="icon-btn tx__del" type="button" data-del="' + esc(t.id) + '" aria-label="Удалить запись: ' + esc(label) + '">' + icon('trash-2') + '</button>' : '') +
      '</div></li>';
  }

  function renderRecent(list) {
    var items = list.slice().sort(byNewest).slice(0, 5);
    $('#recent-list').innerHTML = items.map(function (t) { return txRow(t, false); }).join('');
    $('#recent-empty').hidden = items.length > 0;
  }

  function filteredOps() {
    var f = state.filters;
    var q = f.q.trim().toLowerCase();
    return monthTx(state.month).filter(function (t) {
      if (f.type !== 'all' && t.type !== f.type) return false;
      if (f.cat !== 'all' && (t.type + ':' + t.category) !== f.cat) return false;
      if (q) {
        var c = catOf(t.type, t.category);
        var hay = ((t.note || '') + ' ' + c.name + ' ' + (t.amount / 100)).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    }).sort(byNewest);
  }

  function renderCategorySelect() {
    var sel = $('#ops-category');
    var type = state.filters.type;
    var h = '<option value="all">Все категории</option>';
    ['expense', 'income'].forEach(function (tp) {
      if (type !== 'all' && type !== tp) return;
      h += '<optgroup label="' + (tp === 'expense' ? 'Расходы' : 'Доходы') + '">';
      D.categories[tp].forEach(function (c) { h += '<option value="' + tp + ':' + c.id + '">' + esc(c.name) + '</option>'; });
      h += '</optgroup>';
    });
    sel.innerHTML = h;
    if (!sel.querySelector('option[value="' + state.filters.cat + '"]')) state.filters.cat = 'all';
    sel.value = state.filters.cat;
  }

  function renderOps() {
    var all = monthTx(state.month);
    var list = filteredOps();
    var f = state.filters;
    var filtered = f.q.trim() || f.type !== 'all' || f.cat !== 'all';
    $('#ops-meta').textContent = all.length + ' ' + plural(all.length, ['запись', 'записи', 'записей']) + ' за ' + monthLower(state.month);
    $$('input[name="ops-type"]').forEach(function (r) { r.checked = r.value === f.type; });
    if ($('#ops-search').value !== f.q) $('#ops-search').value = f.q;

    var groups = [];
    var map = {};
    list.forEach(function (t) {
      if (!map[t.date]) { map[t.date] = { date: t.date, items: [], inc: 0, exp: 0 }; groups.push(map[t.date]); }
      map[t.date].items.push(t);
      if (t.type === 'income') map[t.date].inc += t.amount; else map[t.date].exp += t.amount;
    });

    $('#ops-list').innerHTML = groups.map(function (g) {
      var sums = [];
      if (g.inc) sums.push('+' + money(g.inc, 'none'));
      if (g.exp) sums.push(MINUS + money(g.exp, 'none'));
      return '<section class="day" aria-label="' + esc(dayLabel(g.date)) + '">' +
        '<h2 class="day__head"><span class="day__name">' + esc(dayLabel(g.date)) + '</span><span class="day__sum">' + esc(sums.join('  ')) + '</span></h2>' +
        '<ul class="tx-list day__card">' + g.items.map(function (t) { return txRow(t, true); }).join('') + '</ul></section>';
    }).join('');

    var empty = list.length === 0;
    $('#ops-empty').hidden = !empty;
    if (empty) {
      if (!filtered) {
        $('#ops-empty-title').textContent = 'В ' + MONTHS_PREP[monthIndex(state.month)] + ' записей нет';
        $('#ops-empty-text').textContent = 'Добавьте трату или доход, и они появятся здесь, сгруппированные по дням.';
        $('#ops-reset').textContent = 'Добавить запись';
        $('#ops-reset').dataset.mode = 'add';
      } else {
        $('#ops-empty-title').textContent = 'Ничего не нашлось';
        $('#ops-empty-text').textContent = 'Попробуйте другой запрос или сбросьте фильтры.';
        $('#ops-reset').textContent = 'Сбросить фильтры';
        $('#ops-reset').dataset.mode = 'reset';
      }
    }
    var end = $('#ops-end');
    end.hidden = empty;
    if (!empty) {
      var t = totals(list);
      end.textContent = 'Показано ' + list.length + ' из ' + all.length + '. Расходы ' + (t.exp ? MINUS : '') + money(t.exp, 'none') + ', доходы +' + money(t.inc, 'none') + '.';
    }
    $('#ops-live').textContent = filtered ? 'Найдено ' + list.length + ' ' + plural(list.length, ['запись', 'записи', 'записей']) : '';
  }

  /* =================================================================
     Бюджеты
     ================================================================= */
  function renderBudgets() {
    var list = monthTx(state.month);
    var spent = {};
    list.forEach(function (t) { if (t.type === 'expense') spent[t.category] = (spent[t.category] || 0) + t.amount; });
    var limits = state.settings.limits;
    var limSum = 0, limSpent = 0, overCount = 0, warnCount = 0;

    var rows = D.categories.expense.map(function (c) {
      var lim = limits[c.id] || 0, s = spent[c.id] || 0;
      if (lim) {
        limSum += lim; limSpent += s;
        if (s > lim) overCount++; else if (s >= lim * 0.8) warnCount++;
      }
      return { c: c, lim: lim, s: s, p: lim ? s / lim : 0 };
    });
    rows.sort(function (a, b) {
      if (!!a.lim !== !!b.lim) return a.lim ? -1 : 1;
      if (a.lim) return b.p - a.p;
      return b.s - a.s;
    });

    var remain = limSum - limSpent;
    var totalMeter = $('#budget-total-meter');
    totalMeter.classList.remove('meter--warn', 'meter--over');
    var tp = limSum ? limSpent / limSum : 0;
    if (tp > 1) totalMeter.classList.add('meter--over'); else if (tp >= 0.8) totalMeter.classList.add('meter--warn');
    $('.meter__fill', totalMeter).style.setProperty('--p', Math.min(tp, 1).toFixed(3));
    totalMeter.hidden = !limSum;
    if (!limSum) {
      $('#budget-total-label').textContent = 'Лимиты пока не заданы';
      $('#budget-total-value').textContent = money(0);
      $('#budget-total-note').innerHTML = icon('info') + '<span>Задайте лимит для любой категории ниже, и здесь появится остаток на месяц.</span>';
    } else {
      $('#budget-total-label').textContent = remain >= 0 ? 'Осталось в лимитах на ' + monthLower(state.month) : 'Перерасход по лимитам за ' + monthLower(state.month);
      $('#budget-total-value').textContent = money(Math.abs(remain));
      var note = 'Потрачено ' + money(limSpent) + ' из ' + money(limSum) + ' в категориях с лимитом.';
      var ic = 'circle-check';
      if (overCount) { note += ' Превышено: ' + overCount + ' ' + plural(overCount, ['категория', 'категории', 'категорий']) + '.'; ic = 'octagon-alert'; }
      else if (warnCount) { note += ' Почти исчерпано: ' + warnCount + ' ' + plural(warnCount, ['категория', 'категории', 'категорий']) + '.'; ic = 'triangle-alert'; }
      $('#budget-total-note').innerHTML = icon(ic) + '<span>' + esc(note) + '</span>';
    }

    $('#budget-list').innerHTML = rows.map(function (r) {
      var c = r.c;
      if (!r.lim) {
        return '<li class="budget budget--none"><div class="budget__top">' +
          '<span class="budget__tile" aria-hidden="true">' + icon(c.icon) + '</span>' +
          '<span><span class="budget__name">' + esc(c.name) + '</span><br><span class="budget__nums">' + (r.s ? 'Потрачено ' + esc(money(r.s)) + ', лимит не задан' : 'Лимит не задан') + '</span></span>' +
          '<button class="btn btn--secondary budget__edit" type="button" data-limit="' + c.id + '" aria-label="Задать лимит: ' + esc(c.name) + '">Задать лимит</button>' +
          '</div></li>';
      }
      var cls = '', st;
      if (r.s > r.lim) { cls = 'over'; st = icon('octagon-alert') + 'Превышен на ' + esc(money(r.s - r.lim)); }
      else if (r.s === r.lim) { cls = 'over'; st = icon('octagon-alert') + 'Лимит исчерпан'; }
      else if (r.p >= 0.8) { cls = 'warn'; st = icon('triangle-alert') + 'Почти исчерпан: ' + Math.floor(r.p * 100) + '%, осталось ' + esc(money(r.lim - r.s)); }
      else { st = icon('circle-check') + 'Осталось ' + esc(money(r.lim - r.s)) + ', использовано ' + Math.floor(r.p * 100) + '%'; }
      return '<li class="budget"><div class="budget__top">' +
        '<span class="budget__tile" aria-hidden="true">' + icon(c.icon) + '</span>' +
        '<span><span class="budget__name">' + esc(c.name) + '</span><br><span class="budget__nums"><strong>' + esc(money(r.s)) + '</strong> из ' + esc(money(r.lim)) + '</span></span>' +
        '<button class="btn btn--secondary budget__edit" type="button" data-limit="' + c.id + '" aria-label="Изменить лимит: ' + esc(c.name) + '">Изменить</button>' +
        '</div>' +
        '<div class="meter' + (cls ? ' meter--' + cls : '') + '" aria-hidden="true"><span class="meter__fill" style="--p:' + Math.min(r.p, 1).toFixed(3) + '"></span></div>' +
        '<p class="budget__status' + (cls ? ' budget__status--' + cls : '') + '">' + st + '</p>' +
        '</li>';
    }).join('');
  }

  /* =================================================================
     Настройки
     ================================================================= */
  function renderSettings() {
    $$('input[name="theme"]').forEach(function (r) { r.checked = r.value === state.settings.theme; });
    var cg = $('#currency-group');
    if (!cg.children.length) {
      cg.innerHTML = D.currencies.map(function (c) {
        return '<label class="segmented__item"><input type="radio" name="currency" value="' + c.id + '"><span>' + esc(c.symbol) + ' ' + esc(c.name) + '</span></label>';
      }).join('');
    }
    $$('input[name="currency"]').forEach(function (r) { r.checked = r.value === state.settings.currency; });
    $('#show-cents').checked = !!state.settings.cents;
    var kinds = { indexeddb: 'IndexedDB', localstorage: 'localStorage', memory: 'памяти до перезагрузки: хранилище браузера недоступно' };
    $('#settings-storage').textContent = 'Данные хранятся на этом устройстве, в ' + (kinds[state.db ? state.db.kind : 'memory']);
    $$('.amount__cur, #limit-cur').forEach(function (el) { el.textContent = currency().symbol; });
  }

  function renderAll() {
    renderMonthbar();
    updateMonthbarVisibility();
    renderOverview();
    renderCategorySelect();
    renderOps();
    renderBudgets();
    renderSettings();
  }

  /* =================================================================
     Снэкбар с отменой
     ================================================================= */
  var snack = { timer: null, left: 0, started: 0, onUndo: null, onExpire: null };

  function showSnack(text, onUndo, onExpire) {
    finishSnack(false);
    var el = $('#snackbar');
    $('#snackbar-text').textContent = text;
    $('#snackbar-action').hidden = !onUndo;
    snack.onUndo = onUndo || null;
    snack.onExpire = onExpire || null;
    var timer = $('#snackbar-timer');
    var fresh = timer.cloneNode(true);
    timer.parentNode.replaceChild(fresh, timer);
    el.classList.remove('is-paused');
    el.hidden = false;
    snack.left = SNACK_MS;
    runSnack();
  }
  function runSnack() {
    snack.started = Date.now();
    clearTimeout(snack.timer);
    snack.timer = setTimeout(function () { finishSnack(true); }, snack.left);
  }
  function pauseSnack() {
    if ($('#snackbar').hidden || !snack.timer) return;
    clearTimeout(snack.timer); snack.timer = null;
    snack.left = Math.max(800, snack.left - (Date.now() - snack.started));
    $('#snackbar').classList.add('is-paused');
  }
  function resumeSnack() {
    if ($('#snackbar').hidden || snack.timer) return;
    $('#snackbar').classList.remove('is-paused');
    runSnack();
  }
  function finishSnack(expired) {
    clearTimeout(snack.timer); snack.timer = null;
    var cb = snack.onExpire;
    snack.onUndo = null; snack.onExpire = null;
    var el = $('#snackbar');
    if (el.contains(document.activeElement)) {
      var h = $('#screen-' + state.route + ' h1');
      if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
    }
    el.hidden = true;
    if (expired && cb) cb();
  }

  /* =================================================================
     Операции: удаление и восстановление
     ================================================================= */
  function findTx(id) { for (var i = 0; i < state.tx.length; i++) if (state.tx[i].id === id) return state.tx[i]; return null; }

  function deleteTx(id, focusAfter) {
    var t = findTx(id);
    if (!t) return;
    var nextFocus = null;
    if (focusAfter) {
      var li = document.querySelector('#ops-list .tx[data-id="' + cssEsc(id) + '"]');
      var all = $$('#ops-list .tx');
      var i = all.indexOf(li);
      var neighbor = all[i + 1] || all[i - 1];
      if (neighbor) nextFocus = neighbor.dataset.id;
    }
    state.tx = state.tx.filter(function (x) { return x.id !== id; });
    state.db.remove(id).catch(function () {});
    renderAll();
    var c = catOf(t.type, t.category);
    showSnack('Запись удалена: ' + c.name + ', ' + money(t.amount), function () {
      state.tx.push(t);
      state.db.put(t).catch(function () {});
      renderAll();
      finishSnack(false);
      var btn = document.querySelector('[data-edit="' + cssEsc(t.id) + '"]');
      if (btn) btn.focus();
      $('#ops-live').textContent = 'Запись восстановлена';
    });
    if (focusAfter) {
      var target = nextFocus && document.querySelector('#ops-list [data-edit="' + cssEsc(nextFocus) + '"]');
      if (target) target.focus();
      else { var h = $('#ops-title'); h.setAttribute('tabindex', '-1'); h.focus(); }
    }
  }

  function cssEsc(s) { return window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/"/g, '\\"'); }

  /* Свайп влево для удаления (тач и мышь) */
  function initSwipe() {
    var list = $('#ops-list');
    var drag = null;
    list.addEventListener('pointerdown', function (e) {
      var front = e.target.closest('.tx__front');
      if (!front || e.target.closest('.tx__del') || (e.pointerType === 'mouse' && e.button !== 0)) return;
      drag = { li: front.parentNode, front: front, x: e.clientX, y: e.clientY, dx: 0, active: false, id: e.pointerId };
    });
    list.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.active) {
        if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.3 && dx < 0) {
          drag.active = true;
          drag.li.classList.add('is-dragging', 'is-swiping');
          try { drag.front.setPointerCapture(e.pointerId); } catch (err) { /* нет захвата указателя */ }
        } else if (Math.abs(dy) > 10) { drag = null; return; }
      }
      if (drag.active) {
        drag.dx = Math.min(0, dx);
        drag.front.style.transform = 'translateX(' + drag.dx + 'px)';
      }
    });
    function end() {
      if (!drag) return;
      var d = drag; drag = null;
      if (!d.active) return;
      d.li.classList.remove('is-dragging');
      var w = d.li.offsetWidth;
      d.li._swallowClick = true;
      setTimeout(function () { d.li._swallowClick = false; }, 50);
      if (d.dx < -w * 0.35) {
        d.front.style.transform = 'translateX(-100%)';
        setTimeout(function () { deleteTx(d.li.dataset.id, true); }, 180);
      } else {
        d.front.style.transform = '';
        setTimeout(function () { d.li.classList.remove('is-swiping'); }, 220);
      }
    }
    list.addEventListener('pointerup', end);
    list.addEventListener('pointercancel', end);
    list.addEventListener('click', function (e) {
      var li = e.target.closest('.tx');
      if (li && li._swallowClick) { e.preventDefault(); e.stopPropagation(); }
    }, true);
  }

  /* =================================================================
     Диалоги: общее
     ================================================================= */
  var returnFocus = new WeakMap();
  function openDialog(dlg, focusEl) {
    returnFocus.set(dlg, document.activeElement);
    dlg.showModal();
    if (focusEl) focusEl.focus();
  }
  function closeDialog(dlg) { if (dlg.open) dlg.close(); }
  function wireDialog(dlg) {
    dlg.addEventListener('close', function () {
      var el = returnFocus.get(dlg);
      if (el && document.contains(el) && el.offsetParent !== null) el.focus();
      else { var h = $('#screen-' + state.route + ' h1'); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); } }
    });
    dlg.addEventListener('click', function (e) {
      if (e.target === dlg) closeDialog(dlg);
      if (e.target.closest('[data-close]')) closeDialog(dlg);
    });
  }

  /* =================================================================
     Добавление / редактирование
     ================================================================= */
  var coarse = window.matchMedia('(pointer: coarse)');
  function txType() { var r = $('input[name="tx-type"]:checked'); return r ? r.value : 'expense'; }

  function renderCatChips(type, selected) {
    $('#tx-cats-list').innerHTML = D.categories[type].map(function (c) {
      return '<label class="chip"><input type="radio" name="tx-cat" value="' + c.id + '"' + (c.id === selected ? ' checked' : '') + '>' +
        '<span>' + icon(c.icon) + esc(c.name) + '</span></label>';
    }).join('');
  }

  function setAmountRaw(raw) {
    state.amountRaw = normalizeRaw(raw);
    $('#tx-amount').value = groupRaw(state.amountRaw);
    clearAmountError();
  }
  function clearAmountError() {
    $('#amount-error').hidden = true;
    $('#tx-amount').removeAttribute('aria-invalid');
    $('#amount-wrap').classList.remove('amount--error');
  }
  function syncType() {
    var type = txType();
    $('#amount-sign').textContent = type === 'income' ? '+' : MINUS;
    $('#amount-wrap').classList.toggle('amount--income', type === 'income');
  }

  function openSheet(t) {
    var dlg = $('#tx-dialog');
    state.editing = t ? t.id : null;
    var type = t ? t.type : 'expense';
    $$('input[name="tx-type"]').forEach(function (r) { r.checked = r.value === type; });
    renderCatChips(type, t ? t.category : state.lastCat[type]);
    if (!$('input[name="tx-cat"]:checked')) { var first = $('input[name="tx-cat"]'); if (first) first.checked = true; }
    setAmountRaw(t ? rawFromMinor(t.amount) : '');
    $('#tx-date').value = t ? t.date : defaultDate();
    $('#tx-note').value = t ? (t.note || '') : '';
    $('#tx-title').textContent = t ? 'Изменить запись' : 'Новая запись';
    $('#tx-delete').hidden = !t;
    $('#tx-save').removeAttribute('aria-busy');
    $('.btn__text', $('#tx-save')).textContent = t ? 'Сохранить изменения' : 'Сохранить';
    var amt = $('#tx-amount');
    amt.setAttribute('inputmode', coarse.matches ? 'none' : 'decimal');
    syncType();
    openDialog(dlg, amt);
  }

  /* По умолчанию сегодня; если смотрим прошлый месяц, последний день того месяца */
  function defaultDate() {
    if (state.month === currentMonth()) return today();
    return state.month + '-' + pad2(daysIn(state.month));
  }

  function submitTx(e) {
    e.preventDefault();
    var minor = parseAmount(state.amountRaw);
    var errText = $('#amount-error-text');
    if (!state.amountRaw || isNaN(minor) || minor <= 0) {
      errText.textContent = 'Введите сумму больше нуля, например 450';
    } else if (minor > 100000000 * 100) {
      errText.textContent = 'Слишком большая сумма. Максимум 100 000 000';
      minor = NaN;
    } else errText.textContent = '';
    if (!errText.textContent) {
      /* ок */
    } else {
      $('#amount-error').hidden = false;
      $('#tx-amount').setAttribute('aria-invalid', 'true');
      $('#amount-wrap').classList.add('amount--error');
      $('#tx-amount').focus();
      return;
    }
    var type = txType();
    var catInput = $('input[name="tx-cat"]:checked');
    var cat = catInput ? catInput.value : D.categories[type][0].id;
    var date = $('#tx-date').value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) date = today();
    var old = state.editing ? findTx(state.editing) : null;
    var t = {
      id: old ? old.id : uid(),
      type: type,
      amount: minor,
      category: cat,
      date: date,
      note: $('#tx-note').value.trim().slice(0, 80),
      createdAt: old ? old.createdAt : Date.now()
    };
    var btn = $('#tx-save');
    btn.setAttribute('aria-busy', 'true');
    state.lastCat[type] = cat;
    state.db.setKV('lastCat', state.lastCat).catch(function () {});
    state.db.put(t).then(function () {
      if (old) state.tx = state.tx.map(function (x) { return x.id === t.id ? t : x; });
      else state.tx.push(t);
      if (monthOf(t.date) !== state.month) state.month = monthOf(t.date) > currentMonth() ? currentMonth() : monthOf(t.date);
      btn.removeAttribute('aria-busy');
      closeDialog($('#tx-dialog'));
      renderAll();
      var c = catOf(t.type, t.category);
      showSnack((old ? 'Изменено: ' : 'Сохранено: ') + c.name + ', ' + (t.type === 'income' ? '+' : MINUS) + money(t.amount, 'none'));
    }).catch(function () {
      btn.removeAttribute('aria-busy');
      errText.textContent = 'Не удалось сохранить. Проверьте, что браузер разрешает хранить данные сайта';
      $('#amount-error').hidden = false;
    });
  }

  function initSheet() {
    var dlg = $('#tx-dialog');
    wireDialog(dlg);
    $('#tx-form').addEventListener('submit', submitTx);
    $('#tx-type').addEventListener('change', function () {
      var type = txType();
      renderCatChips(type, state.lastCat[type]);
      if (!$('input[name="tx-cat"]:checked')) $('input[name="tx-cat"]').checked = true;
      syncType();
    });
    $('#tx-amount').addEventListener('input', function (e) {
      var el = e.target;
      var atEnd = el.selectionStart === el.value.length;
      state.amountRaw = normalizeRaw(el.value);
      var grouped = groupRaw(state.amountRaw);
      if (grouped !== el.value) {
        el.value = grouped;
        if (atEnd) el.setSelectionRange(grouped.length, grouped.length);
      }
      clearAmountError();
    });
    $('#keypad').addEventListener('click', function (e) {
      var k = e.target.closest('[data-key]');
      if (!k) return;
      var key = k.dataset.key;
      if (key === 'back') setAmountRaw(state.amountRaw.slice(0, -1));
      else if (key === ',') { if (state.amountRaw.indexOf(',') < 0) setAmountRaw((state.amountRaw || '0') + ','); }
      else setAmountRaw(state.amountRaw + key);
    });
    $('#tx-delete').addEventListener('click', function () {
      var id = state.editing;
      closeDialog(dlg);
      if (id) deleteTx(id, false);
    });
  }

  /* =================================================================
     Лимиты
     ================================================================= */
  function openLimit(catId) {
    var c = catOf('expense', catId);
    state.limitCat = catId;
    var cur = state.settings.limits[catId] || 0;
    $('#limit-title').textContent = 'Лимит: ' + c.name;
    $('#limit-input').value = cur ? groupRaw(rawFromMinor(cur)) : '';
    $('#limit-remove').hidden = !cur;
    $('#limit-error').hidden = true;
    $('#limit-input').removeAttribute('aria-invalid');
    openDialog($('#limit-dialog'), $('#limit-input'));
  }

  function initLimit() {
    var dlg = $('#limit-dialog');
    wireDialog(dlg);
    $('#limit-input').addEventListener('input', function (e) {
      var v = groupRaw(normalizeRaw(e.target.value));
      if (v !== e.target.value) e.target.value = v;
      $('#limit-error').hidden = true;
      e.target.removeAttribute('aria-invalid');
    });
    $('#limit-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var minor = parseAmount(normalizeRaw($('#limit-input').value));
      if (isNaN(minor) || minor <= 0) {
        $('#limit-error').hidden = false;
        $('#limit-input').setAttribute('aria-invalid', 'true');
        $('#limit-input').focus();
        return;
      }
      state.settings.limits[state.limitCat] = minor;
      persistSettings();
      closeDialog(dlg);
      renderAll();
      showSnack('Лимит сохранён: ' + catOf('expense', state.limitCat).name + ', ' + money(minor));
    });
    $('#limit-remove').addEventListener('click', function () {
      delete state.settings.limits[state.limitCat];
      persistSettings();
      closeDialog(dlg);
      renderAll();
      showSnack('Лимит убран: ' + catOf('expense', state.limitCat).name);
    });
  }

  /* =================================================================
     Подтверждение (удаление всех данных, замена демо-данными)
     ================================================================= */
  function openConfirm(opts) {
    state.confirmAction = opts.onConfirm;
    state.confirmTyped = !!opts.typed;
    $('#confirm-title').textContent = opts.title;
    $('#confirm-text').textContent = opts.text;
    $('#confirm-ok').textContent = opts.ok;
    $('#confirm-field').hidden = !opts.typed;
    $('#confirm-input').value = '';
    $('#confirm-input').removeAttribute('aria-invalid');
    $('#confirm-error').hidden = true;
    openDialog($('#confirm-dialog'), opts.typed ? $('#confirm-input') : $('#confirm-dialog [data-close]'));
  }

  function initConfirm() {
    var dlg = $('#confirm-dialog');
    wireDialog(dlg);
    $('#confirm-input').addEventListener('input', function () {
      $('#confirm-error').hidden = true;
      $('#confirm-input').removeAttribute('aria-invalid');
    });
    $('#confirm-form').addEventListener('submit', function (e) {
      e.preventDefault();
      if (state.confirmTyped && $('#confirm-input').value.trim().toLowerCase() !== WIPE_WORD) {
        $('#confirm-error').hidden = false;
        $('#confirm-input').setAttribute('aria-invalid', 'true');
        $('#confirm-input').focus();
        return;
      }
      var fn = state.confirmAction;
      closeDialog(dlg);
      if (fn) fn();
    });
  }

  function wipeAll() {
    return state.db.clearAll().then(function () {
      state.tx = [];
      state.settings = clone(DEFAULT_SETTINGS);
      state.month = currentMonth();
      state.filters = { q: '', type: 'all', cat: 'all' };
      applyTheme();
      renderAll();
      location.hash = '#/overview';
      showRoute(true);
      showSnack('Все данные удалены');
    });
  }

  /* =================================================================
     Демо-данные
     ================================================================= */
  function rng(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function buildDemo() {
    var demo = D.demo;
    var now = parseISO(today());
    var out = [];
    var rand = rng(20260923);
    function add(ym, day, type, category, rub, note) {
      var iso = ym + '-' + pad2(day);
      out.push({
        id: uid() + out.length,
        type: type, category: category,
        amount: Math.round(rub * 100),
        date: iso, note: note || '',
        createdAt: parseISO(iso).getTime() + Math.floor(rand() * 12 + 8) * 36e5
      });
    }
    for (var off = -2; off <= 0; off++) {
      var ym = shiftMonth(currentMonth(), off);
      var dim = daysIn(ym);
      var maxDay = off === 0 ? now.getDate() : dim;
      demo.fixed.forEach(function (f) { if (f.day <= maxDay) add(ym, f.day, f.type, f.category, f.amount, f.note); });
      demo.extraIncome.forEach(function (f) { if (f.monthOffset === off && f.day <= maxDay) add(ym, f.day, 'income', f.category, f.amount, f.note); });
      demo.random.forEach(function (r) {
        var times = Math.max(off === 0 ? 1 : r.times, Math.round(r.times * maxDay / dim));
        if (off === 0) times = Math.round(r.times * maxDay / dim) || (maxDay > 5 ? 1 : 0);
        for (var i = 0; i < times; i++) {
          var day = 1 + Math.floor(rand() * maxDay);
          var raw = r.min + rand() * (r.max - r.min);
          var rub = raw > 1000 ? Math.round(raw / 10) * 10 : Math.round(raw);
          var note = r.notes[Math.floor(rand() * r.notes.length)];
          add(ym, day, r.type, r.category, rub, note);
        }
      });
    }
    var limits = {};
    Object.keys(demo.limits).forEach(function (k) { limits[k] = demo.limits[k] * 100; });
    return { tx: out, limits: limits };
  }

  function fillDemo() {
    var d = buildDemo();
    state.tx = d.tx;
    state.settings.limits = d.limits;
    return Promise.all([state.db.replaceAll(d.tx), persistSettings()]).then(function () {
      state.month = currentMonth();
      state.filters = { q: '', type: 'all', cat: 'all' };
      renderAll();
      if (location.hash !== '#/overview' && location.hash !== '') location.hash = '#/overview';
      else showRoute(false);
      showSnack('Добавлено ' + d.tx.length + ' демо-' + plural(d.tx.length, ['запись', 'записи', 'записей']) + ' за три месяца');
    });
  }

  function requestDemo() {
    if (!state.tx.length) { fillDemo(); return; }
    openConfirm({
      title: 'Заменить записи демо-данными?',
      text: 'Сейчас сохранено ' + state.tx.length + ' ' + plural(state.tx.length, ['запись', 'записи', 'записей']) + '. Они будут удалены и заменены демо-данными, лимиты тоже.',
      ok: 'Удалить и заменить',
      typed: false,
      onConfirm: fillDemo
    });
  }

  /* =================================================================
     Экспорт / импорт
     ================================================================= */
  function exportJSON() {
    var btn = $('#export-btn');
    btn.setAttribute('aria-busy', 'true');
    var data = {
      app: 'kopilka',
      version: D.version,
      exportedAt: new Date().toISOString(),
      settings: state.settings,
      transactions: state.tx.slice().sort(byNewest)
    };
    try {
      var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'kopilka-' + today() + '.json';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      showSnack('Файл kopilka-' + today() + '.json сохранён в загрузки');
    } catch (err) {
      showSnack('Не удалось создать файл экспорта');
    }
    setTimeout(function () { btn.removeAttribute('aria-busy'); }, 400);
  }

  function validateImport(text) {
    var data;
    try { data = JSON.parse(text); } catch (e) {
      throw new Error('Файл не читается как JSON. Выберите резервную копию, сохранённую кнопкой «Экспорт JSON».');
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('В файле нет объекта с данными Копилки. Выберите файл kopilka-ГГГГ-ММ-ДД.json.');
    if (data.app && data.app !== 'kopilka') throw new Error('Это резервная копия другого приложения («' + String(data.app).slice(0, 30) + '»).');
    if (!Array.isArray(data.transactions)) throw new Error('В файле нет списка записей (поле transactions). Похоже, это не резервная копия Копилки.');
    var seen = {};
    var tx = data.transactions.map(function (t, i) {
      var n = 'Запись №' + (i + 1) + ': ';
      if (!t || typeof t !== 'object') throw new Error(n + 'ожидался объект.');
      if (t.type !== 'expense' && t.type !== 'income') throw new Error(n + 'тип должен быть expense или income.');
      if (typeof t.amount !== 'number' || !isFinite(t.amount) || t.amount <= 0 || Math.round(t.amount) !== t.amount) throw new Error(n + 'сумма должна быть целым числом копеек больше нуля.');
      if (!D.categories[t.type].some(function (c) { return c.id === t.category; })) throw new Error(n + 'неизвестная категория «' + String(t.category).slice(0, 30) + '».');
      if (typeof t.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(t.date) || isNaN(parseISO(t.date).getTime())) throw new Error(n + 'дата должна быть в формате ГГГГ-ММ-ДД.');
      var id = typeof t.id === 'string' && t.id && !seen[t.id] ? t.id : uid() + i;
      seen[id] = true;
      return { id: id, type: t.type, amount: t.amount, category: t.category, date: t.date, note: typeof t.note === 'string' ? t.note.slice(0, 80) : '', createdAt: Number(t.createdAt) || parseISO(t.date).getTime() };
    });
    var s = clone(DEFAULT_SETTINGS);
    if (data.settings && typeof data.settings === 'object') {
      if (D.currencies.some(function (c) { return c.id === data.settings.currency; })) s.currency = data.settings.currency;
      if (['system', 'light', 'dark'].indexOf(data.settings.theme) >= 0) s.theme = data.settings.theme;
      s.cents = !!data.settings.cents;
      var lim = data.settings.limits;
      if (lim && typeof lim === 'object') {
        Object.keys(lim).forEach(function (k) {
          if (D.categories.expense.some(function (c) { return c.id === k; }) && typeof lim[k] === 'number' && lim[k] > 0) s.limits[k] = Math.round(lim[k]);
        });
      }
    }
    return { tx: tx, settings: s };
  }

  function importFile(file) {
    var err = $('#import-error'), ok = $('#import-ok'), label = $('#import-btn');
    err.hidden = true; ok.hidden = true;
    if (!file) return;
    label.setAttribute('aria-busy', 'true');
    var done = function () { label.removeAttribute('aria-busy'); $('#import-file').value = ''; };
    if (file.size > 5 * 1024 * 1024) {
      $('#import-error-text').textContent = 'Файл больше 5 МБ. Резервная копия Копилки обычно весит несколько десятков килобайт.';
      err.hidden = false; done(); return;
    }
    file.text().then(function (text) {
      var res = validateImport(text);
      return Promise.all([state.db.replaceAll(res.tx), state.db.setKV('settings', res.settings)]).then(function () {
        state.tx = res.tx;
        state.settings = res.settings;
        state.month = currentMonth();
        applyTheme();
        renderAll();
        $('#import-ok-text').textContent = 'Импортировано ' + res.tx.length + ' ' + plural(res.tx.length, ['запись', 'записи', 'записей']) + '. Лимиты и настройки восстановлены.';
        ok.hidden = false;
      });
    }).catch(function (e) {
      $('#import-error-text').textContent = e && e.message ? e.message : 'Не удалось прочитать файл.';
      err.hidden = false;
    }).then(done);
  }

  /* =================================================================
     PWA: установка, офлайн, service worker
     ================================================================= */
  function isStandalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  }

  function initPWA() {
    var status = $('#install-status');
    var httpish = location.protocol === 'http:' || location.protocol === 'https:';
    if (isStandalone()) status.textContent = 'Копилка установлена и открыта как приложение. Работает без интернета.';
    else if (!httpish) status.textContent = 'Установка и офлайн-режим включаются, когда приложение открыто по адресу https, например на GitHub Pages. С диска всё остальное работает как обычно.';

    var ua = navigator.userAgent || '';
    var ios = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    $('#ios-hint').hidden = !(ios && !isStandalone() && httpish);

    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      state.installEvent = e;
      $$('[data-action="install"]').forEach(function (b) { b.hidden = false; });
    });
    window.addEventListener('appinstalled', function () {
      state.installEvent = null;
      $$('[data-action="install"]').forEach(function (b) { b.hidden = true; });
      showSnack('Копилка установлена. Ищите иконку на экране приложений');
    });

    function net() { $('#offline').hidden = navigator.onLine !== false; }
    window.addEventListener('online', net);
    window.addEventListener('offline', net);
    net();

    if (httpish && 'serviceWorker' in navigator) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('./sw.js').catch(function () { /* без офлайна, но приложение работает */ });
      });
    }
  }

  function promptInstall() {
    var ev = state.installEvent;
    if (!ev) return;
    ev.prompt();
    ev.userChoice.then(function (choice) {
      state.installEvent = null;
      $$('[data-action="install"]').forEach(function (b) { b.hidden = true; });
      if (choice && choice.outcome === 'dismissed') showSnack('Установку можно повторить позже из меню браузера');
    }).catch(function () {});
  }

  /* =================================================================
     События
     ================================================================= */
  function bind() {
    window.addEventListener('hashchange', function () { showRoute(true); });

    document.addEventListener('click', function (e) {
      var a = e.target.closest('[data-action]');
      if (a) {
        var act = a.dataset.action;
        if (act === 'add') openSheet(null);
        else if (act === 'demo') requestDemo();
        else if (act === 'install') promptInstall();
        return;
      }
      var ed = e.target.closest('[data-edit]');
      if (ed) { var t = findTx(ed.dataset.edit); if (t) openSheet(t); return; }
      var del = e.target.closest('[data-del]');
      if (del) { deleteTx(del.dataset.del, true); return; }
      var lim = e.target.closest('[data-limit]');
      if (lim) { openLimit(lim.dataset.limit); return; }
    });

    $('#month-prev').addEventListener('click', function () { state.month = shiftMonth(state.month, -1); hidePace(); renderAll(); });
    $('#month-next').addEventListener('click', function () {
      if (state.month < currentMonth()) { state.month = shiftMonth(state.month, 1); hidePace(); renderAll(); }
      if ($('#month-next').disabled) $('#month-prev').focus();
    });

    /* Легенда диаграммы */
    var donut = $('#donut');
    donut.addEventListener('pointerover', function (e) {
      var el = e.target.closest('[data-key]');
      if (el) setDonutActive(el.dataset.key);
    });
    donut.addEventListener('pointerleave', function () { if (!donut.contains(document.activeElement)) setDonutActive(null); });
    donut.addEventListener('focusin', function (e) { var el = e.target.closest('[data-key]'); if (el) setDonutActive(el.dataset.key); });
    donut.addEventListener('focusout', function () { setTimeout(function () { if (!donut.contains(document.activeElement)) setDonutActive(null); }, 0); });
    $('#donut-legend').addEventListener('click', function (e) {
      var b = e.target.closest('.legend__btn');
      if (!b) return;
      state.filters = { q: '', type: 'expense', cat: b.dataset.cat ? 'expense:' + b.dataset.cat : 'all' };
      renderCategorySelect();
      renderOps();
      location.hash = '#/ops';
    });

    /* График темпа */
    var pace = $('#pace');
    pace.addEventListener('pointermove', function (e) { showPaceDay(dayFromPointer(e)); });
    pace.addEventListener('pointerleave', function () { if (document.activeElement !== pace) hidePace(); });
    pace.addEventListener('focus', function () { var m = pace._m; showPaceDay(state.paceDay || (m ? m.last : 1)); });
    pace.addEventListener('blur', hidePace);
    pace.addEventListener('keydown', function (e) {
      var m = pace._m; if (!m) return;
      var d = state.paceDay || m.last;
      if (e.key === 'ArrowLeft') d--;
      else if (e.key === 'ArrowRight') d++;
      else if (e.key === 'Home') d = 1;
      else if (e.key === 'End') d = m.maxDays;
      else if (e.key === 'Escape') { hidePace(); return; }
      else return;
      e.preventDefault();
      showPaceDay(d);
    });
    if (window.ResizeObserver) {
      var lastW = 0;
      new ResizeObserver(function () {
        var w = pace.clientWidth;
        if (w && w !== lastW && state.tx.length) { lastW = w; renderPace(); }
      }).observe(pace);
    }

    /* Фильтры операций */
    var searchTimer;
    $('#ops-search').addEventListener('input', function (e) {
      clearTimeout(searchTimer);
      var v = e.target.value;
      searchTimer = setTimeout(function () { state.filters.q = v; renderOps(); }, 150);
    });
    $('#ops-type').addEventListener('change', function (e) {
      state.filters.type = e.target.value;
      renderCategorySelect();
      renderOps();
    });
    $('#ops-category').addEventListener('change', function (e) { state.filters.cat = e.target.value; renderOps(); });
    $('#ops-reset').addEventListener('click', function (e) {
      if (e.currentTarget.dataset.mode === 'add') { openSheet(null); return; }
      state.filters = { q: '', type: 'all', cat: 'all' };
      renderCategorySelect();
      renderOps();
      $('#ops-search').focus();
    });

    /* Настройки */
    document.querySelector('.settings').addEventListener('change', function (e) {
      var el = e.target;
      if (el.name === 'theme') { state.settings.theme = el.value; applyTheme(); persistSettings(); }
      else if (el.name === 'currency') { state.settings.currency = el.value; persistSettings(); renderAll(); }
      else if (el.id === 'show-cents') { state.settings.cents = el.checked; persistSettings(); renderAll(); }
      else if (el.id === 'import-file') importFile(el.files && el.files[0]);
    });
    $('#import-btn').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#import-file').click(); }
    });
    $('#export-btn').addEventListener('click', exportJSON);
    $('#wipe-btn').addEventListener('click', function () {
      openConfirm({
        title: 'Удалить все данные?',
        text: 'Будут удалены ' + state.tx.length + ' ' + plural(state.tx.length, ['запись', 'записи', 'записей']) + ', все лимиты и настройки на этом устройстве. Вернуть их можно только из файла экспорта.',
        ok: 'Удалить все данные',
        typed: true,
        onConfirm: wipeAll
      });
    });

    /* Снэкбар */
    var sb = $('#snackbar');
    sb.addEventListener('mouseenter', pauseSnack);
    sb.addEventListener('mouseleave', resumeSnack);
    sb.addEventListener('focusin', pauseSnack);
    sb.addEventListener('focusout', resumeSnack);
    $('#snackbar-action').addEventListener('click', function () { if (snack.onUndo) snack.onUndo(); });

    /* Быстрое добавление с клавиатуры: клавиша N вне полей ввода */
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'n' && e.key !== 'N' && e.key !== 'т' && e.key !== 'Т') return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      var tag = (document.activeElement && document.activeElement.tagName) || '';
      if (/INPUT|TEXTAREA|SELECT/.test(tag) || document.querySelector('dialog[open]')) return;
      e.preventDefault();
      openSheet(null);
    });

    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      var onScheme = function () { if (state.tx.length) renderPace(); };
      if (mq.addEventListener) mq.addEventListener('change', onScheme);
    }
  }

  /* =================================================================
     Старт
     ================================================================= */
  function start() {
    state.month = currentMonth();
    initPWA();
    bind();
    initSwipe();
    initSheet();
    initLimit();
    initConfirm();
    loadAll().catch(function () {
      state.db = state.db || { kind: 'memory', getAll: function () { return Promise.resolve([]); }, put: function () { return Promise.resolve(); }, remove: function () { return Promise.resolve(); }, replaceAll: function () { return Promise.resolve(); }, getKV: function () { return Promise.resolve(); }, setKV: function () { return Promise.resolve(); }, clearAll: function () { return Promise.resolve(); } };
    }).then(function () {
      applyTheme();
      /* ?demo в адресе: сразу показать приложение с демо-данными (ссылка для портфолио) */
      if (!state.tx.length && /(^|[?&])demo\b/.test(location.search)) return fillDemo();
    }).then(function () {
      renderAll();
      showRoute(false);
      document.documentElement.classList.add('is-ready');
    });
  }

  start();
})();
