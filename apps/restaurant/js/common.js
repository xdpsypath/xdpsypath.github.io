/*
  Общая логика для всех страниц: меню на телефоне, статус "Открыто / Закрыто",
  часы работы, безопасная работа с localStorage.
*/
(function () {
  'use strict';
  var D = window.APP_DATA || {};
  var RR = (window.RR = window.RR || {});

  /* ---------- Хранилище: каждое обращение в try/catch ---------- */
  RR.store = {
    get: function (key, fallback) {
      try {
        var raw = window.localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch (e) {
        return fallback;
      }
    },
    set: function (key, value) {
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (e) {
        return false;
      }
    }
  };

  /* ---------- Время в Москве ----------
     Возвращает Date, у которого UTC-поля равны московскому "настенному" времени.
     Так расчёты не зависят от часового пояса посетителя. */
  RR.mskNow = function () {
    var now = new Date();
    try {
      var parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: D.timeZone || 'Europe/Moscow',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
      }).formatToParts(now);
      var p = {};
      parts.forEach(function (x) { p[x.type] = x.value; });
      return new Date(Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute));
    } catch (e) {
      return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes()));
    }
  };
  /* Понедельник = 0 ... воскресенье = 6 */
  RR.dow = function (d) { return (d.getUTCDay() + 6) % 7; };
  RR.hm = function (s) { var a = String(s).split(':'); return (+a[0]) * 60 + (+a[1] || 0); };
  RR.fmtHM = function (m) {
    m = m % 1440;
    var h = Math.floor(m / 60), mm = m % 60;
    return (h < 10 ? '0' : '') + h + ':' + (mm < 10 ? '0' : '') + mm;
  };
  RR.closeLabel = function (s) { return s === '24:00' ? 'полуночи' : s; };
  RR.price = function (n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ₽'; };
  RR.plural = function (n, one, few, many) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
    return many;
  };
  RR.esc = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  RR.icon = function (id, cls) {
    return '<svg class="icon' + (cls ? ' ' + cls : '') + '" aria-hidden="true" focusable="false"><use href="#' + id + '"></use></svg>';
  };

  /* ---------- Статус "Открыто сейчас" ---------- */
  RR.openStatus = function (now) {
    var hours = D.hours || [];
    if (!hours.length) return null;
    now = now || RR.mskNow();
    var dow = RR.dow(now);
    var mins = now.getUTCHours() * 60 + now.getUTCMinutes();
    var today = hours[dow];
    var open = RR.hm(today.open), close = RR.hm(today.close);
    if (mins >= open && mins < close) {
      var left = close - mins;
      return {
        open: true, word: 'Открыто',
        rest: 'до ' + RR.closeLabel(today.close) + (left <= 60 ? ', до закрытия ' + left + ' мин' : ''),
        long: 'Сейчас открыто, работаем до ' + RR.closeLabel(today.close)
      };
    }
    if (mins < open) {
      return { open: false, word: 'Закрыто', rest: 'откроемся сегодня в ' + today.open, long: 'Сейчас закрыто. Откроемся сегодня в ' + today.open };
    }
    var next = hours[(dow + 1) % 7];
    return { open: false, word: 'Закрыто', rest: 'откроемся завтра в ' + next.open, long: 'Сейчас закрыто. Откроемся завтра в ' + next.open };
  };

  function renderStatus() {
    var st = RR.openStatus();
    if (!st) return;
    document.querySelectorAll('[data-status]').forEach(function (el) {
      el.classList.toggle('status--open', st.open);
      el.classList.toggle('status--closed', !st.open);
      var w = el.querySelector('.status__word');
      var r = el.querySelector('.status__rest');
      if (w) w.textContent = st.word;
      if (r) r.textContent = st.rest;
    });
    document.querySelectorAll('[data-status-long]').forEach(function (el) { el.textContent = st.long; });
  }

  function renderHours() {
    var hours = D.hours || [];
    var today = RR.dow(RR.mskNow());
    document.querySelectorAll('[data-hours]').forEach(function (list) {
      list.innerHTML = hours.map(function (h, i) {
        return '<li' + (i === today ? ' class="is-today"' : '') + '>' +
          '<span class="hours__day">' + h.day + (h.note ? '<span class="hours__note">' + RR.esc(h.note) + '</span>' : '') + '</span>' +
          '<span class="hours__time">' + h.open + ' - ' + (h.close === '24:00' ? '00:00' : h.close) + '</span></li>';
      }).join('');
    });
  }

  /* ---------- Мобильное меню ---------- */
  function initNav() {
    var btn = document.querySelector('[data-nav-toggle]');
    var panel = btn && document.getElementById(btn.getAttribute('aria-controls'));
    if (!btn || !panel) return;
    var label = btn.querySelector('.burger__label');
    function set(open) {
      btn.setAttribute('aria-expanded', String(open));
      panel.hidden = !open;
      if (label) label.textContent = open ? 'Закрыть' : 'Меню';
    }
    btn.addEventListener('click', function () { set(btn.getAttribute('aria-expanded') !== 'true'); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && btn.getAttribute('aria-expanded') === 'true') { set(false); btn.focus(); }
    });
    panel.addEventListener('click', function (e) { if (e.target.closest('a')) set(false); });
    /* ds-allow-hardcode: брейкпоинт совпадает с @media в style.css, var() в matchMedia недоступен */
    window.matchMedia('(min-width: 960px)').addEventListener('change', function (mq) { if (mq.matches) set(false); }); // ds-allow-hardcode: брейкпоинт шапки
  }

  function initYear() {
    document.querySelectorAll('[data-year]').forEach(function (el) { el.textContent = String(new Date().getFullYear()); });
  }

  function initContacts() {
    document.querySelectorAll('[data-address]').forEach(function (el) { el.textContent = D.address; });
  }

  RR.ready = function (fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  };

  RR.ready(function () {
    initNav();
    renderStatus();
    renderHours();
    initYear();
    initContacts();
    /* Статус пересчитывается раз в минуту, если вкладка открыта долго */
    setInterval(renderStatus, 60 * 1000);
  });
})();
