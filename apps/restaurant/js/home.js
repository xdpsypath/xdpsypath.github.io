/* Главная: фирменные блюда и "Сегодня в печи" из js/data.js */
(function () {
  'use strict';
  var D = window.APP_DATA || {};
  var RR = window.RR;

  var DOW_FULL = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];
  var MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

  function renderSignatures() {
    var list = document.getElementById('signatures');
    if (!list || !D.signatures) return;
    list.innerHTML = D.signatures.map(function (s, i) {
      var lead = i === 0;
      return '<li class="sig' + (lead ? ' sig--lead' : '') + '">' +
        '<img class="sig__img photo" src="' + s.img + '" width="' + s.w + '" height="' + s.h + '" alt="' + RR.esc(s.alt) + '" loading="lazy">' +
        (lead ? '<span class="sig__badge">' + RR.icon('i-star', 'icon--xs') + 'Хит с 1978 года</span>' : '') +
        '<div class="sig__row"><h3 class="sig__title">' + RR.esc(s.name) + '</h3><span class="sig__leader" aria-hidden="true"></span><span class="sig__price">' + RR.price(s.price) + '</span></div>' +
        '<p class="sig__desc">' + RR.esc(s.desc) + '</p>' +
        '</li>';
    }).join('');
  }

  function renderOven() {
    var specials = D.ovenSpecials;
    if (!specials || specials.length < 7) return;
    var now = RR.mskNow();
    var dow = RR.dow(now);
    var today = specials[dow];
    var dayEl = document.getElementById('oven-day');
    var nameEl = document.getElementById('oven-title');
    var descEl = document.getElementById('oven-desc');
    var priceEl = document.getElementById('oven-price');
    var weekEl = document.getElementById('oven-week');
    if (dayEl) dayEl.textContent = DOW_FULL[dow].charAt(0).toUpperCase() + DOW_FULL[dow].slice(1) + ', ' + now.getUTCDate() + ' ' + MONTHS_GEN[now.getUTCMonth()];
    if (nameEl) nameEl.textContent = today.name;
    if (descEl) descEl.textContent = today.desc;
    if (priceEl) priceEl.innerHTML = RR.price(today.price) + ' <span>' + RR.esc(today.weight) + ', только сегодня</span>';
    if (weekEl) {
      var hours = D.hours || [];
      weekEl.innerHTML = specials.map(function (s, i) {
        var isToday = i === dow;
        return '<li' + (isToday ? ' class="is-today" aria-current="date"' : '') + '>' +
          '<b>' + (hours[i] ? hours[i].short : '') + '</b>' +
          '<span>' + RR.esc(s.name) + '</span>' +
          '<span class="week__tag">' + (isToday ? 'сегодня' : RR.price(s.price)) + '</span></li>';
      }).join('');
    }
  }

  RR.ready(function () {
    renderSignatures();
    renderOven();
  });
})();
