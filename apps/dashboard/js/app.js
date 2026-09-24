/*
  Утро. Аналитика продаж: логика дашборда.
  Все графики рисуются вручную в SVG. Цвета берутся только из CSS-токенов
  через классы (s-1..s-5, h-1..h-6 и т. п.), поэтому тема меняется без перерисовки.
*/
(function () {
  'use strict';

  var D = window.APP_DATA;
  var H = D.hours.length;
  var NI = D.items.length;
  var ND = D.days.length;
  var STORE_KEY = 'utro-dashboard';
  var THEME_KEY = 'utro-theme';

  /* ---------------------------------------------------------------------
     Утилиты
     --------------------------------------------------------------------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function fin(v) { return typeof v === 'number' && isFinite(v); }

  var NBSP = ' ';
  var MINUS = '−';
  var nf0 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
  var nf1 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  var nf2 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function num(v) { return nf0.format(Math.round(v)); }
  function rub(v) { return num(v) + NBSP + '₽'; }
  function compact(v, unit) {
    var a = Math.abs(v), s;
    if (a >= 1e6) {
      var m = v / 1e6;
      s = (Math.abs(m) < 10 ? nf2.format(m) : Math.abs(m) < 100 ? nf1.format(m) : nf0.format(m)) + NBSP + 'млн';
    } else if (a >= 1e3) {
      s = nf0.format(Math.round(v / 1e3)) + NBSP + 'тыс.';
    } else {
      s = nf0.format(Math.round(v));
    }
    return unit === false ? s : s + NBSP + '₽';
  }
  function axisLabel(v) {
    if (v === 0) return '0';
    if (v >= 1e6) return nf1.format(v / 1e6).replace(/,0$/, '') + NBSP + 'млн';
    return nf0.format(Math.round(v / 1e3)) + NBSP + 'тыс.';
  }
  function pct(v) { return nf1.format(Math.abs(v)) + '%'; }
  function signedPct(v) { return (v > 0 ? '+' : v < 0 ? MINUS : '') + pct(v); }
  function plural(n, one, few, many) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }

  var MON_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  var MON_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  var DOW_FULL = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];
  var DOW_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  var DOW_IN = ['в понедельник', 'во вторник', 'в среду', 'в четверг', 'в пятницу', 'в субботу', 'в воскресенье'];

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function dayLong(i) { var d = D.days[i].date; return d.getDate() + NBSP + MON_GEN[d.getMonth()]; }
  function dayShort(i) { var d = D.days[i].date; return d.getDate() + NBSP + MON_SHORT[d.getMonth()]; }
  function dayYear(i) { return dayLong(i) + ' ' + D.days[i].date.getFullYear(); }
  function rangeText(a, b) {
    if (a === b) return dayLong(a);
    var da = D.days[a].date, db = D.days[b].date;
    if (da.getMonth() === db.getMonth()) return 'с ' + da.getDate() + ' по ' + dayLong(b);
    return 'с ' + dayLong(a) + ' по ' + dayLong(b);
  }
  function hourText(h) { return h + ':00' + '-' + (h + 1) + ':00'; }

  var keyIndex = {};
  D.days.forEach(function (d, i) { keyIndex[d.key] = i; });

  function storageGet(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function storageSet(key, val) { try { localStorage.setItem(key, val); } catch (e) { /* без хранилища: только текущая сессия */ } }

  function icon(id, cls) {
    return '<svg class="icon ' + (cls || 'icon--sm') + '" aria-hidden="true"><use href="#i-' + id + '"/></svg>';
  }

  /* ---------------------------------------------------------------------
     Состояние
     --------------------------------------------------------------------- */
  var state = {
    period: '30',
    from: null,
    to: null,
    stores: D.stores.map(function (s, i) { return i; }),
    compare: true,
    mode: 'total',
    tables: { main: false, stores: false, heat: false },
    sort: { key: 'rev', dir: 'desc' }
  };

  (function restore() {
    var raw = storageGet(STORE_KEY);
    if (!raw) return;
    try {
      var s = JSON.parse(raw);
      if (['7', '30', '90', 'custom'].indexOf(s.period) >= 0) state.period = s.period;
      if (s.period === 'custom' && s.from in keyIndex && s.to in keyIndex && keyIndex[s.from] <= keyIndex[s.to]) {
        state.from = keyIndex[s.from]; state.to = keyIndex[s.to];
      } else if (s.period === 'custom') {
        state.period = '30';
      }
      if (Array.isArray(s.stores)) {
        state.stores = D.stores.map(function (st, i) { return s.stores.indexOf(st.id) >= 0 ? i : -1; }).filter(function (i) { return i >= 0; });
      }
      if (typeof s.compare === 'boolean') state.compare = s.compare;
      if (s.mode === 'stores' || s.mode === 'total') state.mode = s.mode;
      if (s.sort && ['name', 'qty', 'rev', 'share', 'delta'].indexOf(s.sort.key) >= 0) state.sort = { key: s.sort.key, dir: s.sort.dir === 'asc' ? 'asc' : 'desc' };
    } catch (e) { /* повреждённые настройки игнорируем */ }
  })();

  function persist() {
    storageSet(STORE_KEY, JSON.stringify({
      period: state.period,
      from: state.from != null ? D.days[state.from].key : null,
      to: state.to != null ? D.days[state.to].key : null,
      stores: state.stores.map(function (i) { return D.stores[i].id; }),
      compare: state.compare,
      mode: state.mode,
      sort: state.sort
    }));
  }

  function getRange() {
    if (state.period === 'custom' && state.from != null) return { a: state.from, b: state.to };
    var n = state.period === 'custom' ? 30 : +state.period;
    return { a: ND - n, b: ND - 1 };
  }

  /* ---------------------------------------------------------------------
     Агрегация
     --------------------------------------------------------------------- */
  function aggregate(a, b, stores) {
    var n = b - a + 1;
    var res = {
      a: a, b: b, n: n, rev: 0, checks: 0, storeDays: 0,
      daily: new Float64Array(n), dailyChecks: new Float64Array(n), dailyOpen: new Uint8Array(n),
      store: D.stores.map(function () {
        return { rev: 0, checks: 0, days: 0, daily: new Float64Array(n).fill(NaN), wdRev: 0, wdDays: 0, weRev: 0, weDays: 0 };
      }),
      heat: [0, 1, 2, 3, 4, 5, 6].map(function () { return new Float64Array(H); }),
      dowCount: [0, 0, 0, 0, 0, 0, 0],
      itemQty: new Float64Array(NI),
      itemRev: new Float64Array(NI)
    };
    for (var d = a; d <= b; d++) {
      var i = d - a, day = D.days[d];
      res.dowCount[day.dow]++;
      for (var si = 0; si < stores.length; si++) {
        var s = stores[si];
        if (d < D.openIdx[s]) continue;
        var R = D.rev[s], C = D.checks[s], Q = D.itemQty[s];
        var dr = 0, dc = 0;
        for (var h = 0; h < H; h++) {
          var r = R[d * H + h];
          dr += r; dc += C[d * H + h];
          res.heat[day.dow][h] += r;
        }
        for (var k = 0; k < NI; k++) {
          var q = Q[d * NI + k];
          res.itemQty[k] += q;
          res.itemRev[k] += q * D.items[k].price;
        }
        var st = res.store[s];
        st.rev += dr; st.checks += dc; st.days++; st.daily[i] = dr;
        if (day.weekend) { st.weRev += dr; st.weDays++; } else { st.wdRev += dr; st.wdDays++; }
        res.daily[i] += dr; res.dailyChecks[i] += dc; res.dailyOpen[i]++;
        res.rev += dr; res.checks += dc; res.storeDays++;
      }
    }
    return res;
  }

  function change(cur, prev) {
    if (!fin(prev) || prev <= 0) return null;
    return (cur - prev) / prev * 100;
  }

  /* Точки графика: по дням до 89 дней, по неделям (средняя выручка в день) от 90.
     Недели отсчитываются от конца периода, поэтому неполной может быть только самая ранняя. */
  function buildSeries(cur, prev, stores) {
    var weekly = cur.n >= 90;
    var step = weekly ? 7 : 1;
    var pts = [];
    var starts = [];
    for (var st0 = cur.n - step; st0 > -step; st0 -= step) starts.unshift(Math.max(0, st0));
    starts.forEach(function (o, si) {
      var e = si + 1 < starts.length ? starts[si + 1] - 1 : cur.n - 1;
      var p = { o: o, e: e, a: cur.a + o, b: cur.a + e, days: e - o + 1, value: NaN, prev: NaN, stores: {}, weather: null };
      var sum = 0, cnt = 0, psum = 0, pcnt = 0;
      for (var i = o; i <= e; i++) {
        if (cur.dailyOpen[i]) { sum += cur.daily[i]; cnt++; }
        if (prev && prev.dailyOpen[i]) { psum += prev.daily[i]; pcnt++; }
        if (D.days[cur.a + i].weather && !p.weather) p.weather = D.days[cur.a + i].weather;
      }
      if (cnt) p.value = sum / cnt;
      if (pcnt) p.prev = psum / pcnt;
      p.openDays = cnt;
      stores.forEach(function (s) {
        var ss = 0, sc = 0;
        for (var j = o; j <= e; j++) { var v = cur.store[s].daily[j]; if (fin(v)) { ss += v; sc++; } }
        p.stores[s] = sc ? ss / sc : NaN;
      });
      pts.push(p);
    });
    return { weekly: weekly, points: pts };
  }

  /* ---------------------------------------------------------------------
     DOM-ссылки
     --------------------------------------------------------------------- */
  var el = {
    periodInputs: $all('input[name="period"]'),
    modeInputs: $all('input[name="main-mode"]'),
    customRange: $('#custom-range'),
    from: $('#date-from'),
    to: $('#date-to'),
    rangeError: $('#range-error'),
    chips: $('#store-chips'),
    allStores: $('#stores-all'),
    compare: $('#compare'),
    exportBtn: $('#export'),
    theme: $('#theme-toggle'),
    rangeTitle: $('#range-title'),
    rangeCompare: $('#range-compare'),
    notice: $('#notice'),
    noticeText: $('#notice-text'),
    empty: $('#empty'),
    emptyTitle: $('#empty-title'),
    emptyText: $('#empty-text'),
    emptyActions: $('#empty-actions'),
    dash: $('#dash'),
    live: $('#live'),
    mainPlot: $('#main-plot'),
    mainLegend: $('#main-legend'),
    mainTable: $('#main-table'),
    mainInsight: $('#main-insight'),
    mainTitle: $('#main-title'),
    mainSub: $('#main-sub'),
    mainReadout: $('#main-readout'),
    storesPlot: $('#stores-plot'),
    storesTable: $('#stores-table'),
    storesInsight: $('#stores-insight'),
    heatPlot: $('#heat-plot'),
    heatScale: $('#heat-scale'),
    heatTable: $('#heat-table'),
    heatInsight: $('#heat-insight'),
    heatReadout: $('#heat-readout'),
    itemsBody: $('#items-body'),
    itemsTable: $('#items-table'),
    itemsInsight: $('#items-insight')
  };

  $('#updated-at').textContent = D.updatedAt;
  el.from.min = el.to.min = D.days[0].key;
  el.from.max = el.to.max = D.days[ND - 1].key;

  /* Чипы точек: цвет закреплён за точкой и не меняется при фильтрации. */
  el.chips.innerHTML = D.stores.map(function (s, i) {
    return '<button type="button" class="chip" data-store="' + i + '" aria-pressed="false">' +
      '<svg class="swatch" viewBox="0 0 10 10" aria-hidden="true"><circle class="f-' + (i + 1) + '" cx="5" cy="5" r="5"/></svg>' +
      esc(s.name) + icon('check', 'icon--sm chip__check') + '</button>';
  }).join('');

  /* ---------------------------------------------------------------------
     Отрисовка
     --------------------------------------------------------------------- */
  var last = null;          // последние вычисленные данные
  var mainGeo = null, mainActive = null;
  var heatGeo = null, heatActive = null;
  var announceNext = false;

  function syncControls() {
    el.periodInputs.forEach(function (inp) { inp.checked = inp.value === state.period; });
    el.modeInputs.forEach(function (inp) { inp.checked = inp.value === state.mode; });
    el.customRange.hidden = state.period !== 'custom';
    $all('.chip', el.chips).forEach(function (c) {
      c.setAttribute('aria-pressed', state.stores.indexOf(+c.dataset.store) >= 0 ? 'true' : 'false');
    });
    el.allStores.disabled = state.stores.length === D.stores.length;
    el.compare.setAttribute('aria-checked', state.compare ? 'true' : 'false');
    Object.keys(state.tables).forEach(function (k) {
      var b = $('[data-table-toggle="' + k + '"]');
      b.setAttribute('aria-pressed', state.tables[k] ? 'true' : 'false');
    });
  }

  function render() {
    syncControls();
    var r = getRange();
    var a = r.a, b = r.b, n = b - a + 1;
    var stores = state.stores.slice().sort();

    el.rangeTitle.textContent = state.period === 'custom'
      ? cap(rangeText(a, b)) + ', ' + n + NBSP + plural(n, 'день', 'дня', 'дней')
      : 'Последние ' + n + ' ' + plural(n, 'день', 'дня', 'дней');

    var prevOk = a - n >= 0;
    if (!state.compare) {
      el.rangeCompare.textContent = cap(rangeText(a, b)) + ' ' + D.days[b].date.getFullYear() + '. Сравнение выключено.';
    } else if (prevOk) {
      el.rangeCompare.textContent = cap(rangeText(a, b)) + '. Сравниваем с периодом ' + rangeText(a - n, a - 1) + '.';
    } else {
      el.rangeCompare.textContent = cap(rangeText(a, b)) + '. Сравнить не с чем: история продаж начинается ' + dayYear(0) + '.';
    }

    // Пустые состояния
    if (!stores.length) {
      showEmpty(
        'Не выбрана ни одна точка',
        'Отметьте хотя бы одну кофейню в фильтре выше, и здесь появятся выручка, чеки и часы пик.',
        [{ label: 'Выбрать все точки', primary: true, action: selectAllStores }]
      );
      return finish();
    }
    var openStores = stores.filter(function (s) { return D.openIdx[s] <= b; });
    if (!openStores.length) {
      var names = stores.map(function (s) { return D.stores[s].name; });
      var firstOpen = Math.min.apply(null, stores.map(function (s) { return D.openIdx[s]; }));
      showEmpty(
        (names.length === 1 ? names[0] + ' в эти дни ещё не работала' : 'Выбранные точки в эти дни ещё не работали'),
        names.join(', ') + ': открытие ' + dayYear(firstOpen) + '. Выбранный период ' + rangeText(a, b) +
          ' целиком приходится на время до открытия, поэтому продаж нет.',
        [
          { label: 'Показать с ' + dayLong(firstOpen), primary: true, action: function () { setCustom(firstOpen, ND - 1); } },
          { label: 'Все точки', action: selectAllStores }
        ]
      );
      return finish();
    }

    el.empty.hidden = true;
    el.dash.hidden = false;
    el.exportBtn.disabled = false;

    var cur = aggregate(a, b, stores);
    var prev = state.compare && prevOk ? aggregate(a - n, a - 1, stores) : null;

    // Точки, открывшиеся внутри периода
    var partial = stores.filter(function (s) { return D.openIdx[s] > a && D.openIdx[s] <= b; });
    if (partial.length) {
      el.noticeText.textContent = partial.map(function (s) { return D.stores[s].name + ' открылась ' + dayYear(D.openIdx[s]); }).join(', ') +
        '. Дни до открытия не входят в выручку на точку в день, а на графике по точкам её линия начинается с даты открытия.';
      el.notice.hidden = false;
    } else if (prev && stores.some(function (s) { return D.openIdx[s] > a - n && D.openIdx[s] <= a; })) {
      var np = stores.filter(function (s) { return D.openIdx[s] > a - n && D.openIdx[s] <= a; });
      el.noticeText.textContent = np.map(function (s) { return D.stores[s].name; }).join(', ') +
        ' в прошлом периоде работала не все дни, поэтому рост к прошлому периоду отчасти объясняется открытием.';
      el.notice.hidden = false;
    } else {
      el.notice.hidden = true;
    }

    last = {
      a: a, b: b, n: n, stores: stores, cur: cur, prev: prev,
      prevOk: prevOk,
      series: buildSeries(cur, prev, stores)
    };

    renderKpis();
    renderMainChrome();
    renderMain();
    renderStores();
    renderHeat();
    renderItems();
    finish();
  }

  function finish() {
    persist();
    if (announceNext && last && !el.dash.hidden) {
      announceNext = false;
      var t = el.rangeTitle.textContent + ', ' + last.stores.length + ' ' + plural(last.stores.length, 'точка', 'точки', 'точек') +
        '. Выручка ' + compact(last.cur.rev) + '.';
      var d = last.prev ? change(last.cur.rev, last.prev.rev) : null;
      if (d != null) t += ' ' + (d >= 0 ? 'Рост ' : 'Снижение ') + pct(d) + ' к прошлому периоду.';
      el.live.textContent = t;
    } else if (announceNext) {
      announceNext = false;
      el.live.textContent = el.emptyTitle.textContent;
    }
  }

  function showEmpty(title, text, actions) {
    el.dash.hidden = true;
    el.notice.hidden = true;
    el.empty.hidden = false;
    el.exportBtn.disabled = true;
    el.emptyTitle.textContent = title;
    el.emptyText.textContent = text;
    el.emptyActions.innerHTML = '';
    actions.forEach(function (ac) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn btn--lg ' + (ac.primary ? 'btn--primary' : 'btn--secondary');
      b.textContent = ac.label;
      b.addEventListener('click', function () { announceNext = true; ac.action(); });
      el.emptyActions.appendChild(b);
    });
    last = null;
  }

  /* ---- KPI ---- */
  function deltaPill(d, big) {
    if (d == null) return '';
    var dir = Math.abs(d) < 0.5 ? 'flat' : d > 0 ? 'up' : 'down';
    var word = dir === 'up' ? 'рост' : dir === 'down' ? 'снижение' : 'без изменений';
    var ic = dir === 'up' ? 'up' : dir === 'down' ? 'down' : 'flat';
    return '<span class="delta delta--' + dir + '">' + icon(ic) +
      (dir === 'flat' ? 'Без изменений' : signedPct(d)) +
      '<span class="sr-only"> ' + (dir === 'flat' ? '' : word) + ' к прошлому периоду</span></span>';
  }

  function noPrevReason() {
    if (!state.compare) return null;
    if (!last.prevOk) return 'Нет данных за прошлый период';
    if (last.prev && last.prev.storeDays === 0) return 'В прошлом периоде точка ещё не работала';
    return null;
  }

  function renderKpis() {
    var c = last.cur, p = last.prev, n = last.n;
    $('#kpi-rev').textContent = rub(c.rev);
    var foot = '';
    var reason = noPrevReason();
    var meta = last.stores.length + NBSP + plural(last.stores.length, 'точка', 'точки', 'точек') + ', ' + n + NBSP + plural(n, 'день', 'дня', 'дней');
    if (reason) {
      foot = '<span class="delta delta--none">' + icon('info') + reason + '</span><span class="delta-note">' + meta + '</span>';
    } else if (p) {
      var d = change(c.rev, p.rev);
      var diff = c.rev - p.rev;
      var word = diff >= 0 ? 'больше' : 'меньше';
      foot = deltaPill(d, true) + '<span class="delta-note">На ' + compact(Math.abs(diff)) + ' ' + word + ', чем за прошлые ' + n + NBSP +
        plural(n, 'день', 'дня', 'дней') + ' (' + compact(p.rev) + '). ' + meta + '.</span>';
    } else {
      foot = '<span class="delta-note">' + meta + '. В среднем ' + compact(c.rev / n) + ' в день.</span>';
    }
    $('#kpi-rev-delta').innerHTML = foot;

    var avg = c.checks ? c.rev / c.checks : 0;
    var perStore = c.storeDays ? c.rev / c.storeDays : 0;
    $('#kpi-checks').textContent = num(c.checks);
    $('#kpi-avg').textContent = rub(avg);
    $('#kpi-perstore').textContent = rub(perStore);

    var hasPrev = p && p.storeDays > 0 && !reason;
    var pAvg = hasPrev && p.checks ? p.rev / p.checks : null;
    var pPer = hasPrev ? p.rev / p.storeDays : null;
    $('#kpi-checks-delta').innerHTML = hasPrev ? deltaPill(change(c.checks, p.checks)) : '';
    $('#kpi-avg-delta').innerHTML = hasPrev ? deltaPill(change(avg, pAvg)) : '';
    $('#kpi-perstore-delta').innerHTML = hasPrev ? deltaPill(change(perStore, pPer)) : '';

    $('#kpi-checks-hint').textContent = hasPrev ? 'Было ' + num(p.checks) + ' за прошлые ' + n + NBSP + plural(n, 'день', 'дня', 'дней') : 'В среднем ' + num(c.checks / n) + ' в день';
    $('#kpi-avg-hint').textContent = hasPrev ? 'Было ' + rub(pAvg) : 'Позиций в чеке: ' + nf1.format(sumQty(c) / Math.max(1, c.checks));
    $('#kpi-perstore-hint').textContent = c.storeDays + NBSP + plural(c.storeDays, 'день', 'дня', 'дней') + ' работы точек' + (hasPrev ? ', было ' + rub(pPer) : '');

    renderSpark();
  }

  function sumQty(c) { var s = 0; for (var k = 0; k < NI; k++) s += c.itemQty[k]; return s; }

  function renderSpark() {
    var box = $('#kpi-spark');
    var W = Math.max(120, box.clientWidth), Hh = Math.max(48, box.clientHeight);
    var c = last.cur;
    var vals = Array.prototype.map.call(c.daily, function (v, i) { return c.dailyOpen[i] ? v : NaN; });
    var max = Math.max.apply(null, vals.filter(fin)) || 1;
    var min = Math.min.apply(null, vals.filter(fin));
    var lo = Math.max(0, min - (max - min) * 0.25);
    var x = function (i) { return vals.length === 1 ? W / 2 : 4 + i * (W - 8) / (vals.length - 1); };
    var y = function (v) { return 6 + (Hh - 10) * (1 - (v - lo) / (max - lo || 1)); };
    var dLine = linePath(vals, x, y);
    var dArea = areaPath(vals, x, y, Hh);
    var li = vals.length - 1;
    while (li > 0 && !fin(vals[li])) li--;
    box.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + Hh + '" width="' + W + '" height="' + Hh + '" focusable="false">' +
      '<path class="area--total" d="' + dArea + '"/>' +
      '<path class="line line--total" d="' + dLine + '"/>' +
      (fin(vals[li]) ? '<circle class="dot f-total" cx="' + x(li).toFixed(1) + '" cy="' + y(vals[li]).toFixed(1) + '" r="4"/>' : '') +
      '</svg>';
    $('#kpi-spark-axis').innerHTML = '<span>' + dayShort(last.a) + '</span><span>' + dayShort(last.b) + '</span>';
  }

  /* ---- SVG-помощники ---- */
  function linePath(vals, x, y) {
    var d = '', pen = false;
    for (var i = 0; i < vals.length; i++) {
      var v = vals[i];
      if (!fin(v)) { pen = false; continue; }
      d += (pen ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(v).toFixed(1);
      pen = true;
    }
    return d;
  }
  function areaPath(vals, x, y, base) {
    var d = '', seg = [];
    function flush() {
      if (seg.length > 1) {
        d += 'M' + x(seg[0]).toFixed(1) + ',' + base;
        seg.forEach(function (i) { d += 'L' + x(i).toFixed(1) + ',' + y(vals[i]).toFixed(1); });
        d += 'L' + x(seg[seg.length - 1]).toFixed(1) + ',' + base + 'Z';
      }
      seg = [];
    }
    for (var i = 0; i < vals.length; i++) { if (fin(vals[i])) seg.push(i); else flush(); }
    flush();
    return d;
  }
  function niceStep(raw) {
    var p = Math.pow(10, Math.floor(Math.log10(raw)));
    var f = raw / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  }
  function niceTicks(max, count) {
    if (!(max > 0)) max = 1;
    var step = niceStep(max / count);
    var top = Math.ceil(max / step) * step;
    if (top / max > 1.35 && count > 2) { step = niceStep(max / (count + 1)); top = Math.ceil(max / step) * step; }
    var t = [];
    for (var v = 0; v <= top + step / 2; v += step) t.push(v);
    return t;
  }
  function lineKey(cls) {
    return '<svg class="legend__key" viewBox="0 0 16 8" aria-hidden="true"><line class="line ' + cls + '" x1="1" x2="15" y1="4" y2="4"/></svg>';
  }
  function tipKey(cls) {
    return '<svg class="tip__key" viewBox="0 0 12 8" aria-hidden="true"><line class="line ' + cls + '" x1="1" x2="11" y1="4" y2="4"/></svg>';
  }

  /* ---- Главный график ---- */
  function renderMainChrome() {
    var s = last.series;
    var total = state.mode === 'total';
    el.mainTitle.textContent = s.weekly ? 'Выручка по неделям' : 'Выручка по дням';
    el.mainSub.textContent = s.weekly
      ? 'Средняя выручка в день за каждую неделю, рубли'
      : (total ? 'Рубли, сумма по выбранным точкам' : 'Рубли, каждая точка отдельно');
    var legend = '';
    if (total) {
      legend += '<span class="legend__item">' + lineKey('line--total') + 'Текущий период</span>';
      if (last.prev) legend += '<span class="legend__item">' + lineKey('line--prev') + 'Прошлый период</span>';
      if (!s.weekly && last.series.points.some(function (p) { return p.weather; })) {
        legend += '<span class="legend__item"><svg class="icon weather-mark" aria-hidden="true"><use href="#i-rain"/></svg>Непогода: ливень, гроза, снег</span>';
      }
    } else {
      last.stores.forEach(function (st) {
        legend += '<span class="legend__item">' + lineKey('s-' + (st + 1)) + esc(D.stores[st].name) + '</span>';
      });
      if (state.compare) legend += '<span class="legend__item delta-note">Прошлый период показан в режиме «Всего»</span>';
    }
    el.mainLegend.innerHTML = legend;
    el.mainPlot.hidden = state.tables.main;
    el.mainTable.hidden = !state.tables.main;
    renderMainTable();
    el.mainInsight.innerHTML = '<span>' + mainInsight() + '</span>';
  }

  function pointLabel(p, weekly, long) {
    if (!weekly) return long ? cap(DOW_FULL[D.days[p.a].dow]) + ', ' + dayLong(p.a) : dayShort(p.a);
    return long ? rangeText(p.a, p.b) + (p.days < 7 ? ' (' + p.days + NBSP + plural(p.days, 'день', 'дня', 'дней') + ')' : '') : dayShort(p.a);
  }

  function mainInsight() {
    var s = last.series, pts = s.points;
    var valid = pts.filter(function (p) { return fin(p.value); });
    if (!valid.length) return 'Нет продаж за выбранный период.';
    if (state.mode === 'stores' && last.stores.length > 1) {
      var ranked = last.stores.slice().sort(function (x, y) { return last.cur.store[y].rev - last.cur.store[x].rev; });
      var best = null, bestR = 1;
      last.stores.forEach(function (st) {
        var o = last.cur.store[st];
        if (o.wdDays && o.weDays) {
          var wd = o.wdRev / o.wdDays, we = o.weRev / o.weDays;
          var r = Math.max(wd / we, we / wd);
          if (r > bestR) { bestR = r; best = { st: st, weekendUp: we > wd }; }
        }
      });
      var t = 'Больше всех приносят <strong>' + esc(D.stores[ranked[0]].name) + '</strong>.';
      if (best && bestR > 1.15) {
        t += ' Сильнее всех от дня недели зависит ' + esc(D.stores[best.st].name) + ': в выходные выручка ' +
          (best.weekendUp ? 'выше' : 'ниже') + ' будней в ' + nf1.format(bestR) + NBSP + 'раза.';
      }
      return t;
    }
    var mx = valid[0], mn = valid[0], sum = 0;
    valid.forEach(function (p) { if (p.value > mx.value) mx = p; if (p.value < mn.value) mn = p; sum += p.value; });
    var avg = sum / valid.length;
    if (s.weekly) {
      var first = valid[0], lastP = valid[valid.length - 1];
      var g = change(lastP.value, first.value);
      return 'Лучшая неделя: <strong>' + pointLabel(mx, true, true) + '</strong>, в среднем ' + compact(mx.value) + ' в день. ' +
        (g != null ? 'С первой недели периода до последней выручка в день ' + (g >= 0 ? 'выросла' : 'снизилась') + ' на ' + pct(g) + '.' : '');
    }
    var t2 = 'Лучший день: <strong>' + DOW_FULL[D.days[mx.a].dow] + ', ' + dayLong(mx.a) + '</strong>, ' + compact(mx.value) + '.';
    var below = (avg - mn.value) / avg * 100;
    if (below > 12) {
      t2 += ' Слабее всего ' + dayLong(mn.a) + ': на ' + nf0.format(below) + '% ниже среднего' +
        (D.days[mn.a].weather ? ', в этот день был' + (D.days[mn.a].weather === 'гроза' ? 'а ' : ' ') + D.days[mn.a].weather + '.' : '.');
    }
    return t2;
  }

  function mainAria() {
    var pts = last.series.points.filter(function (p) { return fin(p.value); });
    if (!pts.length) return 'Нет данных за период';
    var vals = pts.map(function (p) { return p.value; });
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    return el.mainTitle.textContent + ' ' + rangeText(last.a, last.b) + ': от ' + compact(lo) + ' до ' + compact(hi) +
      (last.series.weekly ? ' в день. ' : '. ') + el.mainInsight.textContent;
  }

  function renderMain() {
    var plot = el.mainPlot;
    if (state.tables.main) { mainGeo = null; return; }
    var W = Math.max(260, plot.clientWidth);
    var Hh = W < 600 ? 232 : 300;
    var s = last.series, pts = s.points, len = pts.length;
    var total = state.mode === 'total';
    var showPrev = total && !!last.prev;
    var max = 0;
    pts.forEach(function (p) {
      if (total) {
        if (p.value > max) max = p.value;
        if (showPrev && p.prev > max) max = p.prev;
      } else {
        last.stores.forEach(function (st) { if (p.stores[st] > max) max = p.stores[st]; });
      }
    });
    var ticks = niceTicks(max, W < 600 ? 3 : 4);
    var top = ticks[ticks.length - 1];
    var labels = ticks.map(axisLabel);
    var ml = Math.round(Math.max.apply(null, labels.map(function (l) { return l.length; })) * 6.6 + 14);
    var m = { l: ml, r: 16, t: 22, b: 30 };
    var pw = W - m.l - m.r, ph = Hh - m.t - m.b;
    var x = function (i) { return m.l + (len === 1 ? pw / 2 : i * pw / (len - 1)); };
    var y = function (v) { return m.t + ph - (v / top) * ph; };

    var svg = '<svg viewBox="0 0 ' + W + ' ' + Hh + '" width="' + W + '" height="' + Hh + '" role="img" aria-label="' + esc(mainAria()) + '">';
    ticks.forEach(function (t, i) {
      var yy = Math.round(y(t)) + 0.5;
      svg += '<line class="' + (i === 0 ? 'base-line' : 'grid-line') + '" x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + yy + '" y2="' + yy + '"/>';
      svg += '<text class="axis-text" x="' + (m.l - 8) + '" y="' + (yy + 4) + '" text-anchor="end">' + esc(labels[i]) + '</text>';
    });
    // Подписи оси X: от последней точки назад, чтобы свежая дата всегда была подписана
    var maxTicks = Math.max(2, Math.floor(pw / 76));
    var step = Math.max(1, Math.ceil(len / maxTicks));
    for (var i = len - 1; i >= 0; i -= step) {
      var xx = x(i);
      var anchor = xx - m.l < 22 ? 'start' : (W - m.r - xx < 22 ? 'end' : 'middle');
      if (len === 1) anchor = 'middle';
      svg += '<line class="base-line" x1="' + xx.toFixed(1) + '" x2="' + xx.toFixed(1) + '" y1="' + (m.t + ph) + '" y2="' + (m.t + ph + 4) + '"/>';
      svg += '<text class="axis-text" x="' + xx.toFixed(1) + '" y="' + (Hh - 8) + '" text-anchor="' + anchor + '">' + esc(pointLabel(pts[i], s.weekly, false)) + '</text>';
    }

    if (total) {
      var vals = pts.map(function (p) { return p.value; });
      svg += '<path class="area--total" d="' + areaPath(vals, x, y, m.t + ph) + '"/>';
      if (showPrev) svg += '<path class="line line--prev" d="' + linePath(pts.map(function (p) { return p.prev; }), x, y) + '"/>';
      svg += '<path class="line line--total" d="' + linePath(vals, x, y) + '"/>';
      if (len === 1 && fin(vals[0])) svg += '<circle class="dot f-total" cx="' + x(0) + '" cy="' + y(vals[0]) + '" r="4"/>';
      // Непогода: маленькие метки у оси
      if (!s.weekly) {
        pts.forEach(function (p, j) {
          if (p.weather) svg += '<use href="#i-rain" class="weather-mark" x="' + (x(j) - 7).toFixed(1) + '" y="' + (m.t + ph - 20) + '" width="14" height="14"/>';
        });
      }
      // Подпись максимума, выборочно
      var mi = -1;
      vals.forEach(function (v, j) { if (fin(v) && (mi < 0 || v > vals[mi])) mi = j; });
      if (mi >= 0 && len > 1) {
        var mx = x(mi), my = y(vals[mi]);
        var an = mx - m.l < 40 ? 'start' : (W - m.r - mx < 40 ? 'end' : 'middle');
        svg += '<circle class="dot f-total" cx="' + mx.toFixed(1) + '" cy="' + my.toFixed(1) + '" r="4"/>';
        svg += '<text class="value-label value-label-halo" x="' + mx.toFixed(1) + '" y="' + (my - 10).toFixed(1) + '" text-anchor="' + an + '">' + esc(compact(vals[mi])) + '</text>';
        svg += '<text class="value-label" x="' + mx.toFixed(1) + '" y="' + (my - 10).toFixed(1) + '" text-anchor="' + an + '">' + esc(compact(vals[mi])) + '</text>';
      }
    } else {
      last.stores.forEach(function (st) {
        var v = pts.map(function (p) { return p.stores[st]; });
        svg += '<path class="line s-' + (st + 1) + '" d="' + linePath(v, x, y) + '"/>';
      });
    }
    svg += '<g class="hover-layer"></g></svg>';
    plot.innerHTML = svg + '<div class="tip" hidden></div>';
    mainGeo = { x: x, y: y, m: m, W: W, Hh: Hh, pw: pw, ph: ph, len: len };
    if (mainActive != null) {
      if (mainActive >= len) mainActive = null; else showMainActive(mainActive);
    }
  }

  function showMainActive(i) {
    if (!mainGeo || !last) return;
    mainActive = i;
    var g = mainGeo, p = last.series.points[i], total = state.mode === 'total';
    var xx = g.x(i);
    var layer = el.mainPlot.querySelector('.hover-layer');
    var s = '<line class="crosshair" x1="' + xx.toFixed(1) + '" x2="' + xx.toFixed(1) + '" y1="' + g.m.t + '" y2="' + (g.m.t + g.ph) + '"/>';
    var rows = [];
    if (total) {
      if (last.prev && fin(p.prev)) s += '<circle class="dot f-prev" cx="' + xx.toFixed(1) + '" cy="' + g.y(p.prev).toFixed(1) + '" r="4"/>';
      if (fin(p.value)) s += '<circle class="dot f-total" cx="' + xx.toFixed(1) + '" cy="' + g.y(p.value).toFixed(1) + '" r="5"/>';
      rows.push({ key: 'line--total', value: fin(p.value) ? rub(p.value) : 'нет продаж', name: 'текущий' });
      if (last.prev) rows.push({ key: 'line--prev', value: fin(p.prev) ? rub(p.prev) : 'нет данных', name: 'прошлый' });
    } else {
      var order = last.stores.slice().sort(function (a1, b1) { return (p.stores[b1] || 0) - (p.stores[a1] || 0); });
      order.forEach(function (st) {
        var v = p.stores[st];
        if (fin(v)) s += '<circle class="dot f-' + (st + 1) + '" cx="' + xx.toFixed(1) + '" cy="' + g.y(v).toFixed(1) + '" r="4"/>';
        rows.push({ key: 's-' + (st + 1), value: fin(v) ? rub(v) : 'не работала', name: D.stores[st].name });
      });
    }
    layer.innerHTML = s;

    var tip = el.mainPlot.querySelector('.tip');
    var head = pointLabel(p, last.series.weekly, true);
    var html = '<div class="tip__head">' + esc(cap(head)) + '</div>';
    rows.forEach(function (r) {
      html += '<div class="tip__row">' + tipKey(r.key) + '<span class="tip__value">' + esc(r.value) + '</span><span class="tip__name">' + esc(r.name) + '</span></div>';
    });
    var notes = [];
    if (last.series.weekly) notes.push('Средняя выручка в день');
    if (total && last.prev && fin(p.value) && fin(p.prev)) {
      var d = change(p.value, p.prev);
      notes.push((d >= 0 ? 'Больше' : 'Меньше') + ' прошлого на ' + pct(d));
    }
    if (p.weather) notes.push('Погода: ' + p.weather);
    if (notes.length) html += '<div class="tip__note">' + esc(notes.join('. ')) + '</div>';
    tip.innerHTML = html;
    tip.hidden = false;
    var tw = tip.offsetWidth, th = tip.offsetHeight;
    var left = xx + 14;
    if (left + tw > g.W) left = xx - 14 - tw;
    left = clamp(left, 0, Math.max(0, g.W - tw));
    var topY = clamp(g.m.t, 0, g.Hh - th);
    tip.style.transform = 'translate(' + Math.round(left) + 'px,' + Math.round(topY) + 'px)';

    el.mainReadout.textContent = cap(head) + ': ' + rows.map(function (r) { return r.name + ' ' + r.value; }).join(', ') + (p.weather ? ', погода: ' + p.weather : '') + '.';
  }

  function hideMainActive() {
    mainActive = null;
    var layer = el.mainPlot.querySelector('.hover-layer');
    if (layer) layer.innerHTML = '';
    var tip = el.mainPlot.querySelector('.tip');
    if (tip) tip.hidden = true;
  }

  function renderMainTable() {
    var s = last.series, total = state.mode === 'total';
    var head = '<th scope="col">' + (s.weekly ? 'Неделя' : 'Дата') + '</th>';
    if (total) {
      head += '<th scope="col" class="is-num">' + (s.weekly ? 'В среднем в день' : 'Выручка') + '</th>';
      if (last.prev) head += '<th scope="col" class="is-num">Прошлый период</th><th scope="col" class="is-num">Изменение</th>';
    } else {
      last.stores.forEach(function (st) { head += '<th scope="col" class="is-num">' + esc(D.stores[st].name) + '</th>'; });
    }
    var body = s.points.map(function (p) {
      var r = '<tr><th scope="row">' + esc(cap(pointLabel(p, s.weekly, true))) + (p.weather ? ' <span class="is-muted">(' + esc(p.weather) + ')</span>' : '') + '</th>';
      if (total) {
        r += '<td class="is-num">' + (fin(p.value) ? rub(p.value) : 'нет продаж') + '</td>';
        if (last.prev) {
          var d = fin(p.value) && fin(p.prev) ? change(p.value, p.prev) : null;
          r += '<td class="is-num">' + (fin(p.prev) ? rub(p.prev) : 'нет данных') + '</td><td class="is-num">' + trendCell(d) + '</td>';
        }
      } else {
        last.stores.forEach(function (st) { r += '<td class="is-num">' + (fin(p.stores[st]) ? rub(p.stores[st]) : 'не работала') + '</td>'; });
      }
      return r + '</tr>';
    }).join('');
    el.mainTable.innerHTML = '<table class="data-table"><caption class="sr-only">' + esc(el.mainTitle.textContent) + '</caption><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table>';
  }

  function trendCell(d) {
    if (d == null) return '<span class="trend trend--none">нет данных</span>';
    var dir = Math.abs(d) < 0.5 ? 'flat' : d > 0 ? 'up' : 'down';
    var word = dir === 'up' ? 'рост' : dir === 'down' ? 'снижение' : 'без изменений';
    return '<span class="trend trend--' + dir + '">' + icon(dir === 'flat' ? 'flat' : dir) + (dir === 'flat' ? '0%' : signedPct(d)) +
      '<span class="sr-only"> ' + word + '</span></span>';
  }

  /* ---- Выручка по точкам ---- */
  function renderStores() {
    var c = last.cur, p = last.prev;
    var ranked = last.stores.slice().sort(function (x, y) { return c.store[y].rev - c.store[x].rev; });
    var maxRev = c.store[ranked[0]].rev || 1;
    var html = '<ul class="bars">';
    ranked.forEach(function (st) {
      var o = c.store[st];
      var share = c.rev ? o.rev / c.rev * 100 : 0;
      var d = p && p.store[st].rev > 0 ? change(o.rev, p.store[st].rev) : null;
      var deltaHtml = '';
      if (state.compare) {
        if (!last.prevOk) deltaHtml = '<span class="trend trend--none">нет данных</span>';
        else if (p && p.store[st].rev === 0) deltaHtml = '<span class="trend trend--none">новая точка</span>';
        else deltaHtml = trendCell(d);
      } else {
        deltaHtml = '<span class="trend trend--none">' + (o.days ? compact(o.rev / o.days) + ' в день' : '') + '</span>';
      }
      html += '<li class="bar-row" tabindex="0" data-store="' + st + '">' +
        '<span class="bar-row__name"><svg class="swatch" viewBox="0 0 10 10" aria-hidden="true"><circle class="f-' + (st + 1) + '" cx="5" cy="5" r="5"/></svg>' + esc(D.stores[st].name) + '</span>' +
        '<span class="bar-row__value"><b>' + (o.days ? compact(o.rev) : '0' + NBSP + '₽') + '</b><span class="bar-row__share">' + nf0.format(share) + '%</span></span>' +
        (o.days ? '<span class="bar-row__bar" data-value="' + o.rev + '"></span>' : '<span class="bar-row__empty">В этот период ещё не работала</span>') +
        '<span class="bar-row__delta">' + deltaHtml + '</span>' +
        '</li>';
    });
    html += '</ul><div class="tip" hidden></div>';
    el.storesPlot.innerHTML = html;
    el.storesPlot.hidden = state.tables.stores;
    el.storesTable.hidden = !state.tables.stores;
    drawStoreBars(maxRev);

    // Таблица
    var th = '<th scope="col">Точка</th><th scope="col" class="is-num">Выручка и доля</th>' +
      (p ? '<th scope="col" class="is-num">К прошлому</th>' : '');
    var tb = ranked.map(function (st) {
      var o = c.store[st];
      var d = p && p.store[st].rev > 0 ? change(o.rev, p.store[st].rev) : null;
      return '<tr><th scope="row">' + esc(D.stores[st].name) + '<span class="cell-sub">' + num(o.checks) + NBSP + plural(o.checks, 'чек', 'чека', 'чеков') +
        (o.checks ? ', средний ' + rub(o.rev / o.checks) : '') + '</span></th><td class="is-num">' + rub(o.rev) + '<span class="cell-sub">' + nf1.format(c.rev ? o.rev / c.rev * 100 : 0) + '% выручки</span></td>' +
        (p ? '<td class="is-num">' + (p.store[st].rev === 0 ? '<span class="trend trend--none">новая точка</span>' : trendCell(d)) + '</td>' : '') + '</tr>';
    }).join('');
    el.storesTable.innerHTML = '<table class="data-table data-table--compact"><caption class="sr-only">Выручка по точкам</caption><thead><tr>' + th + '</tr></thead><tbody>' + tb + '</tbody></table>';

    // Вывод
    var leader = ranked[0], tail = ranked[ranked.length - 1];
    var t = '<strong>' + esc(D.stores[leader].name) + '</strong> ' + (ranked.length > 1 ? 'дают ' + nf0.format(c.store[leader].rev / c.rev * 100) + '% выручки.' : 'единственная выбранная точка.');
    if (ranked.length > 1) {
      if (p) {
        var growth = ranked.filter(function (st) { return p.store[st].rev > 0; })
          .map(function (st) { return { st: st, d: change(c.store[st].rev, p.store[st].rev) }; })
          .sort(function (x, y) { return y.d - x.d; });
        if (growth.length > 1) {
          var g0 = growth[0], gl = growth[growth.length - 1];
          t += ' Быстрее всех растёт ' + esc(D.stores[g0.st].name) + ' (' + signedPct(g0.d) + ')';
          t += gl.d < 0 ? ', проседает ' + esc(D.stores[gl.st].name) + ' (' + signedPct(gl.d) + ').' : '.';
        }
      } else if (c.store[tail].days) {
        var perL = c.store[leader].rev / c.store[leader].days, perT = c.store[tail].rev / c.store[tail].days;
        t += ' В пересчёте на день работы разрыв с последней точкой в ' + nf1.format(perL / perT) + NBSP + 'раза.';
      }
    }
    el.storesInsight.innerHTML = t;
  }

  function drawStoreBars(maxRev) {
    $all('.bar-row__bar', el.storesPlot).forEach(function (box) {
      var W = Math.max(40, box.clientWidth), h = 12, r = 4;
      var w = Math.max(r + 1, W * (+box.dataset.value) / maxRev);
      var row = box.closest('.bar-row');
      var st = +row.dataset.store;
      var d = 'M0,0H' + (w - r).toFixed(1) + 'A' + r + ',' + r + ' 0 0 1 ' + w.toFixed(1) + ',' + r + 'V' + (h - r) + 'A' + r + ',' + r + ' 0 0 1 ' + (w - r).toFixed(1) + ',' + h + 'H0Z';
      box.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + h + '" width="' + W + '" height="' + h + '" aria-hidden="true" focusable="false"><path class="f-' + (st + 1) + '" d="' + d + '"/></svg>';
    });
  }

  function showStoreTip(row) {
    var st = +row.dataset.store, c = last.cur, o = c.store[st], p = last.prev;
    $all('.bar-row', el.storesPlot).forEach(function (r) { r.classList.toggle('is-active', r === row); });
    var tip = el.storesPlot.querySelector('.tip');
    var html = '<div class="tip__head">' + esc(D.stores[st].name) + '</div>';
    var rows = [
      [rub(o.rev), 'выручка'],
      [num(o.checks), plural(o.checks, 'чек', 'чека', 'чеков')],
      [o.checks ? rub(o.rev / o.checks) : 'нет', 'средний чек'],
      [o.days ? rub(o.rev / o.days) : 'нет', 'в день']
    ];
    if (p && p.store[st].rev > 0) rows.push([rub(p.store[st].rev), 'прошлый период']);
    rows.forEach(function (r) {
      html += '<div class="tip__row tip__row--plain"><span class="tip__value">' + esc(r[0]) + '</span><span class="tip__name">' + esc(r[1]) + '</span></div>';
    });
    if (D.openIdx[st] > 0) html += '<div class="tip__note">Работает с ' + esc(dayYear(D.openIdx[st])) + '</div>';
    tip.innerHTML = html;
    tip.hidden = false;
    var W = el.storesPlot.clientWidth;
    var left = clamp(W - tip.offsetWidth, 0, W);
    var top = row.offsetTop + row.offsetHeight + 4;
    if (top + tip.offsetHeight > el.storesPlot.clientHeight + 40) top = Math.max(0, row.offsetTop - tip.offsetHeight - 4);
    tip.style.transform = 'translate(' + Math.round(left) + 'px,' + Math.round(top) + 'px)';
  }
  function hideStoreTip() {
    var tip = el.storesPlot.querySelector('.tip');
    if (tip) tip.hidden = true;
    $all('.bar-row', el.storesPlot).forEach(function (r) { r.classList.remove('is-active'); });
  }

  /* ---- Тепловая карта ---- */
  function heatValue(c, dow, h) { return c.dowCount[dow] ? c.heat[dow][h] / c.dowCount[dow] : 0; }

  function heatStats() {
    var c = last.cur, max = 0, best = { dow: 0, h: 0, v: 0 };
    for (var dw = 0; dw < 7; dw++) for (var h = 0; h < H; h++) {
      var v = heatValue(c, dw, h);
      if (v > max) { max = v; best = { dow: dw, h: h, v: v }; }
    }
    return { max: max || 1, best: best };
  }

  function bin(v, max) { return v <= 0 ? 1 : Math.min(6, 1 + Math.floor(v / max * 6)); }

  function renderHeat() {
    var c = last.cur, stats = heatStats();
    // Вывод
    var dayTotals = [0, 1, 2, 3, 4, 5, 6].map(function (dw) { var s = 0; for (var h = 0; h < H; h++) s += heatValue(c, dw, h); return s; });
    var bestDay = dayTotals.indexOf(Math.max.apply(null, dayTotals));
    var wdBestH = 0, weBestH = 0, wdv = -1, wev = -1;
    for (var h = 0; h < H; h++) {
      var wd = 0, we = 0;
      for (var dw = 0; dw < 5; dw++) wd += heatValue(c, dw, h);
      we = heatValue(c, 5, h) + heatValue(c, 6, h);
      if (wd > wdv) { wdv = wd; wdBestH = h; }
      if (we > wev) { wev = we; weBestH = h; }
    }
    var t = 'Пик: <strong>' + DOW_IN[stats.best.dow] + ' в ' + D.hours[stats.best.h] + ':00</strong>, в среднем ' + compact(stats.best.v) + ' за час. ' +
      'Лучший день недели: ' + DOW_FULL[bestDay] + '. В будни гости идут к ' + D.hours[wdBestH] + ':00, в выходные к ' + D.hours[weBestH] + ':00.';
    el.heatInsight.innerHTML = t;
    last.heatAria = 'Средняя выручка по дням недели и часам, ' + rangeText(last.a, last.b) + '. ' + el.heatInsight.textContent;

    el.heatPlot.hidden = state.tables.heat;
    el.heatScale.hidden = state.tables.heat;
    el.heatTable.hidden = !state.tables.heat;

    // Легенда шкалы
    var sw = '';
    for (var k = 1; k <= 6; k++) sw += '<rect class="h-' + k + '" x="' + ((k - 1) * 24 + 1) + '" y="0" width="22" height="12" rx="2"/>';
    el.heatScale.innerHTML = '<span>Меньше</span><svg viewBox="0 0 144 12" aria-hidden="true">' + sw + '</svg><span>Больше</span>' +
      '<span class="num">(от 0 до ' + compact(stats.max) + ' в час)</span>';

    // Таблица
    // Таблица развёрнута: часы строками, дни столбцами, значения в тысячах рублей, чтобы помещалась на телефоне.
    var th = '<th scope="col">Час</th>' + DOW_SHORT.map(function (dn, i) { return '<th scope="col" class="is-num"><abbr title="' + cap(DOW_FULL[i]) + '">' + dn + '</abbr></th>'; }).join('');
    var tb = '';
    for (var cc = 0; cc < H; cc++) {
      tb += '<tr><th scope="row"><abbr title="' + hourText(D.hours[cc]) + '">' + D.hours[cc] + ':00</abbr></th>';
      for (var r = 0; r < 7; r++) tb += '<td class="is-num">' + nf0.format(heatValue(c, r, cc) / 1000) + '</td>';
      tb += '</tr>';
    }
    el.heatTable.innerHTML = '<table class="data-table data-table--compact"><caption class="table-caption">Средняя выручка в час, тыс. ₽</caption><thead><tr>' + th + '</tr></thead><tbody>' + tb + '</tbody></table>';

    drawHeat();
  }

  function drawHeat() {
    if (state.tables.heat || !last) { heatGeo = null; return; }
    var c = last.cur, stats = heatStats();
    var W = Math.max(260, el.heatPlot.clientWidth);
    var lw = 30, th = 20;
    var cw = (W - lw) / H;
    var ch = clamp(cw * 0.9, 24, 42);
    var Hh = th + 7 * ch;
    var svg = '<svg viewBox="0 0 ' + W + ' ' + Hh + '" width="' + W + '" height="' + Hh + '" role="img" aria-label="' + esc(last.heatAria) + '">';
    var every = cw >= 30 ? 1 : 2;
    for (var h = 0; h < H; h++) {
      if (h % every === 0) svg += '<text class="axis-text" x="' + (lw + h * cw + cw / 2).toFixed(1) + '" y="13" text-anchor="middle">' + D.hours[h] + '</text>';
    }
    for (var r = 0; r < 7; r++) {
      svg += '<text class="axis-text axis-text--strong" x="0" y="' + (th + r * ch + ch / 2 + 4).toFixed(1) + '">' + DOW_SHORT[r] + '</text>';
      for (var cc = 0; cc < H; cc++) {
        var v = heatValue(c, r, cc);
        svg += '<rect class="heat-cell h-' + bin(v, stats.max) + '" data-r="' + r + '" data-c="' + cc + '" x="' + (lw + cc * cw + 1).toFixed(1) + '" y="' + (th + r * ch + 1).toFixed(1) +
          '" width="' + (cw - 2).toFixed(1) + '" height="' + (ch - 2).toFixed(1) + '" rx="3"/>';
      }
    }
    svg += '</svg>';
    el.heatPlot.innerHTML = svg + '<div class="tip" hidden></div>';
    heatGeo = { lw: lw, th: th, cw: cw, ch: ch, W: W, Hh: Hh, max: stats.max };
    if (heatActive) showHeatActive(heatActive.r, heatActive.c);
  }

  function showHeatActive(r, cIdx) {
    if (!heatGeo || !last) return;
    heatActive = { r: r, c: cIdx };
    $all('.heat-cell.is-active', el.heatPlot).forEach(function (x) { x.classList.remove('is-active'); });
    var cell = el.heatPlot.querySelector('.heat-cell[data-r="' + r + '"][data-c="' + cIdx + '"]');
    if (cell) { cell.classList.add('is-active'); cell.parentNode.appendChild(cell); }
    var v = heatValue(last.cur, r, cIdx);
    var avgAll = 0;
    for (var dw = 0; dw < 7; dw++) for (var h = 0; h < H; h++) avgAll += heatValue(last.cur, dw, h);
    avgAll /= 7 * H;
    var rel = avgAll ? (v - avgAll) / avgAll * 100 : 0;
    var tip = el.heatPlot.querySelector('.tip');
    var head = cap(DOW_FULL[r]) + ', ' + hourText(D.hours[cIdx]);
    var cnt = last.cur.dowCount[r];
    tip.innerHTML = '<div class="tip__head">' + esc(head) + '</div>' +
      '<div class="tip__row"><svg class="tip__key" viewBox="0 0 12 8" aria-hidden="true"><rect class="h-' + bin(v, heatGeo.max) + '" x="0" y="0" width="12" height="8" rx="2"/></svg><span class="tip__value">' + esc(rub(v)) + '</span><span class="tip__name">в среднем</span></div>' +
      '<div class="tip__note">' + esc((rel >= 0 ? 'Выше' : 'Ниже') + ' среднего часа на ' + nf0.format(Math.abs(rel)) + '%. Дней в выборке: ' + cnt) + '</div>';
    tip.hidden = false;
    var g = heatGeo;
    var cx = g.lw + cIdx * g.cw + g.cw / 2;
    var tw = tip.offsetWidth, tth = tip.offsetHeight;
    var left = clamp(cx - tw / 2, 0, Math.max(0, g.W - tw));
    var top = g.th + r * g.ch - tth - 6;
    if (top < 0) top = g.th + (r + 1) * g.ch + 6;
    tip.style.transform = 'translate(' + Math.round(left) + 'px,' + Math.round(top) + 'px)';
    el.heatReadout.textContent = head + ': ' + rub(v) + ' в среднем.';
  }
  function hideHeatActive() {
    heatActive = null;
    $all('.heat-cell.is-active', el.heatPlot).forEach(function (x) { x.classList.remove('is-active'); });
    var tip = el.heatPlot.querySelector('.tip');
    if (tip) tip.hidden = true;
  }

  /* ---- Позиции меню ---- */
  function renderItems() {
    var c = last.cur, p = last.prev;
    var total = 0;
    for (var k = 0; k < NI; k++) total += c.itemRev[k];
    var rows = D.items.map(function (it, k) {
      return {
        k: k, name: it.name, qty: c.itemQty[k], rev: c.itemRev[k],
        share: total ? c.itemRev[k] / total * 100 : 0,
        delta: p ? change(c.itemRev[k], p.itemRev[k]) : null
      };
    });
    var byRev = rows.slice().sort(function (x, y) { return y.rev - x.rev; });
    byRev.forEach(function (r, i) { r.rank = i + 1; });
    var maxShare = byRev[0].share || 1;
    var key = state.sort.key, dir = state.sort.dir === 'asc' ? 1 : -1;
    rows.sort(function (x, y) {
      if (key === 'name') return dir * x.name.localeCompare(y.name, 'ru');
      var xv = x[key], yv = y[key];
      if (xv == null) xv = -Infinity;
      if (yv == null) yv = -Infinity;
      return dir * (xv - yv) || (y.rev - x.rev);
    });
    var showDelta = !!p;
    el.itemsBody.innerHTML = rows.map(function (r) {
      return '<tr><th scope="row"><span class="rank">' + r.rank + '</span>' + esc(r.name) + '</th>' +
        '<td class="is-num col-qty">' + num(r.qty) + '</td>' +
        '<td class="is-num">' + compact(r.rev) + '</td>' +
        '<td class="is-num"><span class="share"><span class="share__track" aria-hidden="true"><span class="share__fill" style="inline-size:' + (r.share / maxShare * 100).toFixed(1) + '%"></span></span><span class="share__pct">' + nf1.format(r.share) + '%</span></span></td>' +
        (showDelta ? '<td class="is-num col-delta">' + trendCell(r.delta) + '</td>' : '') +
        '</tr>';
    }).join('');
    $all('.col-delta', el.itemsTable).forEach(function (x) { x.hidden = !showDelta; });

    $all('th[data-sort]', el.itemsTable).forEach(function (th) {
      var active = th.dataset.sort === state.sort.key;
      th.setAttribute('aria-sort', active ? (state.sort.dir === 'asc' ? 'ascending' : 'descending') : 'none');
      th.querySelector('use').setAttribute('href', active ? (state.sort.dir === 'asc' ? '#i-arrow-up' : '#i-arrow-down') : '#i-sort');
    });

    // Вывод
    var top1 = byRev[0];
    var t = '<strong>' + esc(top1.name) + '</strong> приносит ' + nf0.format(top1.share) + '% выручки, первые три позиции вместе ' +
      nf0.format(byRev[0].share + byRev[1].share + byRev[2].share) + '%.';
    if (p) {
      var withD = rows.filter(function (r) { return r.delta != null && r.qty > 30; }).sort(function (x, y) { return y.delta - x.delta; });
      if (withD.length) {
        var up = withD[0], down = withD[withD.length - 1];
        t += ' Быстрее всех растёт ' + esc(up.name.toLowerCase()) + ' (' + signedPct(up.delta) + ')';
        t += down.delta < 0 ? ', сильнее всех падает ' + esc(down.name.toLowerCase()) + ' (' + signedPct(down.delta) + ').' : '.';
      }
    }
    el.itemsInsight.innerHTML = '<span>' + t + '</span>';
  }

  /* ---------------------------------------------------------------------
     Действия
     --------------------------------------------------------------------- */
  function selectAllStores() {
    state.stores = D.stores.map(function (s, i) { return i; });
    render();
  }

  function setCustom(a, b) {
    state.period = 'custom';
    state.from = a; state.to = b;
    el.from.value = D.days[a].key;
    el.to.value = D.days[b].key;
    clearRangeError();
    render();
  }

  function clearRangeError() {
    el.rangeError.hidden = true;
    el.rangeError.innerHTML = '';
    el.from.removeAttribute('aria-invalid');
    el.to.removeAttribute('aria-invalid');
  }

  function rangeError(msg, fields) {
    el.rangeError.innerHTML = icon('alert') + '<span>' + esc(msg) + '</span>';
    el.rangeError.hidden = false;
    [['from', el.from], ['to', el.to]].forEach(function (f) {
      if (fields.indexOf(f[0]) >= 0) f[1].setAttribute('aria-invalid', 'true');
      else f[1].removeAttribute('aria-invalid');
    });
  }

  function onRangeChange() {
    var fv = el.from.value, tv = el.to.value;
    if (!fv || !tv) {
      rangeError('Укажите обе даты: начало и конец периода.', [!fv ? 'from' : '', !tv ? 'to' : ''].filter(Boolean));
      return;
    }
    var f = keyIndex[fv], t = keyIndex[tv];
    var bounds = 'Данные есть ' + rangeText(0, ND - 1) + ' ' + D.days[ND - 1].date.getFullYear() + '. Выберите даты в этих пределах.';
    if (f == null || t == null) {
      rangeError(bounds, [f == null ? 'from' : '', t == null ? 'to' : ''].filter(Boolean));
      return;
    }
    if (f > t) {
      rangeError('Дата начала позже даты окончания. Поменяйте даты местами.', ['from', 'to']);
      return;
    }
    clearRangeError();
    state.from = f; state.to = t;
    announceNext = true;
    render();
  }

  function exportCsv() {
    if (!last) return;
    var rows = ['Дата;Точка;Чеки;Выручка, руб.;Средний чек, руб.'];
    for (var d = last.a; d <= last.b; d++) {
      last.stores.forEach(function (s) {
        if (d < D.openIdx[s]) return;
        var r = 0, c = 0;
        for (var h = 0; h < H; h++) { r += D.rev[s][d * H + h]; c += D.checks[s][d * H + h]; }
        rows.push([D.days[d].key, D.stores[s].name, c, Math.round(r), c ? Math.round(r / c) : 0].join(';'));
      });
    }
    var blob = new Blob(['﻿' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'utro-prodazhi_' + D.days[last.a].key + '_' + D.days[last.b].key + '.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    el.live.textContent = 'Файл CSV скачан: ' + (rows.length - 1) + ' ' + plural(rows.length - 1, 'строка', 'строки', 'строк') + '.';
  }

  /* ---- Тема ---- */
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function themeNow() {
    var t = document.documentElement.getAttribute('data-theme');
    if (t) return t;
    return mq && mq.matches ? 'dark' : 'light';
  }
  function syncTheme() { el.theme.setAttribute('aria-pressed', themeNow() === 'dark' ? 'true' : 'false'); }
  el.theme.addEventListener('click', function () {
    var next = themeNow() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    storageSet(THEME_KEY, next);
    syncTheme();
  });
  if (mq && mq.addEventListener) mq.addEventListener('change', syncTheme);
  syncTheme();

  /* ---- Обработчики фильтров ---- */
  el.periodInputs.forEach(function (inp) {
    inp.addEventListener('change', function () {
      if (!inp.checked) return;
      if (inp.value === 'custom') {
        var r = getRange();
        state.period = 'custom';
        state.from = r.a; state.to = r.b;
        el.from.value = D.days[r.a].key;
        el.to.value = D.days[r.b].key;
      } else {
        state.period = inp.value;
        clearRangeError();
      }
      mainActive = null;
      announceNext = true;
      render();
    });
  });
  el.from.addEventListener('change', onRangeChange);
  el.to.addEventListener('change', onRangeChange);

  el.chips.addEventListener('click', function (e) {
    var chip = e.target.closest('.chip');
    if (!chip) return;
    var i = +chip.dataset.store;
    var at = state.stores.indexOf(i);
    if (at >= 0) state.stores.splice(at, 1); else state.stores.push(i);
    announceNext = true;
    render();
  });
  el.allStores.addEventListener('click', function () { announceNext = true; selectAllStores(); });

  el.compare.addEventListener('click', function () {
    state.compare = !state.compare;
    announceNext = true;
    render();
  });
  el.exportBtn.addEventListener('click', exportCsv);

  el.modeInputs.forEach(function (inp) {
    inp.addEventListener('change', function () {
      if (!inp.checked) return;
      state.mode = inp.value;
      renderMainChrome();
      renderMain();
      persist();
    });
  });

  $all('[data-table-toggle]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var k = btn.dataset.tableToggle;
      state.tables[k] = !state.tables[k];
      btn.setAttribute('aria-pressed', state.tables[k] ? 'true' : 'false');
      if (!last) return;
      if (k === 'main') { renderMainChrome(); renderMain(); }
      if (k === 'stores') renderStores();
      if (k === 'heat') renderHeat();
    });
  });

  $all('th[data-sort] .sort-btn', el.itemsTable).forEach(function (btn) {
    btn.addEventListener('click', function () {
      var key = btn.closest('th').dataset.sort;
      if (state.sort.key === key) state.sort.dir = state.sort.dir === 'asc' ? 'desc' : 'asc';
      else state.sort = { key: key, dir: key === 'name' ? 'asc' : 'desc' };
      if (last) renderItems();
      persist();
    });
  });

  /* ---- Главный график: мышь, касание, клавиатура ---- */
  function mainIndexFromEvent(e) {
    var svg = el.mainPlot.querySelector('svg');
    if (!svg || !mainGeo) return null;
    var r = svg.getBoundingClientRect();
    var px = e.clientX - r.left;
    var g = mainGeo;
    if (g.len === 1) return 0;
    return clamp(Math.round((px - g.m.l) / (g.pw / (g.len - 1))), 0, g.len - 1);
  }
  function onMainPointer(e) {
    var i = mainIndexFromEvent(e);
    if (i != null && i !== mainActive) showMainActive(i);
  }
  el.mainPlot.addEventListener('pointermove', onMainPointer);
  el.mainPlot.addEventListener('pointerdown', onMainPointer);
  el.mainPlot.addEventListener('pointerleave', function () { if (document.activeElement !== el.mainPlot) hideMainActive(); });
  el.mainPlot.addEventListener('focus', function () {
    if (mainActive == null && mainGeo) showMainActive(mainGeo.len - 1);
  });
  el.mainPlot.addEventListener('blur', hideMainActive);
  el.mainPlot.addEventListener('keydown', function (e) {
    if (!mainGeo) return;
    var i = mainActive == null ? mainGeo.len - 1 : mainActive;
    var next = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = i + 1;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = i - 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = mainGeo.len - 1;
    else if (e.key === 'PageUp') next = i - 7;
    else if (e.key === 'PageDown') next = i + 7;
    else if (e.key === 'Escape') { hideMainActive(); return; }
    if (next == null) return;
    e.preventDefault();
    showMainActive(clamp(next, 0, mainGeo.len - 1));
  });

  /* ---- Тепловая карта ---- */
  function heatCellFromEvent(e) {
    var svg = el.heatPlot.querySelector('svg');
    if (!svg || !heatGeo) return null;
    var r = svg.getBoundingClientRect(), g = heatGeo;
    var cx = Math.floor((e.clientX - r.left - g.lw) / g.cw);
    var ry = Math.floor((e.clientY - r.top - g.th) / g.ch);
    if (cx < 0 || cx >= H || ry < 0 || ry > 6) return null;
    return { r: ry, c: cx };
  }
  function onHeatPointer(e) {
    var cell = heatCellFromEvent(e);
    if (!cell) { if (document.activeElement !== el.heatPlot) hideHeatActive(); return; }
    if (!heatActive || heatActive.r !== cell.r || heatActive.c !== cell.c) showHeatActive(cell.r, cell.c);
  }
  el.heatPlot.addEventListener('pointermove', onHeatPointer);
  el.heatPlot.addEventListener('pointerdown', onHeatPointer);
  el.heatPlot.addEventListener('pointerleave', function () { if (document.activeElement !== el.heatPlot) hideHeatActive(); });
  el.heatPlot.addEventListener('focus', function () {
    if (!heatActive && heatGeo && last) { var b = heatStats().best; showHeatActive(b.dow, b.h); }
  });
  el.heatPlot.addEventListener('blur', hideHeatActive);
  el.heatPlot.addEventListener('keydown', function (e) {
    if (!heatGeo) return;
    var a = heatActive || { r: 0, c: 0 };
    var r = a.r, c = a.c;
    if (e.key === 'ArrowRight') c++;
    else if (e.key === 'ArrowLeft') c--;
    else if (e.key === 'ArrowDown') r++;
    else if (e.key === 'ArrowUp') r--;
    else if (e.key === 'Home') c = 0;
    else if (e.key === 'End') c = H - 1;
    else if (e.key === 'Escape') { hideHeatActive(); return; }
    else return;
    e.preventDefault();
    showHeatActive(clamp(r, 0, 6), clamp(c, 0, H - 1));
  });

  /* ---- Точки: подсказка по наведению и фокусу ---- */
  el.storesPlot.addEventListener('pointerover', function (e) {
    var row = e.target.closest('.bar-row');
    if (row) showStoreTip(row);
  });
  el.storesPlot.addEventListener('pointerleave', hideStoreTip);
  el.storesPlot.addEventListener('focusin', function (e) {
    var row = e.target.closest('.bar-row');
    if (row) showStoreTip(row);
  });
  el.storesPlot.addEventListener('focusout', hideStoreTip);
  el.storesPlot.addEventListener('keydown', function (e) { if (e.key === 'Escape') hideStoreTip(); });

  /* ---- Перестройка графиков при изменении ширины ---- */
  var raf = 0, lastW = 0;
  function onResize() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(function () {
      if (!last || el.dash.hidden) return;
      var w = el.dash.clientWidth;
      if (w === lastW) return;
      lastW = w;
      renderSpark();
      renderMain();
      drawStoreBars(last.cur.store[last.stores.slice().sort(function (x, y) { return last.cur.store[y].rev - last.cur.store[x].rev; })[0]].rev || 1);
      drawHeat();
    });
  }
  if (window.ResizeObserver) {
    new ResizeObserver(onResize).observe(el.dash);
    // Высота блока спарклайна зависит от соседней карточки: перерисовываем при любом изменении размера.
    var sparkSize = '';
    new ResizeObserver(function () {
      var box = $('#kpi-spark'), key = box.clientWidth + 'x' + box.clientHeight;
      if (key !== sparkSize && last && !el.dash.hidden) { sparkSize = key; renderSpark(); }
    }).observe($('#kpi-spark'));
  }
  else window.addEventListener('resize', onResize);

  // Первая отрисовка
  if (state.period === 'custom' && state.from != null) {
    el.from.value = D.days[state.from].key;
    el.to.value = D.days[state.to].key;
  }
  render();
  lastW = el.dash.clientWidth;
})();
