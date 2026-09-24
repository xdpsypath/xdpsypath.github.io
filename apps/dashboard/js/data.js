/*
  Данные дашборда сети кофеен «Утро».
  Всё вымышлено и генерируется детерминированно при загрузке страницы:
  180 полных дней до вчерашнего дня включительно, по часам, по каждой точке.

  Одна и та же календарная дата всегда даёт одни и те же цифры: генератор
  случайных чисел засевается датой и номером точки, а не порядком обхода.

  Как править:
  - STORES: точки, их базовый поток чеков в будний день, коэффициент выходных,
    профиль часов и дата открытия (openedDaysAgo: null, если точка работала всегда).
  - ITEMS: позиции меню, цена в рублях и веса по частям дня.
  - HOURS: часы работы (слот 7 означает 7:00-8:00).
*/
(function () {
  'use strict';

  var DAYS = 180;
  var HOURS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];

  // Профили часов: доля дневного потока. Будни: пик 8-10 и обед 13-14.
  var WEEKDAY = [0.55, 1.3, 1.4, 0.95, 0.7, 0.82, 1.08, 0.98, 0.7, 0.64, 0.7, 0.74, 0.6, 0.44, 0.3];
  var WEEKEND = [0.22, 0.52, 0.92, 1.3, 1.36, 1.2, 1.16, 1.06, 0.96, 0.86, 0.8, 0.7, 0.56, 0.4, 0.25];
  // Сити: офисный квартал, утро и обед сильнее, вечер пустеет рано.
  var CITY_WEEKDAY = [0.8, 1.7, 1.6, 0.9, 0.62, 0.95, 1.4, 1.1, 0.6, 0.52, 0.6, 0.5, 0.32, 0.2, 0.12];

  var STORES = [
    { id: 'patriki', name: 'Патриаршие', base: 470, weekend: 1.34, profile: 'default', openedDaysAgo: null },
    { id: 'chistye', name: 'Чистые пруды', base: 430, weekend: 1.06, profile: 'default', openedDaysAgo: null },
    { id: 'hlebozavod', name: 'Хлебозавод', base: 360, weekend: 1.46, profile: 'default', openedDaysAgo: null },
    { id: 'city', name: 'Сити', base: 520, weekend: 0.38, profile: 'city', openedDaysAgo: null },
    { id: 'taganka', name: 'Таганка', base: 330, weekend: 1.12, profile: 'default', openedDaysAgo: 60 }
  ];

  // Веса по частям дня: утро (7-11), обед (12-15), вечер (16-21).
  var ITEMS = [
    { id: 'espresso', name: 'Эспрессо', price: 170, w: [6, 5, 4] },
    { id: 'americano', name: 'Американо', price: 210, w: [10, 9, 6] },
    { id: 'cappuccino', name: 'Капучино', price: 290, w: [20, 14, 12] },
    { id: 'flatwhite', name: 'Флэт уайт', price: 320, w: [12, 9, 7] },
    { id: 'latte', name: 'Латте', price: 310, w: [10, 9, 10] },
    { id: 'raf', name: 'Раф', price: 350, w: [6, 7, 10] },
    { id: 'filter', name: 'Фильтр-кофе', price: 240, w: [7, 5, 4] },
    { id: 'matcha', name: 'Матча латте', price: 390, w: [4, 5, 7], growth: 0.9 },
    { id: 'tea', name: 'Чай', price: 220, w: [3, 4, 8] },
    { id: 'lemonade', name: 'Лимонад', price: 290, w: [1, 4, 4], summer: true },
    { id: 'croissant', name: 'Круассан', price: 190, w: [16, 5, 4] },
    { id: 'sandwich', name: 'Сэндвич', price: 420, w: [4, 16, 7] },
    { id: 'dessert', name: 'Десерт дня', price: 330, w: [2, 8, 14] }
  ];

  var ITEMS_PER_CHECK = 1.55;

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash(n) {
    n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
    n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
    return (n ^ (n >>> 16)) >>> 0;
  }
  function dateSeed(d) { return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function isoKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  // Сегодня в полночь по местному времени; данные заканчиваются вчерашним днём.
  var today = new Date();
  today.setHours(0, 0, 0, 0);

  var days = [];
  for (var i = 0; i < DAYS; i++) {
    var d = new Date(today);
    d.setDate(d.getDate() - DAYS + i);
    var seed = dateSeed(d);
    var r = mulberry32(hash(seed * 7 + 3));
    // Погодные провалы: общие для всего города, около 8 дней на полгода.
    var weather = null, dip = 1;
    if (hash(seed) % 22 === 0) {
      var m = d.getMonth();
      weather = m <= 3 || m >= 10 ? 'мокрый снег' : (r() < 0.5 ? 'ливень' : 'гроза');
      dip = 0.58 + r() * 0.16;
    }
    // Лето: в июне-августе на улице больше людей и выше спрос на лимонад.
    var month = d.getMonth();
    var summer = month >= 5 && month <= 7 ? 1 : (month === 4 || month === 8 ? 0.5 : 0);
    days.push({
      key: isoKey(d),
      date: d,
      dow: (d.getDay() + 6) % 7, // 0 = понедельник
      weekend: d.getDay() === 0 || d.getDay() === 6,
      weather: weather,
      dip: dip,
      summer: summer
    });
  }

  var H = HOURS.length;
  var N = ITEMS.length;
  var rev = [], checks = [], itemQty = [], openIdx = [];

  function partOf(hour) { return hour < 12 ? 0 : (hour < 16 ? 1 : 2); }

  for (var s = 0; s < STORES.length; s++) {
    var st = STORES[s];
    var R = new Float64Array(DAYS * H);
    var C = new Uint16Array(DAYS * H);
    var Q = new Uint16Array(DAYS * N);
    var open = st.openedDaysAgo == null ? 0 : DAYS - st.openedDaysAgo;
    openIdx.push(open);
    st.openIndex = open;
    st.openDate = days[open].date;

    for (var di = open; di < DAYS; di++) {
      var day = days[di];
      var rnd = mulberry32(hash(dateSeed(day.date) * 31 + s * 977 + 11));
      var t = di / (DAYS - 1);
      var trend = 1 + 0.16 * t;
      // Новая точка набирает поток за первые 5 недель.
      var ramp = 1;
      if (st.openedDaysAgo != null) {
        var age = di - open;
        ramp = 0.55 + 0.45 * Math.min(1, age / 35);
        if (age === 0) ramp = 1.25; // день открытия
      }
      var weekendF = day.weekend ? st.weekend : 1;
      // Пятница вечером у Патриарших и Хлебозавода чуть сильнее.
      var dayNoise = 1 + (rnd() - 0.5) * 0.12;
      var summerF = 1 + 0.07 * day.summer * (st.id === 'city' ? 0.2 : 1);
      var dayChecks = st.base * trend * ramp * weekendF * day.dip * dayNoise * summerF;

      var profile = day.weekend ? WEEKEND : (st.profile === 'city' ? CITY_WEEKDAY : WEEKDAY);
      var psum = 0;
      for (var p = 0; p < H; p++) psum += profile[p];

      for (var hi = 0; hi < H; hi++) {
        var hour = HOURS[hi];
        var fri = day.dow === 4 && hour >= 18 && (st.id === 'patriki' || st.id === 'hlebozavod') ? 1.35 : 1;
        var hc = dayChecks * (profile[hi] / psum) * fri * (1 + (rnd() - 0.5) * 0.24);
        var nChecks = Math.max(0, Math.round(hc));
        var part = partOf(hour);
        var nItems = nChecks * ITEMS_PER_CHECK;
        var wsum = 0, weights = [];
        for (var k = 0; k < N; k++) {
          var it = ITEMS[k];
          var w = it.w[part];
          if (it.growth) w *= 1 + it.growth * t;
          if (it.summer) w *= 0.35 + 1.4 * day.summer;
          weights.push(w);
          wsum += w;
        }
        var hourRev = 0;
        for (k = 0; k < N; k++) {
          var q = Math.round(nItems * weights[k] / wsum * (1 + (rnd() - 0.5) * 0.3));
          if (q < 0) q = 0;
          Q[di * N + k] += q;
          hourRev += q * ITEMS[k].price;
        }
        R[di * H + hi] = hourRev;
        C[di * H + hi] = nChecks;
      }
    }
    rev.push(R); checks.push(C); itemQty.push(Q);
  }

  window.APP_DATA = {
    today: today,
    days: days,
    hours: HOURS,
    stores: STORES,
    items: ITEMS,
    rev: rev,         // rev[store][day * hours.length + hourIndex], рубли
    checks: checks,   // checks[store][day * hours.length + hourIndex]
    itemQty: itemQty, // itemQty[store][day * items.length + itemIndex], штуки
    openIdx: openIdx, // индекс первого дня работы точки
    updatedAt: '07:00'
  };
})();
