/*
  Бронирование стола.
  Даты, слоты и правила берутся из APP_DATA.booking (js/data.js).
  Отправка: если в js/config.js указан WEB3FORMS_KEY, заявка уходит POST-запросом
  на api.web3forms.com. Иначе демо-режим: бронь сохраняется только в браузере.
*/
(function () {
  'use strict';
  var RR = window.RR;
  var D = window.APP_DATA || {};
  var B = D.booking || {};
  var CFG = window.APP_CONFIG || {};
  var STORE_KEY = 'nonna-rosa.bookings';

  var DOW_SHORT = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
  var DOW_FULL = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];
  var MON_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  var MON_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

  var state = { date: null, guests: 2, zone: 'hall', time: null, occasion: (B.occasions || ['Без повода'])[0] };
  var days = [];
  var els = {};
  var sending = false;

  /* ---------- Даты ---------- */
  function iso(d) { return d.toISOString().slice(0, 10); }
  function fromIso(s) { var a = s.split('-'); return new Date(Date.UTC(+a[0], +a[1] - 1, +a[2])); }
  function dateLabel(s, withDow) {
    var d = fromIso(s);
    var dow = RR.dow(d);
    return (withDow ? DOW_FULL[dow].charAt(0).toUpperCase() + DOW_FULL[dow].slice(1) + ', ' : '') + d.getUTCDate() + ' ' + MON_GEN[d.getUTCMonth()];
  }

  function buildDays() {
    var now = RR.mskNow();
    var start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    days = [];
    for (var i = 0; i < (B.daysAhead || 14); i++) {
      var d = new Date(start + i * 86400000);
      days.push({ iso: iso(d), date: d, dow: RR.dow(d), today: i === 0 });
    }
  }

  /* ---------- Слоты ---------- */
  /* Детерминированный генератор: одинаковая дата+зона всегда дают одинаковые занятые слоты */
  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0) / 4294967295;
  }

  function myBookings() {
    var list = RR.store.get(STORE_KEY, []);
    return Array.isArray(list) ? list : [];
  }

  function slotsFor(dayIso, zone) {
    var day = days.filter(function (d) { return d.iso === dayIso; })[0];
    if (!day) return [];
    var first = RR.hm(B.firstSlot || '12:00');
    var last = RR.hm(B.lastSlot || '22:30');
    var step = B.stepMinutes || 30;
    var hours = D.hours && D.hours[day.dow];
    var openFrom = hours ? RR.hm(hours.open) : first;
    var now = RR.mskNow();
    var nowMins = now.getUTCHours() * 60 + now.getUTCMinutes();
    var weekend = day.dow >= 4;
    var mine = myBookings();
    var out = [];
    for (var m = Math.max(first, openFrom); m <= last; m += step) {
      if (day.today && m <= nowMins + 30) continue;
      var t = RR.fmtHM(m);
      var evening = m >= 18 * 60 && m <= 21 * 60;
      var p = 0.18 + (evening ? 0.3 : 0) + (weekend ? 0.15 : 0) + (zone === 'oven' ? 0.1 : 0);
      var busy = hash(dayIso + '|' + zone + '|' + t) < p;
      var own = mine.some(function (b) { return b.date === dayIso && b.time === t && b.zone === zone; });
      out.push({ time: t, mins: m, busy: busy || own, own: own });
    }
    return out;
  }

  /* ---------- Зоны ---------- */
  function zoneState(z) {
    var day = days.filter(function (d) { return d.iso === state.date; })[0];
    if (z.id === 'veranda' && day) {
      var month = day.date.getUTCMonth() + 1;
      if ((B.verandaMonths || []).indexOf(month) === -1) return { disabled: true, why: 'Закрыта до мая: с октября по апрель веранда не работает' };
    }
    if (z.maxGuests && state.guests > z.maxGuests) return { disabled: true, why: 'Здесь до ' + z.maxGuests + ' гостей. Для компании выберите зал' };
    return { disabled: false };
  }

  /* ---------- Рендер ---------- */
  function renderDates() {
    els.dates.innerHTML = days.map(function (d) {
      var id = 'd-' + d.iso;
      var label = (d.today ? 'Сегодня, ' : '') + dateLabel(d.iso, true) + (d.dow === 0 ? ', бронь с 16:00' : '');
      return '<div class="opt"><input type="radio" name="date" id="' + id + '" value="' + d.iso + '"' + (state.date === d.iso ? ' checked' : '') + ' aria-label="' + label + '">' +
        '<label class="opt__face' + (d.today ? ' date--today' : '') + '" for="' + id + '" aria-hidden="true"><span class="date__dow">' + DOW_SHORT[d.dow] + '</span>' +
        '<span class="date__num">' + d.date.getUTCDate() + '</span><span class="date__mon">' + MON_SHORT[d.date.getUTCMonth()] + '</span>' +
        (d.dow === 0 ? '<span class="date__flag"></span>' : '') + '</label></div>';
    }).join('');
    var todayEl = document.getElementById('today-label');
    if (todayEl && days[0]) todayEl.textContent = 'Сегодня ' + dateLabel(days[0].iso, true).toLowerCase() + ', число подчёркнуто';
  }

  function renderZones() {
    var zones = B.zones || [];
    zones.forEach(function (z) {
      var st = zoneState(z);
      if (st.disabled && state.zone === z.id) state.zone = 'hall';
    });
    els.zones.innerHTML = zones.map(function (z) {
      var st = zoneState(z);
      var id = 'z-' + z.id;
      return '<div class="opt"><input type="radio" name="zone" id="' + id + '" value="' + z.id + '"' +
        (state.zone === z.id ? ' checked' : '') + (st.disabled ? ' disabled' : '') +
        ' aria-describedby="' + id + '-d"><label class="opt__face" for="' + id + '">' + RR.icon(z.icon, 'icon--lg') +
        '<span class="zone__name">' + RR.esc(z.name) + '</span>' +
        '<span class="zone__desc" id="' + id + '-d">' + (st.disabled ? '<span class="zone__why">' + RR.esc(st.why) + '</span>' : RR.esc(z.desc)) + '</span>' +
        '</label></div>';
    }).join('');
  }

  function renderSlots() {
    var list = slotsFor(state.date, state.zone);
    var free = list.filter(function (s) { return !s.busy; });
    if (state.time && !free.some(function (s) { return s.time === state.time; })) state.time = null;
    if (!list.length || !free.length) {
      els.slots.innerHTML = '<p class="slots-empty">' + (list.length ? 'На этот день в выбранной зоне всё занято. Попробуйте другую зону или соседний день.' : 'На сегодня бронь уже закрыта. Выберите другой день.') + '</p>';
      return;
    }
    var groups = [
      { title: 'День', items: list.filter(function (s) { return s.mins < 17 * 60; }) },
      { title: 'Вечер', items: list.filter(function (s) { return s.mins >= 17 * 60; }) }
    ];
    els.slots.innerHTML = groups.filter(function (g) { return g.items.length; }).map(function (g) {
      return '<p class="slots__group">' + g.title + '</p><div class="slots">' + g.items.map(function (s) {
        var id = 't-' + s.time.replace(':', '');
        var st = s.own ? 'ваша бронь' : (s.busy ? 'занято' : 'свободно');
        return '<div class="opt"><input type="radio" name="time" id="' + id + '" value="' + s.time + '"' +
          (state.time === s.time ? ' checked' : '') + (s.busy ? ' disabled' : '') + ' aria-label="' + s.time + ', ' + st + '">' +
          '<label class="opt__face" for="' + id + '" aria-hidden="true">' + s.time + (s.busy ? '<span class="slot__state">' + st + '</span>' : '') + '</label></div>';
      }).join('') + '</div>';
    }).join('');
  }

  function renderOccasions() {
    els.occasions.innerHTML = (B.occasions || []).map(function (o, i) {
      var id = 'o-' + i;
      return '<div class="opt"><input type="radio" name="occasion" id="' + id + '" value="' + RR.esc(o) + '"' + (state.occasion === o ? ' checked' : '') + '>' +
        '<label class="opt__face" for="' + id + '">' + RR.esc(o) + '</label></div>';
    }).join('');
  }

  function guestsWord(n) { return RR.plural(n, 'гость', 'гостя', 'гостей'); }

  function setSummary(el, text, empty) {
    el.textContent = text;
    el.classList.toggle('is-empty', !!empty);
  }

  function renderSummary() {
    var zone = (B.zones || []).filter(function (z) { return z.id === state.zone; })[0];
    setSummary(els.sumDate, state.date ? dateLabel(state.date, true) : 'не выбран', !state.date);
    setSummary(els.sumTime, state.time || 'не выбрано', !state.time);
    setSummary(els.sumGuests, state.guests + ' ' + guestsWord(state.guests));
    setSummary(els.sumZone, zone ? zone.name : 'Зал');
    setSummary(els.sumOccasion, state.occasion);
    els.guestsWord.textContent = guestsWord(state.guests);
    els.banquet.hidden = state.guests < (B.banquetFrom || 9);
    var day = days.filter(function (d) { return d.iso === state.date; })[0];
    els.dateNote.hidden = !(day && day.dow === 0);
    els.minus.disabled = state.guests <= 1;
    els.plus.disabled = state.guests >= (B.maxGuests || 12);
  }

  function refresh(opts) {
    opts = opts || {};
    if (opts.zones !== false) renderZones();
    renderSlots();
    renderSummary();
  }

  /* ---------- Брони в браузере ---------- */
  function renderBookings() {
    var now = RR.mskNow();
    var todayIso = iso(now);
    var list = myBookings().filter(function (b) { return b.date >= todayIso; })
      .sort(function (a, b) { return (a.date + a.time).localeCompare(b.date + b.time); });
    els.empty.hidden = list.length > 0;
    els.list.innerHTML = list.map(function (b) {
      var zone = (B.zones || []).filter(function (z) { return z.id === b.zone; })[0];
      return '<li class="booking-item"><div>' +
        '<p class="booking-item__date">' + dateLabel(b.date, true) + ', ' + b.time + '</p>' +
        '<p class="booking-item__meta">' + b.guests + ' ' + guestsWord(b.guests) + ', ' + (zone ? zone.name.toLowerCase() : '') +
        (b.occasion && b.occasion !== 'Без повода' ? ', ' + RR.esc(b.occasion.toLowerCase()) : '') + '. На имя ' + RR.esc(b.name) + '</p></div>' +
        '<button class="btn btn--danger-outline btn--sm" type="button" data-cancel="' + b.id + '">' + RR.icon('i-trash', 'icon--sm') + 'Отменить бронь</button></li>';
    }).join('');
  }

  var cancelId = null, cancelTrigger = null;
  function openCancel(btn) {
    cancelId = btn.getAttribute('data-cancel');
    cancelTrigger = btn;
    var b = myBookings().filter(function (x) { return x.id === cancelId; })[0];
    if (b) els.cancelText.textContent = 'Бронь на ' + dateLabel(b.date, false) + ' в ' + b.time + ' будет отменена, стол освободится для других гостей. Вернуть её не получится.';
    if (typeof els.dialog.showModal === 'function') els.dialog.showModal();
    else if (window.confirm('Отменить бронь?')) doCancel();
  }
  function doCancel() {
    var list = myBookings().filter(function (x) { return x.id !== cancelId; });
    RR.store.set(STORE_KEY, list);
    cancelTrigger = null;
    if (els.dialog.open) els.dialog.close();
    renderBookings();
    renderSlots();
    els.myTitle.focus();
    announce('Бронь отменена.');
  }

  function announce(text) {
    els.live.textContent = '';
    setTimeout(function () { els.live.textContent = text; }, 50);
  }

  /* ---------- Телефон: маска +7 (XXX) XXX-XX-XX ---------- */
  function phoneDigits(v) {
    var d = String(v).replace(/\D/g, '');
    if (d.length > 10 && (d.charAt(0) === '7' || d.charAt(0) === '8')) d = d.slice(1);
    else if (d.length === 11 && d.charAt(0) === '8') d = d.slice(1);
    return d.slice(0, 10);
  }
  function formatPhone(d) {
    if (!d) return '';
    var s = '+7 (' + d.slice(0, 3);
    if (d.length >= 3) s += ')';
    if (d.length > 3) s += ' ' + d.slice(3, 6);
    if (d.length > 6) s += '-' + d.slice(6, 8);
    if (d.length > 8) s += '-' + d.slice(8, 10);
    return s;
  }
  function onPhoneInput(e) {
    var input = els.phone;
    var raw = input.value;
    /* При вводе "+7" или "8" в начале эти символы не считаем цифрами номера */
    var digits = raw.replace(/\D/g, '');
    if (raw.trim().indexOf('+7') === 0) digits = digits.slice(1);
    if (digits.length === 11 && (digits.charAt(0) === '8' || digits.charAt(0) === '7')) digits = digits.slice(1);
    digits = digits.slice(0, 10);
    if (e && e.inputType && e.inputType.indexOf('delete') === 0 && raw.length < (input.dataset.prev || '').length) {
      /* При удалении не мешаем: если стёрли разделитель, стираем и цифру перед ним */
      var prevDigits = phoneDigits(input.dataset.prev || '');
      if (prevDigits === digits && digits.length) digits = digits.slice(0, -1);
    }
    input.value = formatPhone(digits);
    input.dataset.prev = input.value;
    if (input.getAttribute('aria-invalid') === 'true' && digits.length === 10) setError('phone', false);
  }

  /* ---------- Валидация ---------- */
  function setError(field, on) {
    var input = field === 'time' ? null : els[field];
    var err = document.getElementById(field + '-error');
    if (input) input.setAttribute('aria-invalid', on ? 'true' : 'false');
    if (err) err.hidden = !on;
  }

  function validate() {
    var bad = [];
    var name = els.name.value.trim();
    var nameOk = name.length >= 2 && /[a-zа-яё]/i.test(name);
    setError('name', !nameOk);
    if (!nameOk) bad.push(els.name);
    var phoneOk = phoneDigits(els.phone.value).length === 10;
    setError('phone', !phoneOk);
    if (!phoneOk) bad.push(els.phone);
    var timeOk = !!state.time;
    setError('time', !timeOk);
    if (!timeOk) bad.unshift(els.slots.querySelector('input:not(:disabled)') || els.slots);
    return bad;
  }

  /* ---------- Отправка ---------- */
  function setLoading(on) {
    sending = on;
    els.submit.setAttribute('aria-busy', String(on));
    els.submit.innerHTML = on
      ? '<span class="spinner" aria-hidden="true"></span><span class="btn__label">Отправляем бронь</span>'
      : '<span class="btn__label">Подтвердить бронь</span>';
  }

  function payload() {
    var zone = (B.zones || []).filter(function (z) { return z.id === state.zone; })[0];
    return {
      id: 'b' + Date.now().toString(36) + Math.floor(Math.random() * 1000).toString(36),
      date: state.date,
      time: state.time,
      guests: state.guests,
      zone: state.zone,
      zoneName: zone ? zone.name : '',
      occasion: state.occasion,
      name: els.name.value.trim(),
      phone: els.phone.value,
      wishes: els.wishes.value.trim(),
      created: new Date().toISOString()
    };
  }

  function send(data) {
    var key = (CFG.WEB3FORMS_KEY || '').trim();
    if (!key) {
      /* Демо-режим: имитируем сетевой запрос */
      return new Promise(function (resolve) { setTimeout(function () { resolve({ demo: true }); }, 900); });
    }
    var body = {
      access_key: key,
      subject: CFG.MAIL_SUBJECT || 'Новая бронь',
      from_name: 'Сайт траттории',
      name: data.name,
      phone: data.phone,
      message: 'Бронь: ' + dateLabel(data.date, true) + ', ' + data.time + '. Гостей: ' + data.guests + '. Зона: ' + data.zoneName +
        '. Повод: ' + data.occasion + '. Пожелания: ' + (data.wishes || 'нет')
    };
    return fetch(CFG.WEB3FORMS_URL || 'https://api.web3forms.com/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok || j.success === false) throw new Error(j.message || 'Сервер ответил ошибкой');
        return { demo: false };
      });
    });
  }

  function onSubmit(e) {
    e.preventDefault();
    if (sending) return;
    els.alert.hidden = true;
    var bad = validate();
    if (bad.length) {
      bad[0].focus();
      els.alert.hidden = false;
      els.alertText.textContent = 'Проверьте отмеченные поля: ' + [
        !state.time ? 'время' : null,
        els.name.getAttribute('aria-invalid') === 'true' ? 'имя' : null,
        els.phone.getAttribute('aria-invalid') === 'true' ? 'телефон' : null
      ].filter(Boolean).join(', ') + '.';
      return;
    }
    var data = payload();
    setLoading(true);
    send(data).then(function (res) {
      var list = myBookings();
      list.push(data);
      RR.store.set(STORE_KEY, list);
      setLoading(false);
      els.successDetails.textContent = dateLabel(data.date, true) + ', ' + data.time + '. ' + data.guests + ' ' + guestsWord(data.guests) +
        ', ' + data.zoneName.toLowerCase() + '. Бронь на имя ' + data.name + ', перезвоним на ' + data.phone + '.';
      els.demo.hidden = !res.demo;
      els.form.hidden = true;
      els.success.hidden = false;
      els.success.focus();
      renderBookings();
    }).catch(function () {
      setLoading(false);
      els.alert.hidden = false;
      els.alertText.textContent = 'Не получилось отправить бронь: нет связи с сервером. Попробуйте ещё раз или позвоните +7 (495) 555-01-78.';
      els.submit.focus();
    });
  }

  function bookAgain() {
    els.success.hidden = true;
    els.form.hidden = false;
    state.time = null;
    els.wishes.value = '';
    refresh();
    var first = els.dates.querySelector('input:checked');
    if (first) first.focus();
  }

  RR.ready(function () {
    els.form = document.getElementById('booking-form');
    if (!els.form) return;
    ['dates', 'zones', 'slots', 'occasions', 'name', 'phone', 'wishes', 'submit', 'success', 'bookings', 'guests'].forEach(function (id) { els[id] = document.getElementById(id); });
    els.list = els.bookings;
    els.empty = document.getElementById('bookings-empty');
    els.myTitle = document.getElementById('my-title');
    els.sumDate = document.getElementById('sum-date');
    els.sumTime = document.getElementById('sum-time');
    els.sumGuests = document.getElementById('sum-guests');
    els.sumZone = document.getElementById('sum-zone');
    els.sumOccasion = document.getElementById('sum-occasion');
    els.guestsWord = document.getElementById('guests-word');
    els.banquet = document.getElementById('banquet-note');
    els.dateNote = document.getElementById('date-note');
    els.minus = document.getElementById('guests-minus');
    els.plus = document.getElementById('guests-plus');
    els.alert = document.getElementById('form-alert');
    els.alertText = document.getElementById('form-alert-text');
    els.successDetails = document.getElementById('success-details');
    els.demo = document.getElementById('success-demo');
    els.dialog = document.getElementById('cancel-dialog');
    els.cancelText = document.getElementById('cancel-text');
    els.live = document.createElement('p');
    els.live.className = 'sr-only';
    els.live.setAttribute('role', 'status');
    document.body.appendChild(els.live);

    buildDays();
    /* По умолчанию: первый день, где есть свободное время */
    for (var i = 0; i < days.length; i++) {
      if (slotsFor(days[i].iso, 'hall').some(function (s) { return !s.busy; })) { state.date = days[i].iso; break; }
    }
    if (!state.date) state.date = days[0].iso;

    renderDates();
    renderOccasions();
    refresh();
    renderBookings();

    els.dates.addEventListener('change', function (e) {
      if (e.target.name !== 'date') return;
      state.date = e.target.value;
      refresh();
    });
    els.zones.addEventListener('change', function (e) {
      if (e.target.name !== 'zone') return;
      state.zone = e.target.value;
      refresh({ zones: false });
    });
    els.slots.addEventListener('change', function (e) {
      if (e.target.name !== 'time') return;
      state.time = e.target.value;
      setError('time', false);
      renderSummary();
    });
    els.occasions.addEventListener('change', function (e) {
      if (e.target.name !== 'occasion') return;
      state.occasion = e.target.value;
      renderSummary();
    });

    function setGuests(n) {
      var max = B.maxGuests || 12;
      n = Math.max(1, Math.min(max, Math.round(+n || 1)));
      state.guests = n;
      els.guests.value = String(n);
      refresh();
    }
    els.minus.addEventListener('click', function () { setGuests(state.guests - 1); });
    els.plus.addEventListener('click', function () { setGuests(state.guests + 1); });
    els.guests.addEventListener('change', function () { setGuests(els.guests.value); });

    els.phone.addEventListener('input', onPhoneInput);
    els.phone.addEventListener('focus', function () { if (!els.phone.value) { els.phone.value = '+7 ('; els.phone.dataset.prev = els.phone.value; } });
    els.phone.addEventListener('blur', function () { if (els.phone.value === '+7 (') els.phone.value = ''; });
    els.name.addEventListener('input', function () { if (els.name.getAttribute('aria-invalid') === 'true' && els.name.value.trim().length >= 2) setError('name', false); });

    els.form.addEventListener('submit', onSubmit);
    document.getElementById('book-again').addEventListener('click', bookAgain);

    els.list.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-cancel]');
      if (btn) openCancel(btn);
    });
    document.getElementById('cancel-keep').addEventListener('click', function () { els.dialog.close(); });
    document.getElementById('cancel-confirm').addEventListener('click', doCancel);
    els.dialog.addEventListener('close', function () {
      if (cancelTrigger && document.body.contains(cancelTrigger)) cancelTrigger.focus();
    });
  });
})();
