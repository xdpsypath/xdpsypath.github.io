/* Service worker «Копилки».
   Оболочка приложения кэшируется при установке (cache-first), поэтому после
   первого открытия всё работает без сети. При выпуске новой версии поменяйте
   VERSION: старый кэш удалится при активации. */
var VERSION = 'kopilka-v1.0.0';
var FONT_CACHE = 'kopilka-fonts-v1';

var SHELL = [
  './',
  './index.html',
  './css/style.css',
  './js/data.js',
  './js/db.js',
  './js/app.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(VERSION).then(function (cache) { return cache.addAll(SHELL); }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== VERSION && k !== FONT_CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);

  /* Шрифты Google: отдаём из кэша, в фоне обновляем */
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(FONT_CACHE).then(function (cache) {
        return cache.match(req).then(function (hit) {
          var net = fetch(req).then(function (res) {
            if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
            return res;
          }).catch(function () { return hit; });
          return hit || net;
        });
      })
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  /* Навигация: оболочка из кэша (hash-маршруты живут на клиенте) */
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html').then(function (hit) {
        return hit || fetch(req);
      }).catch(function () { return caches.match('./index.html'); })
    );
    return;
  }

  /* Остальное: cache-first, недостающее докладываем в кэш */
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (res && res.ok && res.type === 'basic') {
          var copy = res.clone();
          caches.open(VERSION).then(function (cache) { cache.put(req, copy); });
        }
        return res;
      });
    })
  );
});
