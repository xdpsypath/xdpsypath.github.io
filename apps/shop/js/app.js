/*
  Зерно и Пламя: логика магазина.
  Hash-роутинг, каталог с фильтрами в URL, корзина, избранное, оформление заказа, история.
  Всё хранится в localStorage (с запасным вариантом в памяти, если хранилище недоступно).
*/
(function () {
  'use strict';

  var D = window.APP_DATA;
  var ART = window.ART;
  var byId = {};
  var LABEL = { process: {}, roast: {}, grind: {}, cat: {}, delivery: {} };

  D.processes.forEach(function (x) { LABEL.process[x.id] = x.label; });
  D.roasts.forEach(function (x) { LABEL.roast[x.id] = x.label; });
  D.grinds.forEach(function (x) { LABEL.grind[x.id] = x.label; });
  D.categories.forEach(function (x) { LABEL.cat[x.id] = x.label; });
  D.delivery.forEach(function (x) { LABEL.delivery[x.id] = x; });
  D.products.forEach(function (p) {
    byId[p.id] = p;
    p.minPrice = Math.min.apply(null, p.variants.map(function (v) { return v.price; }));
    p.processLabel = p.process.map(function (x) { return LABEL.process[x].toLowerCase(); }).join(' и ');
    p.isCoffee = p.cat !== 'gear';
  });

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* ================= Утилиты ================= */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n) { return Math.round(n).toLocaleString('ru-RU') + ' ₽'; }
  function plural(n, one, few, many) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }
  function items(n) { return n + ' ' + plural(n, 'товар', 'товара', 'товаров'); }
  function icon(id, cls) {
    return '<svg class="icon' + (cls ? ' ' + cls : '') + '" aria-hidden="true" focusable="false"><use href="#i-' + id + '"/></svg>';
  }
  function norm(s) { return String(s).toLowerCase().replace(/ё/g, 'е'); }
  function debounce(fn, ms) {
    var t;
    return function () { var a = arguments, self = this; clearTimeout(t); t = setTimeout(function () { fn.apply(self, a); }, ms); };
  }

  /* Даты: обжарка по вторникам, отправка в среду */
  var DAY = 86400000;
  function startOfDay(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function nextRoast(from) {
    var d = startOfDay(from || new Date());
    var add = (2 - d.getDay() + 7) % 7;
    return new Date(d.getTime() + add * DAY);
  }
  function lastRoast() {
    var d = startOfDay(new Date());
    var back = (d.getDay() - 2 + 7) % 7;
    return new Date(d.getTime() - back * DAY);
  }
  function toDate(d) {
    if (typeof d === 'string' && /^d{4}-d{2}-d{2}$/.test(d)) { var p = d.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
    return new Date(d);
  }
  function isoLocal(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function fDate(d, opts) { return toDate(d).toLocaleDateString('ru-RU', opts || { day: 'numeric', month: 'long' }); }
  function fDay(d) { return fDate(d, { weekday: 'long', day: 'numeric', month: 'long' }); }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function fShort(d) { return fDate(d, { day: '2-digit', month: '2-digit', year: 'numeric' }); }

  /* ================= Хранилище ================= */
  var memory = {};
  function load(key, fallback) {
    try {
      var raw = window.localStorage.getItem('zp:' + key);
      if (raw == null) return key in memory ? memory[key] : fallback;
      return JSON.parse(raw);
    } catch (e) {
      return key in memory ? memory[key] : fallback;
    }
  }
  function save(key, value) {
    memory[key] = value;
    try { window.localStorage.setItem('zp:' + key, JSON.stringify(value)); } catch (e) { /* хранилище недоступно: работаем из памяти */ }
  }

  function sanitizeCart(list) {
    if (!Array.isArray(list)) return [];
    return list.filter(function (l) {
      var p = l && byId[l.pid];
      return p && p.variants.some(function (v) { return v.id === l.v; }) && l.qty > 0;
    }).map(function (l) {
      var p = byId[l.pid];
      return { pid: l.pid, v: l.v, g: p.grinds ? (LABEL.grind[l.g] ? l.g : 'beans') : null, qty: Math.max(1, Math.floor(l.qty)) };
    });
  }

  var state = {
    cart: sanitizeCart(load('cart', [])),
    fav: (load('fav', []) || []).filter(function (id) { return byId[id]; }),
    orders: Array.isArray(load('orders', [])) ? load('orders', []) : [],
    promo: load('promo', null) === D.promo.code ? D.promo.code : null,
    draft: load('checkout', {}) || {},
    removed: null
  };

  /* ================= Корзина: модель ================= */
  function keyOf(l) { return l.pid + '|' + l.v + '|' + (l.g || '-'); }
  function variantOf(p, vid) { return p.variants.filter(function (v) { return v.id === vid; })[0] || p.variants[0]; }
  function inCart(pid) { return state.cart.reduce(function (s, l) { return s + (l.pid === pid ? l.qty : 0); }, 0); }
  function available(pid) {
    var p = byId[pid];
    if (p.stock == null) return Infinity;
    return Math.max(0, p.stock - inCart(pid));
  }
  function cartCount() { return state.cart.reduce(function (s, l) { return s + l.qty; }, 0); }
  function goodsTotal() { return state.cart.reduce(function (s, l) { return s + variantOf(byId[l.pid], l.v).price * l.qty; }, 0); }
  function discountTotal() { return state.promo ? Math.round(goodsTotal() * D.promo.percent / 100) : 0; }
  function afterDiscount() { return goodsTotal() - discountTotal(); }
  function deliveryPrice(method) {
    var m = LABEL.delivery[method];
    if (!m) return 0;
    if (m.price > 0 && afterDiscount() >= D.freeShippingFrom) return 0;
    return m.price;
  }

  function addToCart(pid, vid, grind, qty) {
    var p = byId[pid];
    var n = Math.min(qty, available(pid));
    if (n <= 0) return 0;
    var line = { pid: pid, v: vid, g: p.grinds ? (grind || 'beans') : null, qty: 0 };
    var key = keyOf(line);
    var existing = state.cart.filter(function (l) { return keyOf(l) === key; })[0];
    if (existing) existing.qty += n;
    else { line.qty = n; state.cart.push(line); }
    state.removed = null;
    commitCart(true);
    return n;
  }
  function setQty(key, qty) {
    var line = state.cart.filter(function (l) { return keyOf(l) === key; })[0];
    if (!line) return;
    var max = line.qty + available(line.pid);
    line.qty = Math.max(1, Math.min(qty, max));
    commitCart(false);
  }
  function removeLine(key) {
    var idx = -1;
    state.cart.forEach(function (l, i) { if (keyOf(l) === key) idx = i; });
    if (idx < 0) return;
    state.removed = { line: state.cart[idx], index: idx };
    state.cart.splice(idx, 1);
    commitCart(false);
  }
  function undoRemove() {
    var r = state.removed;
    if (!r) return;
    var allowed = Math.min(r.line.qty, available(r.line.pid));
    if (allowed > 0) {
      r.line.qty = allowed;
      state.cart.splice(Math.min(r.index, state.cart.length), 0, r.line);
    }
    state.removed = null;
    commitCart(false);
  }
  function commitCart(bump) {
    save('cart', state.cart);
    updateHeader(bump);
    if (cartDialog.open) renderCart();
    document.dispatchEvent(new CustomEvent('cart:change'));
  }

  /* ================= Избранное ================= */
  function isFav(id) { return state.fav.indexOf(id) >= 0; }
  function toggleFav(id) {
    var on = !isFav(id);
    if (on) state.fav.push(id); else state.fav = state.fav.filter(function (x) { return x !== id; });
    save('fav', state.fav);
    $$('[data-fav="' + id + '"]').forEach(function (b) { paintFav(b, on); });
    updateHeader(false);
    announce(on ? 'Добавлено в избранное: ' + byId[id].name : 'Убрано из избранного: ' + byId[id].name);
  }
  function paintFav(btn, on) {
    var name = byId[btn.dataset.fav].name;
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (btn.classList.contains('fav')) {
      btn.setAttribute('aria-label', 'В избранное: ' + name);
    } else {
      var t = $('.btn__text', btn);
      if (t) t.textContent = on ? 'В избранном' : 'В избранное';
    }
  }

  /* ================= Шапка, объявления, тосты ================= */
  var cartCountEl = $('#cart-count');
  var favCountEl = $('#fav-count');
  var cartBtn = $('#cart-open');
  var announcer = $('#announcer');
  var toastRegion = $('#toast-region');
  var toastTimer;

  function updateHeader(bump) {
    var n = cartCount();
    cartCountEl.textContent = n;
    cartCountEl.hidden = n === 0;
    cartBtn.setAttribute('aria-label', n ? 'Корзина, ' + items(n) : 'Корзина, пусто');
    favCountEl.textContent = state.fav.length;
    favCountEl.hidden = state.fav.length === 0;
    $('#fav-link').setAttribute('aria-label', state.fav.length ? 'Избранное, ' + state.fav.length : 'Избранное');
    if (bump && !reduceMotion.matches) {
      cartCountEl.classList.remove('is-bump');
      void cartCountEl.offsetWidth;
      cartCountEl.classList.add('is-bump');
    }
  }
  function announce(msg) {
    announcer.textContent = '';
    setTimeout(function () { announcer.textContent = msg; }, 30);
  }
  function toast(msg, action) {
    clearTimeout(toastTimer);
    toastRegion.innerHTML = '<div class="toast" role="status">' + icon('circle-check') + '<span>' + esc(msg) + '</span>' +
      (action ? '<button class="toast__action" type="button">' + esc(action.label) + '</button>' : '') + '</div>';
    var el = toastRegion.firstChild;
    if (action) $('.toast__action', el).addEventListener('click', function () { hideToast(); action.fn(); });
    var hold = false;
    el.addEventListener('mouseenter', function () { hold = true; });
    el.addEventListener('mouseleave', function () { hold = false; schedule(); });
    el.addEventListener('focusin', function () { hold = true; });
    el.addEventListener('focusout', function () { hold = false; schedule(); });
    function schedule() { clearTimeout(toastTimer); toastTimer = setTimeout(function () { if (!hold) hideToast(); }, 5000); }
    schedule();
  }
  function hideToast() { toastRegion.innerHTML = ''; }

  /* ================= Диалоги ================= */
  var cartDialog = $('#cart');
  var filtersDialog = $('#filters-dialog');
  var confirmDialog = $('#confirm');
  var returnFocus = new WeakMap();

  function openDialog(dlg, trigger) {
    if (dlg.open) return;
    returnFocus.set(dlg, trigger || document.activeElement);
    dlg.classList.remove('is-closing');
    dlg.showModal();
  }
  function closeDialog(dlg, instant) {
    if (!dlg.open) return;
    var done = function () {
      dlg.classList.remove('is-closing');
      if (dlg.open) dlg.close();
    };
    if (instant || reduceMotion.matches || !dlg.classList.contains('drawer')) { done(); return; }
    dlg.classList.add('is-closing');
    var panel = $('.drawer__panel', dlg);
    var t = setTimeout(done, 400);
    panel.addEventListener('animationend', function h() { panel.removeEventListener('animationend', h); clearTimeout(t); done(); });
  }
  [cartDialog, filtersDialog, confirmDialog].forEach(function (dlg) {
    dlg.addEventListener('cancel', function (e) {
      if (dlg.classList.contains('drawer')) { e.preventDefault(); closeDialog(dlg); }
    });
    dlg.addEventListener('click', function (e) {
      if (e.target === dlg) closeDialog(dlg);
      var c = e.target.closest('[data-close]');
      if (c && dlg.contains(c)) closeDialog(dlg);
    });
    dlg.addEventListener('close', function () {
      var el = returnFocus.get(dlg);
      if (dlg.dataset.noReturn) { delete dlg.dataset.noReturn; return; }
      if (el && document.contains(el) && typeof el.focus === 'function') el.focus();
    });
  });

  /* Подтверждение опасного действия */
  function confirmDanger(opts, trigger) {
    $('#confirm-title').textContent = opts.title;
    $('#confirm-text').textContent = opts.text;
    $('#confirm-ok').lastChild.textContent = opts.action;
    confirmDialog.returnValue = '';
    openDialog(confirmDialog, trigger);
    confirmDialog.addEventListener('close', function h() {
      confirmDialog.removeEventListener('close', h);
      if (confirmDialog.returnValue === 'ok') opts.onConfirm();
    });
  }

  /* ================= Разметка общих элементов ================= */
  function badgesHTML(p, long) {
    return (p.badges || []).map(function (b) {
      var text = D.badges[b];
      if (b === 'low' && long) {
        var left = p.stock;
        text = 'Осталось ' + left + ' шт.';
      }
      return '<span class="badge badge--' + b + '">' + esc(text) + '</span>';
    }).join('');
  }
  function metaLine(p) {
    if (p.cat === 'gear') return 'Аксессуары';
    var parts = [p.cat === 'blend' ? 'Бленд' : p.country, p.processLabel, LABEL.roast[p.roast].toLowerCase()];
    if (p.cat === 'drip') parts[0] = 'Дрип-пакеты';
    return parts.join(' · ');
  }
  function defaultVariantNote(p) {
    var v = p.variants[0];
    if (p.grinds) return v.label + ', зерно';
    return v.label;
  }
  function addBtnHTML(p, extraCls, compactLabel) {
    var left = available(p.id);
    var none = left === 0;
    return '<button class="btn btn--secondary btn--sm ' + (extraCls || '') + '" type="button" data-add="' + p.id + '"' +
      (none ? ' disabled' : '') + ' aria-label="' + esc((none ? 'В корзине весь остаток: ' : 'В корзину: ') + p.name + ', ' + defaultVariantNote(p)) + '">' +
      '<span class="spinner" aria-hidden="true"></span>' + icon(none ? 'check' : 'bag', 'btn__icon') +
      '<span class="btn__text">' + (none ? 'Весь остаток в корзине' : (compactLabel || 'В корзину')) + '</span></button>';
  }
  function scalesHTML(p) {
    var rows = [['Кислотность', p.profile.acidity], ['Плотность', p.profile.body], ['Сладость', p.profile.sweetness]];
    return rows.map(function (r) {
      var segs = '';
      for (var i = 1; i <= 5; i++) segs += '<span class="scale__seg' + (i <= r[1] ? ' is-on' : '') + '"></span>';
      return '<div class="scale" role="img" aria-label="' + r[0] + ': ' + r[1] + ' из 5"><span aria-hidden="true">' + r[0] +
        '</span><span class="scale__bar" aria-hidden="true">' + segs + '</span><span class="scale__value" aria-hidden="true">' + r[1] + '/5</span></div>';
    }).join('');
  }

  function cardHTML(p, opts) {
    opts = opts || {};
    var lead = !!opts.lead;
    var href = '#/product/' + p.id;
    var fav = isFav(p.id);
    var notes = p.descriptors.length ? p.descriptors.join(', ') : (p.spec || '');
    return '<article class="card' + (lead ? ' card--lead' : '') + '" aria-labelledby="t-' + p.id + '">' +
      '<div class="card__visual">' +
        '<a class="card__media" href="' + href + '" tabindex="-1" aria-hidden="true">' + ART.front(p) + '</a>' +
        '<div class="card__badges badges">' + badgesHTML(p) + '</div>' +
        '<button class="fav" type="button" data-fav="' + p.id + '" aria-pressed="' + fav + '" aria-label="В избранное: ' + esc(p.name) + '">' + icon('heart') + '</button>' +
      '</div>' +
      '<div class="card__body">' +
        (lead && opts.eyebrow ? '<p class="eyebrow card__eyebrow">' + esc(opts.eyebrow) + '</p>' : '') +
        '<p class="card__meta">' + esc(metaLine(p)) + '</p>' +
        '<h3 class="card__name" id="t-' + p.id + '"><a href="' + href + '">' + esc(p.name) + '</a></h3>' +
        (lead ? '<p class="card__lead">' + esc(p.lead) + '</p>' : '') +
        '<p class="card__notes">' + esc(notes) + '</p>' +
        (lead && p.profile ? '<div class="mini-profile">' + scalesHTML(p) + '</div>' : '') +
        '<div class="card__foot">' +
          '<p class="card__price"><span class="price">' + (p.variants.length > 1 ? 'от ' : '') + money(p.minPrice) + '</span><small>' + esc(defaultVariantNote(p)) + '</small></p>' +
          addBtnHTML(p, 'card__add') +
        '</div>' +
      '</div>' +
    '</article>';
  }

  /* Быстрое добавление с загрузкой 400 мс и честным подтверждением */
  function runAdd(btn, pid, vid, grind, qty, after) {
    if (btn.getAttribute('aria-busy') === 'true') return;
    var p = byId[pid];
    var textEl = $('.btn__text', btn);
    var original = textEl ? textEl.textContent : '';
    btn.setAttribute('aria-busy', 'true');
    if (textEl) textEl.textContent = 'Добавляем';
    setTimeout(function () {
      var added = addToCart(pid, vid, grind, qty);
      btn.removeAttribute('aria-busy');
      if (added > 0) {
        btn.classList.add('is-done');
        if (textEl) textEl.textContent = 'Добавлено';
        var v = variantOf(p, vid);
        var what = p.name + ', ' + v.label + (p.grinds ? ', ' + LABEL.grind[grind || 'beans'].toLowerCase() : '');
        var tail = added < qty ? ' Добавили ' + added + ' шт.: больше нет на складе.' : '';
        toast('В корзине: ' + what + (added > 1 ? ' × ' + added : '') + '. Всего ' + items(cartCount()) + ' на ' + money(goodsTotal()) + '.' + tail,
          { label: 'Открыть корзину', fn: function () { openCart(cartBtn); } });
        setTimeout(function () {
          btn.classList.remove('is-done');
          if (textEl) textEl.textContent = original;
          if (after) after();
          else refreshAddButton(btn);
        }, 1600);
      } else {
        if (textEl) textEl.textContent = original;
        toast('Больше добавить нельзя: весь остаток «' + p.name + '» уже в корзине.');
        if (after) after(); else refreshAddButton(btn);
      }
    }, 400);
  }
  function refreshAddButton(btn) {
    var p = byId[btn.dataset.add];
    if (!p || !document.contains(btn)) return;
    var tmp = document.createElement('div');
    var extra = btn.className.replace(/btn(--secondary|--sm)?|is-done/g, '').trim();
    tmp.innerHTML = addBtnHTML(p, extra);
    var fresh = tmp.firstChild;
    var hadFocus = document.activeElement === btn;
    btn.replaceWith(fresh);
    if (hadFocus) (fresh.disabled ? (fresh.closest('.card, .pair') || document.body).querySelector('a') : fresh).focus();
  }

  /* Делегирование: избранное и быстрое добавление */
  document.addEventListener('click', function (e) {
    var favBtn = e.target.closest('[data-fav]');
    if (favBtn) { toggleFav(favBtn.dataset.fav); return; }
    var add = e.target.closest('[data-add]');
    if (add && !add.disabled) {
      var p = byId[add.dataset.add];
      runAdd(add, p.id, p.variants[0].id, p.grinds ? 'beans' : null, 1);
    }
  });

  /* ================= Роутер ================= */
  var view = $('#view');
  var firstRender = true;
  var current = { name: null };

  function parseHash() {
    var raw = location.hash || '';
    try { raw = decodeURI(raw); } catch (e) { /* битая ссылка: читаем как есть */ }
    var h = raw.replace(/\\/g, '/').replace(/^#/, '') || '/';
    var qi = h.indexOf('?');
    var path = qi >= 0 ? h.slice(0, qi) : h;
    var query = new URLSearchParams(qi >= 0 ? h.slice(qi + 1) : '');
    var parts = path.split('/').filter(Boolean);
    return { parts: parts, query: query };
  }

  function route() {
    var r = parseHash();
    var name = r.parts[0] || 'catalog';
    var prev = current.name;
    [cartDialog, filtersDialog, confirmDialog].forEach(function (d) { if (d.open) { d.dataset.noReturn = '1'; closeDialog(d, true); } });
    hideToast();

    if (name === 'catalog' && prev === 'catalog' && catalogState) {
      readFilters(r.query);
      syncFilterForm();
      renderResults();
      scrollToCatalog();
      return;
    }

    current = { name: name };
    catalogState = null;
    if (name !== 'catalog') $('#search-input').value = '';

    if (name === 'catalog') viewCatalog(r.query);
    else if (name === 'product' && byId[r.parts[1]]) viewProduct(byId[r.parts[1]]);
    else if (name === 'checkout') viewCheckout();
    else if (name === 'order') viewOrder(r.parts[1]);
    else if (name === 'orders') viewOrders();
    else if (name === 'favorites') viewFavorites();
    else viewNotFound();

    $$('[data-nav]').forEach(function (a) {
      if (a.dataset.nav === name) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });

    if (!firstRender) {
      window.scrollTo(0, 0);
      var h1 = $('h1', view);
      if (h1) { h1.setAttribute('tabindex', '-1'); h1.focus({ preventScroll: true }); }
      if (name === 'catalog' && r.query.toString()) scrollToCatalog();
    } else if (name === 'catalog' && r.query.toString()) {
      setTimeout(scrollToCatalog, 0);
    }
    firstRender = false;
  }

  function setTitle(t) { document.title = t ? t + '. Зерно и Пламя' : 'Зерно и Пламя. Свежеобжаренный кофе из Петербурга'; }

  function navigate(hash) {
    if (location.hash === hash) route(); else location.hash = hash;
  }

  $('[data-skip]').addEventListener('click', function (e) {
    e.preventDefault();
    var target = $('h1', view) || view;
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus();
  });

  /* ================= Каталог ================= */
  var catalogState = null;

  function readFilters(q) {
    var list = function (k, allowed) {
      return (q.get(k) || '').split(',').filter(function (x) { return allowed[x]; });
    };
    var cat = q.get('cat');
    var sort = q.get('sort');
    catalogState = catalogState || {};
    catalogState.cat = LABEL.cat[cat] ? cat : 'all';
    catalogState.proc = list('proc', LABEL.process);
    catalogState.roast = list('roast', LABEL.roast);
    catalogState.min = /^\d+$/.test(q.get('min') || '') ? q.get('min') : '';
    catalogState.max = /^\d+$/.test(q.get('max') || '') ? q.get('max') : '';
    catalogState.q = (q.get('q') || '').slice(0, 60);
    catalogState.sort = D.sorts.some(function (s) { return s.id === sort; }) ? sort : 'rec';
  }
  function filtersToQuery(f) {
    var q = new URLSearchParams();
    if (f.cat !== 'all') q.set('cat', f.cat);
    if (f.proc.length) q.set('proc', f.proc.join(','));
    if (f.roast.length) q.set('roast', f.roast.join(','));
    if (f.min) q.set('min', f.min);
    if (f.max) q.set('max', f.max);
    if (f.q) q.set('q', f.q);
    if (f.sort !== 'rec') q.set('sort', f.sort);
    return q.toString();
  }
  function writeUrl() {
    var qs = filtersToQuery(catalogState);
    var hash = '#/' + (qs ? '?' + qs.replace(/%2C/g, ',') : '');
    if (location.hash !== hash) {
      try { history.replaceState(null, '', hash); } catch (e) { /* file:// в некоторых браузерах */ }
    }
  }
  function priceRangeValid(f) { return !(f.min && f.max && Number(f.min) > Number(f.max)); }
  function matches(p, f, except) {
    if (except !== 'cat' && f.cat !== 'all' && p.cat !== f.cat) return false;
    if (f.proc.length && !p.process.some(function (x) { return f.proc.indexOf(x) >= 0; })) return false;
    if (f.roast.length && f.roast.indexOf(p.roast) < 0) return false;
    if (priceRangeValid(f)) {
      if (f.min && p.minPrice < Number(f.min)) return false;
      if (f.max && p.minPrice > Number(f.max)) return false;
    }
    if (f.q) {
      var hay = norm([p.name, p.country, p.region, p.descriptors.join(' '), p.processLabel, p.roast ? LABEL.roast[p.roast] : '', LABEL.cat[p.cat], p.spec || ''].join(' '));
      var words = norm(f.q).split(/\s+/).filter(Boolean);
      if (!words.every(function (w) { return hay.indexOf(w) >= 0; })) return false;
    }
    return true;
  }
  function sortList(list, sort) {
    var by = {
      rec: function (a, b) { return a.rank - b.rank; },
      'price-asc': function (a, b) { return a.minPrice - b.minPrice || a.rank - b.rank; },
      'price-desc': function (a, b) { return b.minPrice - a.minPrice || a.rank - b.rank; },
      sca: function (a, b) { return (b.sca || 0) - (a.sca || 0) || a.rank - b.rank; },
      'new': function (a, b) { return b.added < a.added ? -1 : b.added > a.added ? 1 : a.rank - b.rank; }
    };
    return list.slice().sort(by[sort]);
  }
  function activeCount(f) {
    return (f.cat !== 'all' ? 1 : 0) + f.proc.length + f.roast.length + (f.min ? 1 : 0) + (f.max ? 1 : 0) + (f.q ? 1 : 0);
  }

  function storyHTML() {
    var nr = nextRoast(new Date(Date.now() + DAY));
    return '<section class="story container" aria-labelledby="story-title">' +
      '<div class="story__grid">' +
        '<div class="story__text">' +
          '<p class="eyebrow">Обжарочная на Васильевском острове</p>' +
          '<h1 class="display" id="story-title">Кофе, обжаренный <em>на этой неделе</em></h1>' +
          '<p class="lead">Жарим по вторникам партиями по 12 кг и отправляем в среду. Поэтому кофе приходит к вам через один-три дня после обжарки, а на каждой пачке стоит её дата.</p>' +
          '<div class="story__actions">' +
            '<button class="btn btn--primary" type="button" id="to-catalog">Выбрать кофе' + icon('arrow-right') + '</button>' +
            '<p class="story__next">' + icon('flame') + 'Ближайшая обжарка: ' + esc(fDay(nr)) + '</p>' +
          '</div>' +
          '<dl class="story__facts">' +
            '<div><dt>1-3 дня</dt><dd>от обжарки до вашей чашки</dd></div>' +
            '<div><dt>от 3000 ₽</dt><dd>доставка по России бесплатно</dd></div>' +
            '<div><dt>86+ SCA</dt><dd>у половины моносортов</dd></div>' +
          '</dl>' +
        '</div>' +
        '<figure class="story__media">' +
          '<img src="img/cooling.webp" width="1024" height="628" alt="Свежеобжаренное зерно остывает в лотке ростера, мешалка перемешивает зёрна" fetchpriority="high" />' +
          '<figcaption class="story__caption">Охлаждение сразу после обжарки: четыре минуты, чтобы зерно не пережарилось.</figcaption>' +
        '</figure>' +
      '</div>' +
    '</section>';
  }

  function filtersFormHTML() {
    var catOpts = D.categories.map(function (c) {
      return '<label class="check"><input type="radio" name="cat" value="' + c.id + '"><span>' + esc(c.label) + '</span><span class="check__count" data-count="' + c.id + '"></span></label>';
    }).join('');
    var procOpts = D.processes.map(function (x) {
      return '<label class="check"><input type="checkbox" name="proc" value="' + x.id + '"><span>' + esc(x.label) + '</span></label>';
    }).join('');
    var roastOpts = D.roasts.map(function (x) {
      return '<label class="check"><input type="checkbox" name="roast" value="' + x.id + '"><span>' + esc(x.label) + '</span></label>';
    }).join('');
    return '<form class="filters" id="filters-form" aria-label="Фильтры каталога">' +
      '<fieldset class="filters__group"><legend class="filters__legend">Категория</legend>' + catOpts + '</fieldset>' +
      '<fieldset class="filters__group"><legend class="filters__legend">Обработка</legend>' + procOpts + '</fieldset>' +
      '<fieldset class="filters__group"><legend class="filters__legend">Обжарка</legend>' + roastOpts + '</fieldset>' +
      '<fieldset class="filters__group"><legend class="filters__legend">Цена, ₽</legend>' +
        '<div class="filters__price">' +
          '<div class="field"><label class="field__label" for="f-min">от</label><input class="input" id="f-min" name="min" type="number" inputmode="numeric" min="0" step="50" placeholder="450"></div>' +
          '<div class="field"><label class="field__label" for="f-max">до</label><input class="input" id="f-max" name="max" type="number" inputmode="numeric" min="0" step="50" placeholder="5990" aria-describedby="f-price-error"></div>' +
        '</div>' +
        '<p class="field__error" id="f-price-error" hidden>' + icon('alert') + '<span>«До» меньше, чем «от». Поменяйте значения местами или очистите одно из полей.</span></p>' +
      '</fieldset>' +
      '<button class="btn btn--ghost btn--sm filters__reset" type="button" data-reset hidden>' + icon('x', 'icon--sm') + 'Сбросить фильтры</button>' +
    '</form>';
  }

  function bandHTML() {
    var methods = [
      ['Воронка, кемекс, аэропресс', 'Светлая обжарка: цветы, ягоды и цитрус, чистая чашка.', '#/?roast=filter', 'Под фильтр'],
      ['Эспрессо и капучино', 'Плотное тело и сладость, которые не теряются в молоке.', '#/?roast=espresso', 'Под эспрессо'],
      ['Турка и френч-пресс', 'Омни-обжарка: универсальная, подходит и для фильтра, и для эспрессо.', '#/?roast=omni', 'Омни'],
      ['На работе и в дороге', 'Дрип-пакеты по 12 г: нужна только чашка и горячая вода.', '#/?cat=drip', 'Дрип-пакеты']
    ];
    return '<section class="band" aria-labelledby="band-title">' +
      '<div class="container band__grid">' +
        '<figure class="band__media"><img src="img/pourover.webp" width="1024" height="577" alt="Кофе заваривается в воронке над стеклянным чайником у окна" /></figure>' +
        '<div>' +
          '<p class="eyebrow">Не знаете, с чего начать</p>' +
          '<h2 class="h1 band__title" id="band-title">Выберите по способу заваривания</h2>' +
          '<div class="methods">' + methods.map(function (m) {
            return '<a class="method" href="' + m[2] + '"><span class="method__name">' + esc(m[0]) + '</span><span class="method__text">' + esc(m[1]) +
              '</span><span class="method__go"><span>' + esc(m[3]) + '</span>' + icon('arrow-right') + '</span></a>';
          }).join('') + '</div>' +
        '</div>' +
      '</div>' +
    '</section>';
  }

  function viewCatalog(query) {
    setTitle('');
    readFilters(query);
    var sortOpts = D.sorts.map(function (s) { return '<option value="' + s.id + '">' + esc(s.label) + '</option>'; }).join('');
    view.innerHTML = storyHTML() +
      '<section class="catalog container" id="catalog" aria-labelledby="catalog-title">' +
        '<div class="catalog__head">' +
          '<div class="catalog__title"><h2 class="h1" id="catalog-title" tabindex="-1">Каталог</h2><p class="catalog__count" id="result-count" aria-live="polite"></p></div>' +
          '<div class="catalog__tools">' +
            '<button class="btn btn--secondary filters-toggle" type="button" id="filters-open" aria-haspopup="dialog">' + icon('sliders') + '<span id="filters-open-label">Фильтры</span></button>' +
            '<label class="sr-only" for="sort">Сортировка</label>' +
            '<select class="select" id="sort">' + sortOpts + '</select>' +
          '</div>' +
        '</div>' +
        '<div class="catalog__layout">' +
          '<aside class="catalog__aside" id="filters-home" aria-label="Фильтры">' + filtersFormHTML() + '</aside>' +
          '<div class="catalog__main"><div id="active-filters"></div><div id="results"></div></div>' +
        '</div>' +
      '</section>' + bandHTML();

    var form = $('#filters-form');
    form.addEventListener('change', onFilterInput);
    form.addEventListener('input', debounce(onFilterInput, 250));
    form.addEventListener('submit', function (e) { e.preventDefault(); });
    $('#sort').addEventListener('change', function () { catalogState.sort = this.value; writeUrl(); renderResults(); });
    $('#to-catalog').addEventListener('click', function () { scrollToCatalog(true); });
    $('#filters-open').addEventListener('click', function () {
      $('#filters-slot').appendChild(form);
      openDialog(filtersDialog, this);
    });
    $('#search-input').value = catalogState.q;
    syncFilterForm();
    renderResults();
  }

  function onCatalogClick(e) {
    if (current.name !== 'catalog' || !catalogState) return;
    if (e.target.closest('[data-reset]')) { resetFilters(); return; }
    var pill = e.target.closest('[data-unset]');
    if (pill) unsetFilter(pill.dataset.unset);
  }
  view.addEventListener('click', onCatalogClick);
  filtersDialog.addEventListener('click', onCatalogClick);

  filtersDialog.addEventListener('close', function () {
    var form = $('#filters-form', filtersDialog);
    var home = $('#filters-home');
    if (form && home) home.appendChild(form);
  });

  function onFilterInput(e) {
    var form = $('#filters-form');
    if (!form || !catalogState) return;
    var t = e && e.target;
    if (e && e.type === 'input' && t && t.type !== 'number') return;
    catalogState.cat = (form.querySelector('input[name="cat"]:checked') || {}).value || 'all';
    catalogState.proc = $$('input[name="proc"]:checked', form).map(function (i) { return i.value; });
    catalogState.roast = $$('input[name="roast"]:checked', form).map(function (i) { return i.value; });
    catalogState.min = String(Math.max(0, parseInt(form.min.value, 10) || 0) || '');
    catalogState.max = String(Math.max(0, parseInt(form.max.value, 10) || 0) || '');
    writeUrl();
    renderResults();
  }
  function syncFilterForm() {
    var form = $('#filters-form');
    if (!form) return;
    $$('input[name="cat"]', form).forEach(function (i) { i.checked = i.value === catalogState.cat; });
    $$('input[name="proc"]', form).forEach(function (i) { i.checked = catalogState.proc.indexOf(i.value) >= 0; });
    $$('input[name="roast"]', form).forEach(function (i) { i.checked = catalogState.roast.indexOf(i.value) >= 0; });
    if (document.activeElement !== form.min) form.min.value = catalogState.min;
    if (document.activeElement !== form.max) form.max.value = catalogState.max;
    var sort = $('#sort');
    if (sort) sort.value = catalogState.sort;
    var search = $('#search-input');
    if (document.activeElement !== search) search.value = catalogState.q;
  }
  function resetFilters() {
    catalogState.cat = 'all'; catalogState.proc = []; catalogState.roast = [];
    catalogState.min = ''; catalogState.max = ''; catalogState.q = '';
    $('#search-input').value = '';
    var form = $('#filters-form');
    if (form) { form.min.value = ''; form.max.value = ''; }
    syncFilterForm();
    writeUrl();
    renderResults();
    announce('Фильтры сброшены');
    var h = $('#catalog-title');
    if (h && !filtersDialog.open) h.focus();
  }
  function unsetFilter(token) {
    var parts = token.split(':');
    var k = parts[0], v = parts[1];
    if (k === 'cat') catalogState.cat = 'all';
    else if (k === 'proc' || k === 'roast') catalogState[k] = catalogState[k].filter(function (x) { return x !== v; });
    else if (k === 'min' || k === 'max' || k === 'q') catalogState[k] = '';
    if (k === 'q') $('#search-input').value = '';
    var form = $('#filters-form');
    if (form && (k === 'min' || k === 'max')) form[k].value = '';
    syncFilterForm();
    writeUrl();
    renderResults();
    var next = $('#active-filters [data-unset]') || $('#catalog-title');
    if (next) next.focus();
  }

  function renderResults() {
    var f = catalogState;
    var list = sortList(D.products.filter(function (p) { return matches(p, f); }), f.sort);
    var n = activeCount(f);

    D.categories.forEach(function (c) {
      var el = $('[data-count="' + c.id + '"]');
      if (!el) return;
      var tmp = Object.assign({}, f, { cat: c.id });
      el.textContent = D.products.filter(function (p) { return matches(p, tmp); }).length;
    });

    var priceErr = $('#f-price-error');
    if (priceErr) {
      var bad = !priceRangeValid(f);
      priceErr.hidden = !bad;
      $('#f-max').setAttribute('aria-invalid', bad ? 'true' : 'false');
    }
    $$('[data-reset]', $('#filters-form') || document).forEach(function (b) { b.hidden = n === 0; });
    $('#result-count').textContent = list.length ? 'Найдено: ' + items(list.length) : 'Ничего не найдено';
    $('#filters-open-label').textContent = n ? 'Фильтры: ' + n : 'Фильтры';
    $('#filters-apply').textContent = list.length ? 'Показать ' + items(list.length) : 'Ничего не найдено, изменить фильтры';

    var pills = [];
    if (f.q) pills.push(['q', 'Поиск: «' + f.q + '»']);
    if (f.cat !== 'all') pills.push(['cat', LABEL.cat[f.cat]]);
    f.proc.forEach(function (x) { pills.push(['proc:' + x, LABEL.process[x]]); });
    f.roast.forEach(function (x) { pills.push(['roast:' + x, LABEL.roast[x]]); });
    if (f.min) pills.push(['min', 'от ' + money(f.min)]);
    if (f.max) pills.push(['max', 'до ' + money(f.max)]);
    $('#active-filters').innerHTML = pills.length ? '<div class="active-filters" aria-label="Активные фильтры" role="group">' +
      pills.map(function (x) {
        return '<button class="pill" type="button" data-unset="' + esc(x[0]) + '" aria-label="Убрать фильтр: ' + esc(x[1]) + '">' + esc(x[1]) + icon('x') + '</button>';
      }).join('') +
      '<button class="btn btn--ghost btn--sm" type="button" data-reset>Сбросить всё</button></div>' : '';

    var results = $('#results');
    if (!list.length) {
      results.innerHTML = '<div class="empty">' + icon('search-x') +
        '<h3 class="empty__title">Под эти условия ничего нет</h3>' +
        '<p>' + (f.q ? 'По запросу «' + esc(f.q) + '» с выбранными фильтрами товаров не нашлось. ' : 'Такого сочетания фильтров в каталоге нет. ') +
        'Попробуйте убрать часть условий или начните заново.</p>' +
        '<div class="empty__actions"><button class="btn btn--primary" type="button" data-reset>Сбросить фильтры</button></div></div>';
      return;
    }
    var eyebrow = n === 0 && f.sort === 'rec' ? 'Выбор обжарщика на этой неделе' : 'Первое совпадение';
    results.innerHTML = '<div class="grid">' + list.map(function (p, i) { return cardHTML(p, { lead: i === 0, eyebrow: eyebrow }); }).join('') + '</div>';
  }

  function scrollToCatalog(focus) {
    var el = $('#catalog');
    if (!el) return;
    el.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
    if (focus) $('#catalog-title').focus({ preventScroll: true });
  }

  /* Поиск в шапке */
  var searchForm = $('#search-form');
  var searchInput = $('#search-input');
  var liveSearch = debounce(function () {
    if (current.name !== 'catalog' || !catalogState) return;
    catalogState.q = searchInput.value.trim().slice(0, 60);
    writeUrl();
    renderResults();
  }, 200);
  searchInput.addEventListener('input', liveSearch);
  searchForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var q = searchInput.value.trim().slice(0, 60);
    if (current.name === 'catalog' && catalogState) {
      catalogState.q = q; writeUrl(); renderResults(); scrollToCatalog();
    } else {
      navigate('#/' + (q ? '?q=' + encodeURIComponent(q) : ''));
    }
  });

  /* ================= Страница товара ================= */
  function viewProduct(p) {
    setTitle(p.name);
    var photo = D.photos[p.photo];
    var shots = [{ id: 'front', label: 'Упаковка', html: ART.front(p) }];
    if (p.cat === 'single' || p.cat === 'blend') shots.push({ id: 'back', label: 'Обратная сторона: данные лота', html: ART.back(p, fShort(lastRoast())) });
    shots.push({ id: 'photo', label: photo.alt, html: '<img src="' + photo.src + '" width="' + photo.w + '" height="' + photo.h + '" alt="' + esc(photo.alt) + '" />' });

    var tabs = shots.map(function (s, i) {
      return '<button class="thumb" type="button" role="tab" id="tab-' + s.id + '" aria-controls="gallery-panel" aria-selected="' + (i === 0) + '" tabindex="' + (i === 0 ? 0 : -1) + '" aria-label="' + esc(s.label) + '" data-shot="' + i + '">' +
        (s.id === 'photo' ? '<img src="' + photo.src + '" width="' + photo.w + '" height="' + photo.h + '" alt="" loading="lazy" />' : s.html) + '</button>';
    }).join('');

    var v0 = p.variants[0];
    var weights = p.variants.length > 1 ? '<fieldset class="buy__group"><legend class="buy__legend">' + (p.cat === 'drip' ? 'Фасовка' : 'Вес') + '</legend><div class="options">' +
      p.variants.map(function (v, i) {
        return '<label class="option"><input type="radio" name="variant" value="' + v.id + '"' + (i === 0 ? ' checked' : '') + '><span class="option__box"><span class="option__title">' + esc(v.label) + '</span><span class="muted">' + money(v.price) + '</span></span></label>';
      }).join('') + '</div></fieldset>' : '';
    var grinds = p.grinds ? '<fieldset class="buy__group"><legend class="buy__legend">Помол</legend><div class="options">' +
      D.grinds.map(function (g, i) {
        return '<label class="option"><input type="radio" name="grind" value="' + g.id + '"' + (i === 0 ? ' checked' : '') + '><span class="option__box"><span class="option__title">' + esc(g.label) + '</span></span></label>';
      }).join('') + '</div></fieldset>' : '';

    var nr = nextRoast(new Date(Date.now() + DAY));
    var fav = isFav(p.id);
    var coffeeDetails = p.profile ? (
      '<section class="details" aria-label="Вкус и происхождение">' +
        '<div class="details__profile">' +
          '<h2 class="h2">Вкусовой профиль</h2>' + scalesHTML(p) +
          '<div class="details__brew"><strong>Как заваривать</strong>' + esc(p.brew) + '</div>' +
        '</div>' +
        '<div class="prose"><h2 class="h2">Происхождение</h2><p style="margin-block:var(--space-4) var(--space-6)">' + esc(p.text) + '</p>' +
          '<dl class="spec">' + [
            ['Страна', p.country], ['Регион', p.region], ['Высота', p.altitude], ['Разновидность', p.variety],
            ['Обработка', p.processLabel], ['Обжарка', LABEL.roast[p.roast].toLowerCase()], ['Урожай', p.harvest], ['Оценка SCA', String(p.sca).replace('.', ',')]
          ].map(function (r) { return '<div><dt>' + r[0] + '</dt><dd>' + esc(r[1]) + '</dd></div>'; }).join('') + '</dl>' +
        '</div>' +
      '</section>') : (
      '<section class="details" aria-label="Описание">' +
        '<div class="details__profile"><h2 class="h2">Характеристики</h2><p>' + esc(p.spec) + '</p>' +
          '<div class="details__brew"><strong>Совет</strong>' + esc(p.brew) + '</div></div>' +
        '<div class="prose"><h2 class="h2">Зачем он нужен</h2><p style="margin-top:var(--space-4)">' + esc(p.text) + '</p></div>' +
      '</section>');

    view.innerHTML = '<div class="page container">' +
      '<nav class="crumbs" aria-label="Навигация по разделам"><a href="#/">Каталог</a>' + icon('chevron-right') +
        '<a href="#/?cat=' + p.cat + '">' + esc(LABEL.cat[p.cat]) + '</a>' + icon('chevron-right') + '<span aria-current="page">' + esc(p.name) + '</span></nav>' +
      '<div class="product">' +
        '<div class="gallery">' +
          '<div class="gallery__stage" role="tabpanel" id="gallery-panel" aria-labelledby="tab-front" tabindex="0">' + shots[0].html + '<div class="badges">' + badgesHTML(p, true) + '</div></div>' +
          '<div class="gallery__thumbs" role="tablist" aria-label="Изображения товара">' + tabs + '</div>' +
        '</div>' +
        '<div class="buy">' +
          '<div class="buy__head">' +
            '<p class="eyebrow">' + esc(p.cat === 'gear' ? 'Аксессуары' : metaLine(p)) + '</p>' +
            '<h1 class="h1">' + esc(p.name) + '</h1>' +
            (p.cat !== 'gear' ? '<p class="buy__origin">' + esc(p.region + ', ' + p.altitude) + '</p>' : '') +
          '</div>' +
          '<p class="buy__lead">' + esc(p.lead) + '</p>' +
          (p.descriptors.length ? '<ul class="buy__notes" aria-label="Дескрипторы вкуса">' + p.descriptors.map(function (d) { return '<li class="note-chip">' + esc(d) + '</li>'; }).join('') + '</ul>' : '') +
          '<div class="buy__price"><span class="price" id="buy-price">' + money(v0.price) + '</span><span class="buy__sca" id="buy-per">' +
            esc('за ' + v0.label + (p.sca ? ' · SCA ' + String(p.sca).replace('.', ',') : '')) + '</span></div>' +
          '<form class="buy" id="buy-form" novalidate>' +
            weights + grinds +
            '<div class="buy__group"><span class="buy__legend" id="qty-label">Количество</span>' +
              '<div class="buy__row">' +
                '<div class="stepper" role="group" aria-labelledby="qty-label">' +
                  '<button class="stepper__btn" type="button" data-step="-1" aria-label="Уменьшить количество">' + icon('minus') + '</button>' +
                  '<output class="stepper__value" id="qty" aria-live="polite">1</output>' +
                  '<button class="stepper__btn" type="button" data-step="1" aria-label="Увеличить количество">' + icon('plus') + '</button>' +
                '</div>' +
                '<button class="btn btn--primary" type="submit" id="buy-add"><span class="spinner" aria-hidden="true"></span>' + icon('bag', 'btn__icon') + '<span class="btn__text">В корзину</span></button>' +
                '<button class="btn btn--secondary" type="button" data-fav="' + p.id + '" aria-pressed="' + fav + '">' + icon('heart') + '<span class="btn__text">' + (fav ? 'В избранном' : 'В избранное') + '</span></button>' +
              '</div>' +
              '<p class="buy__stock" id="buy-stock"></p>' +
            '</div>' +
          '</form>' +
          '<ul class="buy__facts">' +
            (p.isCoffee ? '<li>' + icon('flame') + 'Ближайшая обжарка: ' + esc(fDay(nr)) + '</li>' : '') +
            '<li>' + icon('truck') + 'Доставка по России бесплатно от 3000 ₽</li>' +
            '<li>' + icon('store') + 'Самовывоз из обжарочной на Васильевском</li>' +
          '</ul>' +
        '</div>' +
      '</div>' +
      coffeeDetails +
      pairsHTML(p) +
    '</div>';

    /* Галерея: вкладки со стрелками */
    var tabEls = $$('[role="tab"]', view);
    var panel = $('#gallery-panel');
    function selectShot(i, focus) {
      tabEls.forEach(function (t, j) {
        t.setAttribute('aria-selected', j === i ? 'true' : 'false');
        t.tabIndex = j === i ? 0 : -1;
      });
      panel.setAttribute('aria-labelledby', tabEls[i].id);
      panel.innerHTML = shots[i].html + (i === 0 ? '<div class="badges">' + badgesHTML(p, true) + '</div>' : '');
      if (focus) tabEls[i].focus();
    }
    tabEls.forEach(function (t, i) {
      t.addEventListener('click', function () { selectShot(i, false); });
      t.addEventListener('keydown', function (e) {
        var k = e.key, n = tabEls.length, to = null;
        if (k === 'ArrowRight' || k === 'ArrowDown') to = (i + 1) % n;
        else if (k === 'ArrowLeft' || k === 'ArrowUp') to = (i - 1 + n) % n;
        else if (k === 'Home') to = 0;
        else if (k === 'End') to = n - 1;
        if (to !== null) { e.preventDefault(); selectShot(to, true); }
      });
    });

    /* Покупка */
    var form = $('#buy-form');
    var qty = 1;
    var qtyEl = $('#qty');
    var addBtn = $('#buy-add');
    function selected() {
      var v = form.variant ? form.variant.value : v0.id;
      var g = form.grind ? form.grind.value : null;
      return { v: v, g: g };
    }
    function paint() {
      var s = selected();
      var v = variantOf(p, s.v);
      var left = available(p.id);
      var max = left === Infinity ? 99 : left;
      if (qty > max) qty = Math.max(1, max);
      qtyEl.textContent = qty;
      $('[data-step="-1"]', form).disabled = qty <= 1;
      $('[data-step="1"]', form).disabled = qty >= max;
      $('#buy-price').textContent = money(v.price * qty);
      $('#buy-per').textContent = (qty > 1 ? qty + ' × ' + money(v.price) + ', ' : 'за ') + v.label + (p.sca ? ' · SCA ' + String(p.sca).replace('.', ',') : '');
      var stockEl = $('#buy-stock');
      var had = inCart(p.id);
      stockEl.classList.toggle('is-limit', left !== Infinity && left <= 5);
      if (left === 0) {
        stockEl.innerHTML = icon('info') + 'В корзине уже весь остаток: ' + had + ' шт. Больше на складе нет.';
      } else if (p.stock != null && p.stock <= 5) {
        stockEl.innerHTML = icon('alert') + 'На складе ' + p.stock + ' шт.' + (had ? ', из них ' + had + ' уже в вашей корзине.' : '. Больше добавить не получится.');
      } else {
        stockEl.innerHTML = icon('circle-check') + 'В наличии' + (had ? ', в корзине ' + had + ' шт.' : '');
      }
      if (addBtn.getAttribute('aria-busy') !== 'true' && !addBtn.classList.contains('is-done')) {
        addBtn.disabled = left === 0;
      }
    }
    form.addEventListener('change', paint);
    form.addEventListener('click', function (e) {
      var st = e.target.closest('[data-step]');
      if (!st || st.disabled) return;
      qty += Number(st.dataset.step);
      paint();
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (addBtn.disabled) return;
      var s = selected();
      runAdd(addBtn, p.id, s.v, s.g, qty, function () { qty = 1; paint(); });
    });
    var onCart = function () { if (document.contains(form)) paint(); else document.removeEventListener('cart:change', onCart); };
    document.addEventListener('cart:change', onCart);
    paint();
  }

  function pairsHTML(p) {
    var list = (p.pairs || []).map(function (id) { return byId[id]; }).filter(Boolean).slice(0, 3);
    if (!list.length) return '';
    return '<section class="pairs" aria-labelledby="pairs-title">' +
      '<div class="pairs__head"><h2 class="h2" id="pairs-title">С этим берут</h2></div>' +
      '<div class="pairs__grid">' + list.map(function (q, i) {
        return '<article class="pair' + (i === 0 ? ' pair--lead' : '') + '">' +
          '<div class="pair__media">' + ART.front(q) + '</div>' +
          '<div class="pair__text"><p class="pair__meta">' + esc(metaLine(q)) + '</p><h3 class="pair__name"><a href="#/product/' + q.id + '">' + esc(q.name) + '</a></h3>' +
          '<p class="pair__lead">' + esc(q.lead) + '</p></div>' +
          '<div class="pair__row"><span class="price">' + (q.variants.length > 1 ? 'от ' : '') + money(q.minPrice) + '</span>' + addBtnHTML(q, 'pair__add card__add') + '</div>' +
        '</article>';
      }).join('') + '</div>' +
    '</section>';
  }

  /* ================= Корзина: панель ================= */
  var cartBody = $('#cart-body');
  var cartFoot = $('#cart-foot');
  var promoError = '';
  var promoValue = '';

  function openCart(trigger) {
    renderCart();
    openDialog(cartDialog, trigger || cartBtn);
  }
  cartBtn.addEventListener('click', function () { openCart(cartBtn); });

  function renderCart() {
    var active = document.activeElement;
    var fk = active && active.dataset ? active.dataset.fk : null;
    var n = cartCount();
    $('#cart-title').innerHTML = 'Корзина' + (n ? ' <span class="muted">' + items(n) + '</span>' : '');

    if (!state.cart.length) {
      cartBody.innerHTML = (state.removed ? undoHTML() : '') +
        '<div class="cart-empty">' + ART.front({ cat: 'single', pack: 'kraft', packTitle: 'Пока пусто', packSub: 'ждём ваш выбор' }) +
        '<h3 class="empty__title">В корзине пока пусто</h3><p>Начните с омни-обжарки: она подходит и для турки, и для воронки.</p>' +
        '<a class="btn btn--primary" href="#/?roast=omni" data-fk="empty-cta">Выбрать кофе' + icon('arrow-right') + '</a></div>';
      cartFoot.innerHTML = '';
      restoreFocus(fk);
      return;
    }

    var total = afterDiscount();
    var left = Math.max(0, D.freeShippingFrom - total);
    var pct = Math.min(1, total / D.freeShippingFrom);
    var ship = '<div class="ship' + (left === 0 ? ' is-free' : '') + '">' +
      '<p class="ship__text">' + (left === 0 ? icon('circle-check') + 'Доставка курьером и в пункт выдачи бесплатная' : icon('truck') + 'До бесплатной доставки ' + money(left)) + '</p>' +
      '<div class="ship__bar" role="progressbar" aria-label="Сумма до бесплатной доставки" aria-valuemin="0" aria-valuemax="' + D.freeShippingFrom + '" aria-valuenow="' + Math.min(total, D.freeShippingFrom) + '" aria-valuetext="' + (left ? 'Осталось ' + money(left) : 'Бесплатная доставка') + '">' +
      '<div class="ship__fill" style="transform:scaleX(' + pct.toFixed(3) + ')"></div></div></div>';

    var lines = '<ul class="lines" aria-label="Товары в корзине">' + state.cart.map(function (l) {
      var p = byId[l.pid];
      var v = variantOf(p, l.v);
      var key = keyOf(l);
      var max = l.qty + available(l.pid);
      var variant = v.label + (l.g ? ', ' + LABEL.grind[l.g].toLowerCase() : '');
      return '<li class="line">' +
        '<a class="line__media" href="#/product/' + p.id + '" tabindex="-1" aria-hidden="true">' + ART.front(p) + '</a>' +
        '<div class="line__info">' +
          '<div class="line__top"><a class="line__name" href="#/product/' + p.id + '">' + esc(p.name) + '</a><span class="price">' + money(v.price * l.qty) + '</span></div>' +
          '<p class="line__variant">' + esc(variant) + (l.qty > 1 ? ' · ' + money(v.price) + ' за шт.' : '') + '</p>' +
        '</div>' +
        '<div class="line__actions">' +
          '<div class="stepper stepper--sm" role="group" aria-label="Количество: ' + esc(p.name) + '">' +
            '<button class="stepper__btn" type="button" data-qty="' + esc(key) + '" data-d="-1" data-fk="dec-' + esc(key) + '"' + (l.qty <= 1 ? ' disabled' : '') + ' aria-label="Уменьшить: ' + esc(p.name) + '">' + icon('minus', 'icon--sm') + '</button>' +
            '<span class="stepper__value" aria-live="polite">' + l.qty + '</span>' +
            '<button class="stepper__btn" type="button" data-qty="' + esc(key) + '" data-d="1" data-fk="inc-' + esc(key) + '"' + (l.qty >= max ? ' disabled' : '') + ' aria-label="Увеличить: ' + esc(p.name) + '">' + icon('plus', 'icon--sm') + '</button>' +
          '</div>' +
          '<button class="btn btn--danger-ghost btn--sm" type="button" data-remove="' + esc(key) + '" aria-label="Удалить из корзины: ' + esc(p.name + ', ' + variant) + '">' + icon('trash', 'icon--sm') + 'Удалить</button>' +
        '</div>' +
        (l.qty >= max && p.stock != null ? '<p class="line__limit">Это весь остаток на складе.</p>' : '') +
      '</li>';
    }).join('') + '</ul>';

    var promo = state.promo
      ? '<div class="promo__applied"><span>' + icon('circle-check') + 'Промокод ' + esc(state.promo) + ': скидка ' + D.promo.percent + '%</span><button class="btn btn--ghost btn--sm" type="button" data-promo-remove data-fk="promo-remove">Убрать</button></div>'
      : '<form class="promo" id="promo-form" novalidate>' +
          '<label class="field__label" for="promo-input">Промокод</label>' +
          '<div class="promo__row"><input class="input" id="promo-input" name="promo" autocomplete="off" autocapitalize="characters" spellcheck="false" data-fk="promo-input" value="' + esc(promoValue) + '"' +
            (promoError ? ' aria-invalid="true" aria-describedby="promo-error"' : ' aria-describedby="promo-hint"') + '>' +
          '<button class="btn btn--secondary" type="submit" data-fk="promo-apply">Применить</button></div>' +
          (promoError ? '<p class="field__error" id="promo-error">' + icon('alert') + '<span>' + esc(promoError) + '</span></p>'
            : '<p class="field__hint" id="promo-hint">Для демо: ZERNO10 даёт скидку 10%.</p>') +
        '</form>';

    cartBody.innerHTML = ship + (state.removed ? undoHTML() : '') + lines + promo;

    var disc = discountTotal();
    cartFoot.innerHTML = '<dl class="totals">' +
      '<div><dt>Товары, ' + items(n) + '</dt><dd>' + money(goodsTotal()) + '</dd></div>' +
      (disc ? '<div class="is-discount"><dt>Скидка по промокоду</dt><dd>−' + money(disc) + '</dd></div>' : '') +
      '<div><dt>Доставка</dt><dd>' + (left === 0 ? 'бесплатно' : 'от 0 ₽, выберите дальше') + '</dd></div>' +
      '<div class="totals__sum"><dt>Итого</dt><dd>' + money(total) + '</dd></div>' +
    '</dl>' +
    '<a class="btn btn--primary btn--block" href="#/checkout" data-fk="checkout">Оформить заказ' + icon('arrow-right') + '</a>' +
    '<p class="totals__note">Самовывоз из обжарочной всегда бесплатный.</p>';

    restoreFocus(fk);
  }
  function undoHTML() {
    var p = byId[state.removed.line.pid];
    return '<div class="undo" role="status"><span>«' + esc(p.name) + '» удалён из корзины.</span>' +
      '<button class="btn btn--ghost btn--sm" type="button" data-undo data-fk="undo">' + icon('undo', 'icon--sm') + 'Вернуть</button></div>';
  }
  function restoreFocus(fk) {
    if (!cartDialog.open || !fk) return;
    var el = $('[data-fk="' + (window.CSS && CSS.escape ? CSS.escape(fk) : fk) + '"]', cartDialog);
    if (el && !el.disabled) { el.focus(); return; }
    if (/^(dec|inc)-/.test(fk)) {
      var key = fk.replace(/^(dec|inc)-/, '');
      var other = $$('[data-qty]', cartDialog).filter(function (b) { return b.dataset.qty === key && !b.disabled; })[0];
      if (other) { other.focus(); return; }
    }
    var undo = $('[data-undo]', cartDialog);
    (undo || $('[data-close]', cartDialog)).focus();
  }

  cartDialog.addEventListener('click', function (e) {
    var link = e.target.closest('a[href^="#"]');
    if (link) {
      if (link.getAttribute('href') !== location.hash) cartDialog.dataset.noReturn = '1';
      closeDialog(cartDialog, true);
      return;
    }
    var q = e.target.closest('[data-qty]');
    if (q && !q.disabled) {
      var line = state.cart.filter(function (l) { return keyOf(l) === q.dataset.qty; })[0];
      if (line) setQty(q.dataset.qty, line.qty + Number(q.dataset.d));
      return;
    }
    var rm = e.target.closest('[data-remove]');
    if (rm) {
      var name = byId[rm.dataset.remove.split('|')[0]].name;
      removeLine(rm.dataset.remove);
      announce('«' + name + '» удалён из корзины. Можно вернуть кнопкой «Вернуть».');
      var undo = $('[data-undo]', cartDialog);
      if (undo) undo.focus();
      return;
    }
    if (e.target.closest('[data-undo]')) { undoRemove(); announce('Товар возвращён в корзину'); var first = $('[data-remove]', cartDialog); if (first) first.focus(); return; }
    if (e.target.closest('[data-promo-remove]')) {
      state.promo = null; save('promo', null); promoValue = ''; promoError = '';
      renderCart(); announce('Промокод убран');
      var inp = $('#promo-input'); if (inp) inp.focus();
      document.dispatchEvent(new CustomEvent('cart:change'));
    }
  });
  cartDialog.addEventListener('input', function (e) {
    if (e.target.id === 'promo-input') promoValue = e.target.value;
  });
  cartDialog.addEventListener('submit', function (e) {
    if (e.target.id !== 'promo-form') return;
    e.preventDefault();
    var code = (promoValue || '').trim().toUpperCase();
    if (!code) promoError = 'Введите промокод, например из рассылки.';
    else if (code === D.promo.code) {
      state.promo = code; save('promo', code); promoError = ''; promoValue = '';
      renderCart();
      announce('Промокод применён: скидка ' + D.promo.percent + '%');
      var rmBtn = $('[data-promo-remove]'); if (rmBtn) rmBtn.focus();
      document.dispatchEvent(new CustomEvent('cart:change'));
      return;
    } else if (/[а-яё]/i.test(code)) promoError = 'Промокод «' + code + '» не найден. Похоже, включена русская раскладка: коды вводятся латиницей.';
    else promoError = 'Промокод «' + code + '» не найден. Проверьте написание или срок действия.';
    renderCart();
    var input = $('#promo-input');
    if (input) input.focus();
  });

  /* ================= Оформление заказа ================= */
  var co = { step: 1, tried: {} };
  var placing = false;
  var STEP_NAMES = ['Контакты', 'Доставка', 'Оплата', 'Подтверждение'];

  function deliveryDates(method) {
    var nr = nextRoast(new Date(Date.now() + DAY));
    var out = [];
    var start = method === 'pickup' ? 1 : 1;
    for (var i = start; i < start + 3; i++) {
      var d = new Date(nr.getTime() + i * DAY);
      if (d.getDay() === 0) continue;
      out.push(d);
    }
    return out;
  }

  function viewCheckout() {
    setTitle('Оформление заказа');
    if (!state.cart.length) {
      view.innerHTML = '<div class="page container"><div class="page__head"><h1 class="h1">Оформление заказа</h1></div>' +
        '<div class="empty">' + icon('bag') + '<h2 class="empty__title">Пока нечего оформлять</h2><p>Корзина пуста. Добавьте кофе или аксессуары, и сюда можно будет вернуться.</p>' +
        '<div class="empty__actions"><a class="btn btn--primary" href="#/">Перейти в каталог</a>' +
        (state.orders.length ? '<a class="btn btn--secondary" href="#/orders">История заказов</a>' : '') + '</div></div></div>';
      return;
    }
    if (co.step < 1 || co.step > 4) co.step = 1;
    view.innerHTML = '<div class="page container">' +
      '<nav class="crumbs" aria-label="Навигация по разделам"><a href="#/">Каталог</a>' + icon('chevron-right') + '<span aria-current="page">Оформление</span></nav>' +
      '<div class="page__head"><h1 class="h1">Оформление заказа</h1></div>' +
      '<div class="checkout">' +
        '<div class="checkout__main">' +
          '<details class="summary-toggle" id="summary-toggle"><summary><span>Ваш заказ: <span id="summary-total-m"></span></span>' + icon('chevron-down') + '</summary><div id="summary-m"></div></details>' +
          '<ol class="steps" id="steps" aria-label="Шаги оформления"></ol>' +
          '<div id="step"></div>' +
        '</div>' +
        '<aside class="checkout__aside" aria-label="Ваш заказ"><div id="summary"></div></aside>' +
      '</div></div>';
    renderStep(false);
    var onCart = function () {
      if (!document.contains($('#step'))) { document.removeEventListener('cart:change', onCart); return; }
      if (placing) return;
      if (!state.cart.length) { viewCheckout(); return; }
      renderSummary();
    };
    document.addEventListener('cart:change', onCart);
  }

  function renderSteps() {
    $('#steps').innerHTML = STEP_NAMES.map(function (s, i) {
      var n = i + 1;
      return '<li' + (n === co.step ? ' aria-current="step"' : '') + (n < co.step ? ' class="is-done"' : '') + '><span class="steps__num" aria-hidden="true">' +
        (n < co.step ? icon('check', 'icon--sm') : n) + '</span><span>' + s + (n < co.step ? '<span class="sr-only">, готово</span>' : '') + '</span></li>';
    }).join('');
  }

  function summaryHTML() {
    var d = state.draft;
    var disc = discountTotal();
    var ship = d.method ? deliveryPrice(d.method) : null;
    var total = afterDiscount() + (ship || 0);
    return '<div class="summary">' +
      '<h2 class="summary__title">Ваш заказ</h2>' +
      '<ul class="summary__items">' + state.cart.map(function (l) {
        var p = byId[l.pid], v = variantOf(p, l.v);
        return '<li class="summary__item"><span class="summary__thumb">' + ART.front(p) + '</span><span>' + esc(p.name) +
          '<small>' + esc(v.label + (l.g ? ', ' + LABEL.grind[l.g].toLowerCase() : '') + ' × ' + l.qty) + '</small></span><span class="num">' + money(v.price * l.qty) + '</span></li>';
      }).join('') + '</ul>' +
      '<dl class="totals">' +
        '<div><dt>Товары</dt><dd>' + money(goodsTotal()) + '</dd></div>' +
        (disc ? '<div class="is-discount"><dt>Скидка ' + esc(state.promo) + '</dt><dd>−' + money(disc) + '</dd></div>' : '') +
        '<div><dt>Доставка</dt><dd>' + (ship === null ? 'на шаге 2' : ship === 0 ? 'бесплатно' : money(ship)) + '</dd></div>' +
        '<div class="totals__sum"><dt>Итого</dt><dd>' + money(total) + '</dd></div>' +
      '</dl>' +
      (!state.promo ? '<p class="totals__note">Промокод можно ввести в корзине.</p>' : '') +
    '</div>';
  }
  function renderSummary() {
    var html = summaryHTML();
    $('#summary').innerHTML = html;
    $('#summary-m').innerHTML = html;
    var d = state.draft;
    $('#summary-total-m').textContent = money(afterDiscount() + (d.method ? deliveryPrice(d.method) : 0));
  }

  /* Поля формы */
  function fieldHTML(o) {
    var d = state.draft;
    var val = o.value != null ? o.value : (d[o.name] || '');
    var err = o.name + '-error';
    var control;
    if (o.type === 'select') {
      control = '<select class="select" id="f-' + o.name + '" name="' + o.name + '" aria-describedby="' + err + (o.hint ? ' ' + o.name + '-hint' : '') + '">' +
        o.options.map(function (op) { return '<option value="' + esc(op[0]) + '"' + (String(val) === String(op[0]) ? ' selected' : '') + '>' + esc(op[1]) + '</option>'; }).join('') + '</select>';
    } else {
      control = '<input class="input" id="f-' + o.name + '" name="' + o.name + '" type="' + (o.type || 'text') + '"' +
        (o.auto ? ' autocomplete="' + o.auto + '"' : '') + (o.mode ? ' inputmode="' + o.mode + '"' : '') + (o.ph ? ' placeholder="' + esc(o.ph) + '"' : '') +
        (o.max ? ' maxlength="' + o.max + '"' : '') + ' value="' + esc(val) + '" aria-describedby="' + err + (o.hint ? ' ' + o.name + '-hint' : '') + '"' + (o.optional ? '' : ' aria-required="true"') + '>';
    }
    return '<div class="field">' +
      '<label class="field__label" for="f-' + o.name + '">' + esc(o.label) + (o.optional ? ' <span class="field__opt">(необязательно)</span>' : '') + '</label>' +
      control +
      (o.hint ? '<p class="field__hint" id="' + o.name + '-hint">' + esc(o.hint) + '</p>' : '') +
      '<p class="field__error" id="' + err + '" hidden>' + icon('alert') + '<span></span></p>' +
    '</div>';
  }

  function stepHTML() {
    var d = state.draft;
    if (co.step === 1) {
      return '<h2 class="step__title" tabindex="-1">Контакты</h2>' +
        '<div class="step__fields">' +
          fieldHTML({ name: 'name', label: 'Имя', auto: 'given-name', ph: 'Анна' }) +
          '<div class="form-row form-row--2">' +
            fieldHTML({ name: 'phone', label: 'Телефон', type: 'tel', auto: 'tel', mode: 'tel', ph: '+7 (900) 000-00-00', hint: 'Позвоним, только если что-то пойдёт не так.' }) +
            fieldHTML({ name: 'email', label: 'Email', type: 'email', auto: 'email', mode: 'email', ph: 'anna@mail.ru', hint: 'Для чека и номера отслеживания.' }) +
          '</div>' +
        '</div>';
    }
    if (co.step === 2) {
      var method = d.method || 'courier';
      var opts = D.delivery.map(function (m) {
        var price = deliveryPrice(m.id);
        var ic = m.id === 'courier' ? 'truck' : m.id === 'pickup' ? 'store' : 'map-pin';
        return '<label class="option"><input type="radio" name="method" value="' + m.id + '"' + (m.id === method ? ' checked' : '') + '>' +
          '<span class="option__box">' + icon(ic) + '<span class="choice__text"><span class="option__title">' + esc(m.label) + '</span><span class="muted">' + esc(m.note) + '</span></span>' +
          '<span class="choice__price">' + (price === 0 ? (m.price > 0 ? '<s class="muted">' + money(m.price) + '</s> 0 ₽' : '0 ₽') : money(price)) + '</span></span></label>';
      }).join('');
      var dates = deliveryDates(method).map(function (x) { return [isoLocal(x), fDate(x, { weekday: 'short', day: 'numeric', month: 'long' })]; });
      var sub = '';
      if (method === 'courier') {
        sub = fieldHTML({ name: 'street', label: 'Улица и дом', auto: 'address-line1', ph: 'Средний проспект В.О., 36' }) +
          '<div class="form-row form-row--3">' +
            fieldHTML({ name: 'flat', label: 'Квартира или офис', optional: true, ph: '12' }) +
            fieldHTML({ name: 'date', label: 'День', type: 'select', options: dates, value: d.date && dates.some(function (o) { return o[0] === d.date; }) ? d.date : dates[0][0] }) +
            fieldHTML({ name: 'slot', label: 'Интервал', type: 'select', options: [['10-14', '10:00-14:00'], ['14-18', '14:00-18:00'], ['18-22', '18:00-22:00']] }) +
          '</div>';
      } else if (method === 'pickup') {
        sub = '<p class="notice">' + icon('map-pin') + '<span>Санкт-Петербург, Васильевский остров, Обжарочный переулок, 4. Пн-Сб 10:00-20:00. Заказ храним 7 дней, при получении назовите номер заказа.</span></p>' +
          fieldHTML({ name: 'pdate', label: 'Когда заберёте', type: 'select', options: dates, value: d.pdate && dates.some(function (o) { return o[0] === d.pdate; }) ? d.pdate : dates[0][0] });
      } else {
        sub = '<div class="form-row form-row--2">' +
          fieldHTML({ name: 'city', label: 'Город', auto: 'address-level2', ph: 'Казань' }) +
          fieldHTML({ name: 'index', label: 'Индекс', mode: 'numeric', max: 6, ph: '420111', hint: 'Шесть цифр. Подберём ближайший пункт.' }) +
          '</div>' +
          fieldHTML({ name: 'point', label: 'Адрес пункта выдачи', ph: 'ул. Баумана, 51', hint: 'Можно указать любой пункт выдачи в вашем городе.' });
      }
      return '<h2 class="step__title" tabindex="-1">Доставка</h2>' +
        '<fieldset class="step__fields"><legend class="sr-only">Способ доставки</legend><div class="choice" id="method-choice">' + opts + '</div></fieldset>' +
        '<div class="step__sub" id="method-fields">' + sub + '</div>';
    }
    if (co.step === 3) {
      var pay = d.pay || 'card';
      var cashLabel = d.method === 'pickup' ? 'При получении в обжарочной' : 'При получении';
      var payOpts = [
        ['card', 'card', 'Картой онлайн', 'Тестовая оплата: деньги не списываются'],
        ['cash', 'wallet', cashLabel, 'Картой или наличными курьеру либо в пункте выдачи']
      ].map(function (o) {
        return '<label class="option"><input type="radio" name="pay" value="' + o[0] + '"' + (o[0] === pay ? ' checked' : '') + '>' +
          '<span class="option__box">' + icon(o[1]) + '<span class="choice__text"><span class="option__title">' + o[2] + '</span><span class="muted">' + o[3] + '</span></span></span></label>';
      }).join('');
      var card = pay === 'card' ? '<div class="step__sub" id="card-fields">' +
        '<div class="testpay">' + icon('info') + '<span><strong>Тестовая оплата, деньги не списываются.</strong>Это демо-магазин. Используйте номер 4242 4242 4242 4242, любой будущий срок и любые три цифры CVC. Настоящие данные карты не вводите.</span></div>' +
        fieldHTML({ name: 'card', label: 'Номер карты', mode: 'numeric', auto: 'off', ph: '4242 4242 4242 4242', max: 19, value: co.card || '' }) +
        '<div class="form-row form-row--2">' +
          fieldHTML({ name: 'exp', label: 'Срок действия', mode: 'numeric', auto: 'off', ph: 'ММ/ГГ', max: 5, value: co.exp || '' }) +
          fieldHTML({ name: 'cvc', label: 'CVC', mode: 'numeric', auto: 'off', ph: '123', max: 3, type: 'password', value: co.cvc || '' }) +
        '</div></div>' : '';
      return '<h2 class="step__title" tabindex="-1">Оплата</h2>' +
        '<fieldset class="step__fields"><legend class="sr-only">Способ оплаты</legend><div class="choice">' + payOpts + '</div></fieldset>' + card;
    }
    var m = LABEL.delivery[d.method];
    var where = d.method === 'courier' ? (d.street + (d.flat ? ', кв. ' + d.flat : '') + '. ' + cap(fDay(d.date)) + ', ' + String(d.slot || '').replace('-', ':00-') + ':00')
      : d.method === 'pickup' ? ('Обжарочный переулок, 4. С ' + fDay(d.pdate))
      : (d.city + ', ' + d.point + (d.index ? ', ' + d.index : ''));
    var payText = d.pay === 'card' ? 'Картой онлайн, карта •••• ' + String(co.card || '').replace(/\D/g, '').slice(-4) + ' (тестовая оплата)' : 'При получении';
    var total = afterDiscount() + deliveryPrice(d.method);
    return '<h2 class="step__title" tabindex="-1">Проверьте заказ</h2>' +
      '<div class="review">' +
        '<div class="review__row"><h3>Контакты</h3><p>' + esc(d.name + ', ' + d.phone + ', ' + d.email) + '</p><button class="btn btn--ghost btn--sm" type="button" data-goto="1">' + icon('pencil', 'icon--sm') + 'Изменить<span class="sr-only"> контакты</span></button></div>' +
        '<div class="review__row"><h3>' + esc(m.label) + ', ' + (deliveryPrice(d.method) ? money(deliveryPrice(d.method)) : 'бесплатно') + '</h3><p>' + esc(where) + '</p><button class="btn btn--ghost btn--sm" type="button" data-goto="2">' + icon('pencil', 'icon--sm') + 'Изменить<span class="sr-only"> доставку</span></button></div>' +
        '<div class="review__row"><h3>Оплата</h3><p>' + esc(payText) + '</p><button class="btn btn--ghost btn--sm" type="button" data-goto="3">' + icon('pencil', 'icon--sm') + 'Изменить<span class="sr-only"> оплату</span></button></div>' +
      '</div>' +
      '<div class="step__fields">' + fieldHTML({ name: 'comment', label: 'Комментарий к заказу', optional: true, ph: 'Например: позвонить за час', max: 200 }) + '</div>' +
      '<p class="muted" style="font-size:var(--text-sm)">К оплате ' + money(total) + '. Нажимая кнопку, вы подтверждаете заказ. ' + (d.pay === 'card' ? 'Оплата тестовая, деньги не списываются.' : '') + '</p>';
  }

  function renderStep(focus) {
    renderSteps();
    renderSummary();
    var last = co.step === 4;
    var payCard = state.draft.pay !== 'cash';
    $('#step').innerHTML = '<form class="step" id="step-form" novalidate>' + stepHTML() +
      '<div class="step__nav">' +
        (co.step > 1 ? '<button class="btn btn--secondary" type="button" data-back>' + icon('arrow-left') + 'Назад</button>' : '<a class="btn btn--secondary" href="#/">' + icon('arrow-left') + 'Вернуться в каталог</a>') +
        '<button class="btn btn--primary" type="submit" id="step-next"><span class="spinner" aria-hidden="true"></span><span class="btn__text">' +
          (last ? (payCard ? 'Оплатить ' + money(afterDiscount() + deliveryPrice(state.draft.method)) : 'Подтвердить заказ') : 'Дальше: ' + STEP_NAMES[co.step].toLowerCase()) +
        '</span>' + (last ? icon('lock', 'btn__icon') : icon('arrow-right', 'btn__icon')) + '</button>' +
      '</div></form>';
    var form = $('#step-form');
    form.addEventListener('submit', onStepSubmit);
    form.addEventListener('input', onStepInput);
    form.addEventListener('change', onStepChange);
    form.addEventListener('focusout', function (e) {
      var el = e.target;
      if (el.name && co.tried[co.step] && el.value !== undefined) validateField(el);
      else if (el.name && el.value) validateField(el);
    });
    form.addEventListener('click', function (e) {
      if (e.target.closest('[data-back]')) { co.step -= 1; renderStep(true); }
      var g = e.target.closest('[data-goto]');
      if (g) { co.step = Number(g.dataset.goto); renderStep(true); }
    });
    if (focus) {
      var t = $('.step__title', form);
      t.focus({ preventScroll: true });
      var top = $('#steps').getBoundingClientRect().top + window.scrollY - 120;
      if (window.scrollY > top) window.scrollTo(0, top);
    }
  }

  /* Маски */
  function maskPhone(v) {
    var d = v.replace(/\D/g, '');
    if (!d) return '';
    if (d[0] === '8') d = '7' + d.slice(1);
    if (d[0] !== '7') d = '7' + d;
    d = d.slice(0, 11);
    var out = '+7';
    if (d.length > 1) out += ' (' + d.slice(1, 4);
    if (d.length >= 4) out += ')';
    if (d.length > 4) out += ' ' + d.slice(4, 7);
    if (d.length > 7) out += '-' + d.slice(7, 9);
    if (d.length > 9) out += '-' + d.slice(9, 11);
    return out;
  }
  function maskCard(v) { return v.replace(/\D/g, '').slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 '); }
  function maskExp(v) {
    var d = v.replace(/\D/g, '').slice(0, 4);
    return d.length > 2 ? d.slice(0, 2) + '/' + d.slice(2) : d;
  }
  function luhn(num) {
    var sum = 0, alt = false;
    for (var i = num.length - 1; i >= 0; i--) {
      var n = Number(num[i]);
      if (alt) { n *= 2; if (n > 9) n -= 9; }
      sum += n; alt = !alt;
    }
    return sum % 10 === 0;
  }

  var VALIDATORS = {
    name: function (v) { return v.trim().length < 2 ? 'Укажите имя: так мы подпишем пакет и обратимся к вам при звонке.' : ''; },
    phone: function (v) { return v.replace(/\D/g, '').length !== 11 ? 'Введите номер полностью: +7 и ещё 10 цифр.' : ''; },
    email: function (v) { return !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? 'Проверьте email: нужен знак @ и домен, например anna@mail.ru.' : ''; },
    street: function (v) { return !/\S+.*\d/.test(v.trim()) ? 'Укажите улицу и номер дома, например «Средний проспект В.О., 36».' : ''; },
    city: function (v) { return v.trim().length < 2 ? 'Укажите город доставки.' : ''; },
    index: function (v) { return v && !/^\d{6}$/.test(v.trim()) ? 'Индекс состоит из шести цифр. Можно оставить поле пустым.' : ''; },
    point: function (v) { return v.trim().length < 5 ? 'Укажите адрес пункта выдачи: улицу и дом.' : ''; },
    card: function (v) {
      var d = v.replace(/\D/g, '');
      if (d.length !== 16) return 'Номер карты состоит из 16 цифр. Для теста: 4242 4242 4242 4242.';
      if (!luhn(d)) return 'Такой номер карты не существует. Проверьте цифры или используйте тестовый 4242 4242 4242 4242.';
      return '';
    },
    exp: function (v) {
      var m = /^(\d{2})\/(\d{2})$/.exec(v);
      if (!m) return 'Укажите срок в формате ММ/ГГ, как на карте.';
      var mm = Number(m[1]), yy = Number(m[2]);
      if (mm < 1 || mm > 12) return 'Месяц должен быть от 01 до 12.';
      var now = new Date();
      var cy = now.getFullYear() % 100, cm = now.getMonth() + 1;
      if (yy < cy || (yy === cy && mm < cm)) return 'Срок действия карты истёк. Укажите будущую дату.';
      return '';
    },
    cvc: function (v) { return !/^\d{3}$/.test(v) ? 'CVC: три цифры на обратной стороне карты.' : ''; }
  };
  var OPTIONAL = { flat: 1, comment: 1, index: 1 };
  var SECRET = { card: 1, exp: 1, cvc: 1 };

  function validateField(el) {
    var fn = VALIDATORS[el.name];
    if (!fn || el.closest('[hidden]')) return true;
    if (OPTIONAL[el.name] && !el.value) return true;
    var msg = fn(el.value || '');
    var box = $('#' + el.name + '-error');
    if (msg) {
      el.setAttribute('aria-invalid', 'true');
      if (box) { box.hidden = false; $('span', box).textContent = msg; }
    } else {
      el.removeAttribute('aria-invalid');
      if (box) box.hidden = true;
    }
    return !msg;
  }

  function onStepInput(e) {
    var el = e.target;
    if (el.name === 'phone') el.value = maskPhone(el.value);
    if (el.name === 'card') el.value = maskCard(el.value);
    if (el.name === 'exp') el.value = maskExp(el.value);
    if (el.name === 'cvc' || el.name === 'index') el.value = el.value.replace(/\D/g, '');
    if (SECRET[el.name]) co[el.name] = el.value;
    else if (el.name && el.type !== 'radio') { state.draft[el.name] = el.value; save('checkout', state.draft); }
    if (el.getAttribute('aria-invalid') === 'true') validateField(el);
  }
  function onStepChange(e) {
    var el = e.target;
    if (el.name === 'method' || el.name === 'pay') {
      /* Сохраняем то, что уже введено, перерисовываем шаг с новыми полями */
      collectStep();
      state.draft[el.name] = el.value;
      save('checkout', state.draft);
      renderStep(false);
      var radio = $('input[name="' + el.name + '"][value="' + el.value + '"]');
      if (radio) radio.focus();
      return;
    }
    if (el.tagName === 'SELECT') { state.draft[el.name] = el.value; save('checkout', state.draft); }
  }
  function collectStep() {
    $$('#step-form input, #step-form select, #step-form textarea').forEach(function (el) {
      if (!el.name || el.type === 'radio') return;
      if (SECRET[el.name]) co[el.name] = el.value;
      else state.draft[el.name] = el.value;
    });
    var r = $('#step-form input[type="radio"]:checked');
    if (r) state.draft[r.name] = r.value;
    save('checkout', state.draft);
  }

  function onStepSubmit(e) {
    e.preventDefault();
    collectStep();
    co.tried[co.step] = true;
    if (co.step === 2 && !state.draft.method) state.draft.method = 'courier';
    if (co.step === 3 && !state.draft.pay) state.draft.pay = 'card';
    var fields = $$('#step-form input:not([type="radio"]), #step-form select');
    var firstBad = null;
    fields.forEach(function (el) { if (!validateField(el) && !firstBad) firstBad = el; });
    if (firstBad) { firstBad.focus(); announce('Проверьте поля с ошибками'); return; }
    if (co.step < 4) { co.step += 1; renderStep(true); return; }
    placeOrder($('#step-next'));
  }

  function placeOrder(btn) {
    if (btn.getAttribute('aria-busy') === 'true') return;
    btn.setAttribute('aria-busy', 'true');
    placing = true;
    $('.btn__text', btn).textContent = state.draft.pay === 'card' ? 'Проводим тестовую оплату' : 'Оформляем заказ';
    setTimeout(function () {
      var d = state.draft;
      var now = new Date();
      var base = String(now.getFullYear()).slice(2) + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
      var num;
      do { num = base + '-' + String(Math.floor(100 + Math.random() * 900)); }
      while (state.orders.some(function (o) { return o.num === num; }));
      var order = {
        num: num,
        created: now.toISOString(),
        roast: isoLocal(nextRoast(new Date(now.getTime() + DAY))),
        items: state.cart.map(function (l) {
          var p = byId[l.pid], v = variantOf(p, l.v);
          return { pid: p.id, name: p.name, v: v.id, vLabel: v.label, g: l.g, gLabel: l.g ? LABEL.grind[l.g] : '', qty: l.qty, price: v.price };
        }),
        goods: goodsTotal(),
        discount: discountTotal(),
        promo: state.promo,
        delivery: {
          method: d.method, label: LABEL.delivery[d.method].label, price: deliveryPrice(d.method),
          street: d.street, flat: d.flat, date: d.date, slot: d.slot, pdate: d.pdate, city: d.city, point: d.point, index: d.index
        },
        pay: { method: d.pay, last4: d.pay === 'card' ? String(co.card || '').replace(/\D/g, '').slice(-4) : '' },
        contact: { name: d.name, phone: d.phone, email: d.email },
        comment: d.comment || ''
      };
      order.total = order.goods - order.discount + order.delivery.price;
      state.orders.unshift(order);
      save('orders', state.orders);
      state.cart = [];
      state.promo = null;
      save('promo', null);
      state.draft.comment = '';
      save('checkout', state.draft);
      co = { step: 1, tried: {} };
      commitCart(false);
      placing = false;
      location.hash = '#/order/' + num;
    }, 1200);
  }

  /* ================= Заказ оформлен ================= */
  function findOrder(num) { return state.orders.filter(function (o) { return o.num === num; })[0]; }

  function orderItemsHTML(o) {
    return '<ul class="summary__items">' + o.items.map(function (it) {
      var p = byId[it.pid] || { cat: 'single', pack: 'kraft', country: it.name, region: '', roast: 'omni', sca: '' };
      return '<li class="summary__item"><span class="summary__thumb">' + ART.front(p) + '</span><span>' + esc(it.name) +
        '<small>' + esc(it.vLabel + (it.gLabel ? ', ' + it.gLabel.toLowerCase() : '') + ' × ' + it.qty) + '</small></span><span class="num">' + money(it.price * it.qty) + '</span></li>';
    }).join('') + '</ul>';
  }
  function orderTotalsHTML(o) {
    return '<dl class="totals">' +
      '<div><dt>Товары</dt><dd>' + money(o.goods) + '</dd></div>' +
      (o.discount ? '<div class="is-discount"><dt>Скидка ' + esc(o.promo || '') + '</dt><dd>−' + money(o.discount) + '</dd></div>' : '') +
      '<div><dt>' + esc(o.delivery.label) + '</dt><dd>' + (o.delivery.price ? money(o.delivery.price) : 'бесплатно') + '</dd></div>' +
      '<div class="totals__sum"><dt>' + (o.pay.method === 'card' ? 'Оплачено (тест)' : 'К оплате при получении') + '</dt><dd>' + money(o.total) + '</dd></div>' +
    '</dl>';
  }

  function viewOrder(num) {
    var o = findOrder(num);
    if (!o) {
      setTitle('Заказ не найден');
      view.innerHTML = '<div class="page container"><div class="page__head"><h1 class="h1">Заказ не найден</h1></div>' +
        '<div class="empty">' + icon('package') + '<h2 class="empty__title">Заказа № ' + esc(num || '') + ' нет на этом устройстве</h2>' +
        '<p>История хранится в браузере, где оформляли заказ. Проверьте номер или откройте список заказов.</p>' +
        '<div class="empty__actions"><a class="btn btn--primary" href="#/orders">История заказов</a><a class="btn btn--secondary" href="#/">В каталог</a></div></div></div>';
      return;
    }
    setTitle('Заказ ' + o.num);
    var roast = toDate(o.roast);
    var ship = new Date(roast.getTime() + DAY);
    var dl = o.delivery;
    var third;
    if (dl.method === 'courier') third = ['Курьер привезёт заказ', cap(fDay(dl.date)) + ', ' + String(dl.slot || '').replace('-', ':00-') + ':00. Адрес: ' + dl.street + (dl.flat ? ', кв. ' + dl.flat : '') + '. Курьер позвонит за 30 минут.'];
    else if (dl.method === 'pickup') third = ['Заберите в обжарочной', 'С ' + fDay(dl.pdate) + ', Обжарочный переулок, 4. Назовите номер заказа ' + o.num + '. Храним 7 дней.'];
    else third = ['Посылка в пункте выдачи', dl.city + ', ' + dl.point + '. Обычно через 2-6 дней после отправки. Код получения придёт на ' + o.contact.phone + '.'];

    view.innerHTML = '<div class="page container">' +
      '<div class="success">' +
        '<div>' +
          '<p class="success__mark">' + icon('circle-check') + 'Заказ оформлен</p>' +
          '<h1 class="display success__title">Спасибо, ' + esc(o.contact.name) + '. Заказ принят</h1>' +
          '<p class="success__numline">Номер заказа <span class="success__num">№ ' + esc(o.num) + '</span></p>' +
          '<p class="lead">Заказ сохранён в истории на этом устройстве. ' + (o.pay.method === 'card' ? 'Тестовая оплата прошла, реальные деньги не списывались.' : 'Оплата при получении.') + '</p>' +
          '<h2 class="h2" style="margin-top:var(--space-12)">Что дальше</h2>' +
          '<ol class="timeline">' +
            '<li><div><h3>Обжарка</h3><p><time datetime="' + isoLocal(roast) + '">' + esc(fDay(roast)) + '</time>. Кофе обжарим под ваш заказ, дата будет на каждой пачке.</p></div></li>' +
            '<li><div><h3>' + (dl.method === 'pickup' ? 'Сборка' : 'Отправка') + '</h3><p><time datetime="' + isoLocal(ship) + '">' + esc(fDay(ship)) + '</time>. Зерно отдохнёт сутки, мелем по вашему выбору и упаковываем.</p></div></li>' +
            '<li><div><h3>' + esc(third[0]) + '</h3><p>' + esc(third[1]) + '</p></div></li>' +
          '</ol>' +
          '<div class="empty__actions" style="justify-content:flex-start;margin-top:var(--space-6)"><a class="btn btn--primary" href="#/">Вернуться в каталог</a><a class="btn btn--secondary" href="#/orders">Все заказы</a></div>' +
        '</div>' +
        '<aside class="summary" aria-label="Состав заказа">' +
          '<h2 class="summary__title">Состав заказа</h2>' + orderItemsHTML(o) + orderTotalsHTML(o) +
          '<p class="totals__note">' + esc(o.contact.phone + ', ' + o.contact.email) + (o.comment ? '. Комментарий: ' + o.comment : '') + '</p>' +
        '</aside>' +
      '</div></div>';
  }

  /* ================= История заказов ================= */
  function viewOrders() {
    setTitle('История заказов');
    var head = '<div class="page__head"><h1 class="h1">История заказов</h1><p class="lead">Заказы хранятся в этом браузере. Любой можно повторить в один клик.</p></div>';
    if (!state.orders.length) {
      view.innerHTML = '<div class="page container">' + head +
        '<div class="empty">' + icon('package') + '<h2 class="empty__title">Заказов пока нет</h2>' +
        '<p>Когда оформите первый заказ, он появится здесь со статусом и датой обжарки.</p>' +
        '<div class="empty__actions"><a class="btn btn--primary" href="#/">Перейти в каталог</a></div></div></div>';
      return;
    }
    var rows = state.orders.map(function (o, i) {
      var list = o.items.map(function (it) { return it.name + (it.qty > 1 ? ' × ' + it.qty : ''); }).join(', ');
      var roast = toDate(o.roast);
      var status = roast >= startOfDay(new Date()) ? 'Ждёт обжарки ' + fDate(roast) : 'Обжарен ' + fDate(roast);
      return '<article class="order-row' + (i === 0 ? ' orders__row-lead' : '') + '" aria-labelledby="o-' + esc(o.num) + '">' +
        '<div><h2 class="order-row__num" id="o-' + esc(o.num) + '"><a href="#/order/' + esc(o.num) + '">№ ' + esc(o.num) + '</a></h2>' +
          '<p class="order-row__meta">' + esc(fDate(o.created, { day: 'numeric', month: 'long', year: 'numeric' })) + ', ' + esc(o.delivery.label.toLowerCase()) + '</p></div>' +
        '<div><p class="order-row__items">' + esc(list) + '</p><p class="status">' + esc(status) + '</p></div>' +
        '<div class="order-row__side"><span class="order-row__total">' + money(o.total) + '</span>' +
          '<button class="btn btn--secondary btn--sm" type="button" data-repeat="' + esc(o.num) + '"><span class="spinner" aria-hidden="true"></span>' + icon('repeat', 'icon--sm btn__icon') + '<span class="btn__text">Повторить</span><span class="sr-only"> заказ № ' + esc(o.num) + '</span></button></div>' +
      '</article>';
    }).join('');
    view.innerHTML = '<div class="page container">' + head +
      '<div class="orders">' + rows + '</div>' +
      '<div class="orders__foot"><p class="muted">' + state.orders.length + ' ' + plural(state.orders.length, 'заказ', 'заказа', 'заказов') + ' на ' + money(state.orders.reduce(function (s, o) { return s + o.total; }, 0)) + '</p>' +
        '<button class="btn btn--danger-ghost" type="button" id="orders-clear">' + icon('trash') + 'Удалить историю</button></div>' +
    '</div>';

    view.addEventListener('click', onOrdersClick);
  }
  function onOrdersClick(e) {
    if (current.name !== 'orders') { view.removeEventListener('click', onOrdersClick); return; }
    var rep = e.target.closest('[data-repeat]');
    if (rep && rep.getAttribute('aria-busy') !== 'true') {
      var o = findOrder(rep.dataset.repeat);
      rep.setAttribute('aria-busy', 'true');
      setTimeout(function () {
        var want = 0, got = 0;
        o.items.forEach(function (it) {
          if (!byId[it.pid]) return;
          want += it.qty;
          got += addToCart(it.pid, it.v, it.g, it.qty);
        });
        rep.removeAttribute('aria-busy');
        if (got === 0) toast('Не получилось: этих товаров сейчас нет на складе или они уже в корзине.');
        else toast((got < want ? 'Добавили ' + got + ' из ' + want + ' шт.: остальное закончилось. ' : 'Заказ добавлен в корзину. ') + 'Всего ' + items(cartCount()) + '.',
          { label: 'Открыть корзину', fn: function () { openCart(cartBtn); } });
      }, 400);
      return;
    }
    var clr = e.target.closest('#orders-clear');
    if (clr) {
      confirmDanger({
        title: 'Удалить историю заказов?',
        text: 'Список из ' + state.orders.length + ' ' + plural(state.orders.length, 'заказа', 'заказов', 'заказов') + ' пропадёт с этого устройства. Отменить это действие нельзя.',
        action: 'Удалить историю',
        onConfirm: function () {
          state.orders = [];
          save('orders', []);
          viewOrders();
          var h1 = $('h1', view); if (h1) { h1.setAttribute('tabindex', '-1'); h1.focus(); }
          announce('История заказов удалена');
        }
      }, clr);
    }
  }

  /* ================= Избранное ================= */
  function viewFavorites() {
    setTitle('Избранное');
    var list = state.fav.map(function (id) { return byId[id]; }).filter(Boolean);
    var head = '<div class="page__head"><h1 class="h1">Избранное</h1><p class="lead">' +
      (list.length ? 'Сохранено: ' + items(list.length) + '. Список хранится в этом браузере.' : 'Отмечайте сорта сердцем, чтобы вернуться к ним позже.') + '</p></div>';
    if (!list.length) {
      var picks = D.products.filter(function (p) { return p.badges.indexOf('new') >= 0; }).slice(0, 2);
      view.innerHTML = '<div class="page container">' + head +
        '<div class="empty">' + icon('heart') + '<h2 class="empty__title">Здесь пока пусто</h2>' +
        '<p>Нажмите на сердце на карточке товара. Например, загляните в новый урожай: ' + picks.map(function (p) { return '<a class="link" href="#/product/' + p.id + '">' + esc(p.name) + '</a>'; }).join(' и ') + '.</p>' +
        '<div class="empty__actions"><a class="btn btn--primary" href="#/">Перейти в каталог</a></div></div></div>';
      return;
    }
    view.innerHTML = '<div class="page container">' + head +
      '<div class="grid">' + list.map(function (p, i) { return cardHTML(p, { lead: i === 0 && list.length > 2, eyebrow: 'Последнее из отмеченных' }); }).join('') + '</div></div>';
  }

  /* ================= 404 ================= */
  function viewNotFound() {
    setTitle('Страница не найдена');
    view.innerHTML = '<div class="page container"><div class="page__head"><h1 class="h1">Такой страницы нет</h1></div>' +
      '<div class="empty">' + icon('search-x') + '<h2 class="empty__title">Возможно, товар сняли с продажи</h2><p>Ссылка устарела или в ней опечатка. Каталог на месте.</p>' +
      '<div class="empty__actions"><a class="btn btn--primary" href="#/">Перейти в каталог</a></div></div></div>';
  }

  /* ================= Старт ================= */
  window.addEventListener('hashchange', route);
  window.addEventListener('storage', function (e) {
    if (!e.key || e.key.indexOf('zp:') !== 0) return;
    state.cart = sanitizeCart(load('cart', []));
    state.fav = (load('fav', []) || []).filter(function (id) { return byId[id]; });
    state.orders = load('orders', []) || [];
    updateHeader(false);
    if (cartDialog.open) renderCart();
  });
  updateHeader(false);
  route();
})();
