/* Страница меню: разделы из window.MENU, поиск, фильтры, подсветка текущего раздела, печать */
(function () {
  'use strict';
  var RR = window.RR;
  var MENU = window.MENU || [];

  var TAGS = {
    veg: { label: 'Вегетарианское', icon: 'i-leaf' },
    spicy: { label: 'Острое', icon: 'i-flame' },
    gf: { label: 'Без глютена', icon: 'i-wheat-off' },
    hit: { label: 'Хит', icon: 'i-star' }
  };

  var state = { q: '', filters: [] };
  var els = {};

  function norm(s) { return String(s).toLowerCase().replace(/ё/g, 'е'); }

  /* Подсветка найденных слов. Буква "е" в запросе совпадает и с "ё". */
  function highlight(text, terms) {
    var safe = RR.esc(text);
    if (!terms.length) return safe;
    var parts = terms.map(function (t) {
      return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/е/g, '[её]');
    });
    try {
      return safe.replace(new RegExp('(' + parts.join('|') + ')', 'gi'), '<mark>$1</mark>');
    } catch (e) {
      return safe;
    }
  }

  function dishHTML(d, terms) {
    var tags = (d.tags || []).filter(function (t) { return TAGS[t]; });
    var allergens = d.allergens && d.allergens.length ? 'Аллергены: ' + d.allergens.join(', ') : 'Без основных аллергенов';
    return '<li class="dish">' +
      '<div class="dish__head"><h3 class="dish__name">' + highlight(d.name, terms) + '</h3>' +
      '<span class="dish__leader" aria-hidden="true"></span>' +
      '<span class="dish__price">' + RR.price(d.price) + '</span></div>' +
      '<p class="dish__desc">' + highlight(d.desc, terms) + '</p>' +
      '<div class="dish__meta"><span class="dish__weight">' + RR.esc(d.weight || '') + '</span>' +
      '<span class="dish__allergens">' + RR.esc(allergens) + '</span>' +
      (tags.length ? '<ul class="tags" aria-label="Отметки">' + tags.map(function (t) {
        return '<li class="tag tag--' + t + '">' + RR.icon(TAGS[t].icon, 'icon--sm') + TAGS[t].label + '</li>';
      }).join('') + '</ul>' : '') +
      '</div></li>';
  }

  function matches(d, terms) {
    var tags = d.tags || [];
    for (var i = 0; i < state.filters.length; i++) if (tags.indexOf(state.filters[i]) === -1) return false;
    if (!terms.length) return true;
    var hay = norm(d.name + ' ' + d.desc);
    for (var j = 0; j < terms.length; j++) if (hay.indexOf(norm(terms[j])) === -1) return false;
    return true;
  }

  function render() {
    var terms = state.q.trim().split(/\s+/).filter(function (t) { return t.length > 0; });
    var total = 0, found = 0;
    var html = '', nav = '';
    MENU.forEach(function (sec) {
      var items = sec.items || [];
      total += items.length;
      var visible = items.filter(function (d) { return matches(d, terms); });
      found += visible.length;
      var hide = visible.length === 0;
      html += '<section class="menu-section' + (hide ? ' is-filtered-out' : '') + '" id="sec-' + sec.id + '" aria-labelledby="h-' + sec.id + '" data-section="' + sec.id + '">' +
        '<div class="menu-section__grid"><div class="menu-section__side">' +
        '<h2 class="menu-section__title" id="h-' + sec.id + '">' + RR.esc(sec.title) +
        (sec.it ? '<span class="menu-section__it" lang="it">' + RR.esc(sec.it) + '</span>' : '') + '</h2>' +
        (sec.note ? '<p class="menu-section__note">' + RR.esc(sec.note) + '</p>' : '') +
        '</div><ul class="dishes">' +
        items.map(function (d) {
          var li = dishHTML(d, terms);
          return visible.indexOf(d) === -1 ? li.replace('<li class="dish">', '<li class="dish is-filtered-out">') : li;
        }).join('') +
        '</ul></div></section>';
      nav += '<li' + (hide ? ' hidden' : '') + '><a class="subnav__link" href="#sec-' + sec.id + '" data-target="sec-' + sec.id + '">' +
        RR.esc(sec.title) + ' <span class="subnav__count">' + visible.length + '</span></a></li>';
    });
    els.sections.innerHTML = html;
    els.subnav.innerHTML = nav;

    var active = terms.length > 0 || state.filters.length > 0;
    els.empty.hidden = found > 0;
    els.subnavBar.hidden = found === 0;
    els.reset.hidden = !active;
    els.clear.hidden = state.q.length === 0;
    if (!active) {
      els.results.textContent = 'В меню ' + total + ' ' + RR.plural(total, 'позиция', 'позиции', 'позиций') + ' в ' + MENU.length + ' разделах.';
    } else if (found === 0) {
      els.results.textContent = 'Ничего не нашли. Попробуйте другое слово или снимите фильтры.';
    } else {
      var names = state.filters.map(function (f) { return TAGS[f].label.toLowerCase(); });
      els.results.textContent = 'Нашли ' + found + ' ' + RR.plural(found, 'блюдо', 'блюда', 'блюд') +
        (names.length ? ', отметки: ' + names.join(', ') : '') +
        (terms.length ? ', запрос «' + state.q.trim() + '»' : '') + '.';
    }
    if (found === 0) {
      els.emptyText.textContent = terms.length
        ? 'По запросу «' + state.q.trim() + '»' + (state.filters.length ? ' с выбранными отметками' : '') + ' ничего нет. Проверьте написание или поищите по составу.'
        : 'С такими отметками одновременно блюд нет. Снимите одну из них.';
    }
    spy();
  }

  /* ---------- Подсветка текущего раздела при прокрутке ---------- */
  var current = null;
  function spy() {
    var links = els.subnav.querySelectorAll('.subnav__link');
    if (!links.length) return;
    var offset = els.subnavBar.getBoundingClientRect().bottom + 24;
    var id = null;
    var sections = els.sections.querySelectorAll('.menu-section:not(.is-filtered-out)');
    sections.forEach(function (s) { if (s.getBoundingClientRect().top <= offset) id = s.id; });
    if (!id && sections.length) id = sections[0].id;
    /* Внизу страницы подсвечиваем последний раздел */
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4 && sections.length) {
      var last = sections[sections.length - 1];
      if (last.getBoundingClientRect().top < window.innerHeight) id = last.id;
    }
    links.forEach(function (a) {
      var on = a.getAttribute('data-target') === id;
      if (on) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
      if (on && id !== current) {
        var list = els.subnav;
        var left = a.parentNode.offsetLeft - list.offsetLeft;
        var target = left - (list.clientWidth - a.offsetWidth) / 2;
        list.scrollLeft = Math.max(0, target);
      }
    });
    current = id;
  }

  function onScroll() {
    if (onScroll.t) return;
    onScroll.t = window.requestAnimationFrame(function () { onScroll.t = 0; spy(); });
  }

  function setQuery(q) {
    state.q = q;
    els.search.value = q;
    render();
  }

  function resetAll() {
    state.filters = [];
    document.querySelectorAll('.chip[data-filter]').forEach(function (c) { c.setAttribute('aria-pressed', 'false'); });
    setQuery('');
    els.search.focus();
  }

  RR.ready(function () {
    els.sections = document.getElementById('menu-sections');
    els.subnav = document.getElementById('subnav');
    els.subnavBar = document.querySelector('.subnav');
    els.empty = document.getElementById('menu-empty');
    els.emptyText = document.getElementById('empty-text');
    els.results = document.getElementById('results');
    els.search = document.getElementById('menu-search');
    els.clear = document.getElementById('search-clear');
    els.reset = document.getElementById('reset-all');
    if (!els.sections) return;

    var timer;
    els.search.addEventListener('input', function () {
      clearTimeout(timer);
      var v = els.search.value;
      timer = setTimeout(function () { state.q = v; render(); }, 120);
    });
    els.search.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && els.search.value) { e.preventDefault(); setQuery(''); }
    });
    els.clear.addEventListener('click', function () { setQuery(''); els.search.focus(); });
    els.reset.addEventListener('click', resetAll);
    document.getElementById('empty-reset').addEventListener('click', resetAll);
    document.querySelectorAll('[data-suggest]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.filters = [];
        document.querySelectorAll('.chip[data-filter]').forEach(function (c) { c.setAttribute('aria-pressed', 'false'); });
        setQuery(b.getAttribute('data-suggest'));
        els.search.focus();
      });
    });
    document.querySelectorAll('.chip[data-filter]').forEach(function (chip) {
      chip.addEventListener('click', function () {
        var f = chip.getAttribute('data-filter');
        var on = chip.getAttribute('aria-pressed') !== 'true';
        chip.setAttribute('aria-pressed', String(on));
        state.filters = state.filters.filter(function (x) { return x !== f; });
        if (on) state.filters.push(f);
        render();
      });
    });
    var printBtn = document.getElementById('print-menu');
    if (printBtn) printBtn.addEventListener('click', function () { window.print(); });

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    render();
  });
})();
