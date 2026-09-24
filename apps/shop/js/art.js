/*
  Иллюстрации товаров: упаковки и аксессуары рисуются как inline SVG.
  Цвета приходят из CSS-токенов через классы (tone-*, art__*), здесь только геометрия.
  Все иллюстрации декоративные (aria-hidden), описание товара есть в тексте рядом.
*/
(function () {
  'use strict';

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function packTitle(p) { return p.packTitle || p.country; }
  function packSub(p) { return p.packSub || String(p.region || '').split(',')[0]; }

  var ROAST = { filter: 'под фильтр', espresso: 'под эспрессо', omni: 'омни-обжарка' };

  /* Стоячий пакет с клапаном и бумажной этикеткой */
  function pouch(p) {
    var title = esc(packTitle(p));
    var sub = esc(packSub(p));
    var small = title.length > 9 ? ' art__title--sm' : '';
    return '' +
      '<ellipse class="art__shadow" cx="120" cy="290" rx="86" ry="7"/>' +
      '<path class="art__body" d="M60 34h120l14 244a8 8 0 0 1-8 8H54a8 8 0 0 1-8-8z"/>' +
      '<path class="art__sheen" d="M60 34h22l-10 252H54a8 8 0 0 1-8-8z"/>' +
      '<path class="art__shade" d="M166 34h14l14 244a8 8 0 0 1-8 8h-12z"/>' +
      '<rect class="art__seal" x="60" y="30" width="120" height="16" rx="2"/>' +
      '<path class="art__crimp" d="M66 36v6M74 36v6M82 36v6M90 36v6M98 36v6M106 36v6M114 36v6M122 36v6M130 36v6M138 36v6M146 36v6M154 36v6M162 36v6M170 36v6"/>' +
      '<circle class="art__valve" cx="120" cy="76" r="8"/><circle class="art__valve-in" cx="120" cy="76" r="3.5"/>' +
      '<rect class="art__label" x="66" y="110" width="108" height="136" rx="2"/>' +
      '<text class="art__brand" x="120" y="129" text-anchor="middle">ЗЕРНО И ПЛАМЯ</text>' +
      '<path class="art__rule" d="M80 138h80"/>' +
      '<text class="art__title' + small + '" x="120" y="170" text-anchor="middle">' + title + '</text>' +
      '<text class="art__sub" x="120" y="189" text-anchor="middle">' + sub + '</text>' +
      '<path class="art__rule" d="M80 206h80"/>' +
      (p.roast ? '<text class="art__meta" x="120" y="223" text-anchor="middle">' + esc(ROAST[p.roast] || '') + '</text>' : '') +
      (p.sca ? '<text class="art__meta" x="120" y="237" text-anchor="middle">SCA ' + esc(String(p.sca).replace('.', ',')) + '</text>' : '');
  }

  /* Два дрип-пакета, один за другим */
  function sachet(p) {
    var title = esc(packTitle(p));
    function one(x, y, rot, back) {
      return '<g transform="translate(' + x + ' ' + y + ') rotate(' + rot + ')">' +
        '<rect class="art__body" x="-52" y="-78" width="104" height="156" rx="4"/>' +
        '<path class="art__sheen" d="M-52 -74a4 4 0 0 1 4-4h14v156h-14a4 4 0 0 1-4-4z"/>' +
        '<path class="art__tear" d="M-44 -58h88"/>' +
        (back ? '' :
          '<rect class="art__label" x="-38" y="-34" width="76" height="84" rx="2"/>' +
          '<text class="art__brand" x="0" y="-19" text-anchor="middle">ЗЕРНО И ПЛАМЯ</text>' +
          '<text class="art__title art__title--sm" x="0" y="8" text-anchor="middle">' + title + '</text>' +
          '<text class="art__meta" x="0" y="26" text-anchor="middle">дрип, 12 г</text>' +
          '<text class="art__meta" x="0" y="39" text-anchor="middle">1 чашка</text>') +
        '</g>';
    }
    return '<ellipse class="art__shadow" cx="120" cy="286" rx="92" ry="7"/>' +
      one(146, 150, 9, true) + one(104, 170, -5, false);
  }

  function v60() {
    return '<ellipse class="art__shadow" cx="120" cy="252" rx="92" ry="9"/>' +
      '<ellipse class="art__fill" cx="120" cy="234" rx="70" ry="12"/>' +
      '<ellipse class="art__line" cx="120" cy="234" rx="70" ry="12"/>' +
      '<path class="art__fill art__line" d="M104 206h32l4 26h-40z"/>' +
      '<path class="art__fill art__line" d="M52 92h136l-46 118h-44z"/>' +
      '<ellipse class="art__fill art__line" cx="120" cy="92" rx="68" ry="13"/>' +
      '<ellipse class="art__dark" cx="120" cy="92" rx="58" ry="8"/>' +
      '<path class="art__line art__thin" d="M78 108l30 92M96 108l22 92M142 108l-22 92M160 108l-28 92"/>' +
      '<path class="art__line" d="M186 112c26 0 34 16 28 30 s-24 18-44 14"/>';
  }

  function filters() {
    function f(x, y, rot) {
      return '<g transform="translate(' + x + ' ' + y + ') rotate(' + rot + ')">' +
        '<path class="art__paper art__line" d="M-64 -64q64 -22 128 0l-38 118h-52z"/>' +
        '<path class="art__line art__thin" d="M-50 -58l34 108M-26 44h52"/>' +
        '</g>';
    }
    return '<ellipse class="art__shadow" cx="120" cy="262" rx="90" ry="8"/>' +
      f(128, 170, 8) + f(118, 164, 2) + f(108, 158, -5);
  }

  function chemex() {
    return '<ellipse class="art__shadow" cx="120" cy="272" rx="80" ry="8"/>' +
      '<path class="art__glass art__line" d="M66 40h108l-40 104 58 106a12 12 0 0 1-11 18H59a12 12 0 0 1-11-18l58-106z"/>' +
      '<path class="art__coffee" d="M76 214h88l23 40a8 8 0 0 1-7 12H60a8 8 0 0 1-7-12z"/>' +
      '<path class="art__line art__thin" d="M78 52h84"/>' +
      '<path class="art__wood art__line" d="M96 118h48l-8 44h-32z"/>' +
      '<path class="art__line art__thin" d="M120 140v34M114 176l6 -4 6 4"/>' +
      '<circle class="art__dark" cx="120" cy="178" r="3.5"/>';
  }

  function grinder() {
    return '<ellipse class="art__shadow" cx="120" cy="272" rx="72" ry="8"/>' +
      '<rect class="art__fill art__line" x="82" y="108" width="76" height="156" rx="10"/>' +
      '<rect class="art__dark" x="82" y="176" width="76" height="10"/>' +
      '<path class="art__line art__thin" d="M92 204v44M104 204v44M116 204v44M128 204v44M140 204v44"/>' +
      '<rect class="art__fill art__line" x="76" y="92" width="88" height="20" rx="6"/>' +
      '<path class="art__line art__thick" d="M120 92V74h66"/>' +
      '<circle class="art__wood art__line" cx="194" cy="74" r="12"/>' +
      '<circle class="art__dark" cx="120" cy="74" r="5"/>';
  }

  /* Задняя сторона пакета: этикетка с данными лота */
  function back(p, roastDate) {
    var rows = [
      ['Страна', p.country],
      ['Регион', String(p.region).split(',')[0]],
      ['Высота', p.altitude],
      ['Обработка', p.processLabel],
      ['Обжарка', ROAST[p.roast] || ''],
      ['Урожай', p.harvest],
      ['Дата обжарки', roastDate]
    ];
    var y = 120;
    var lines = rows.map(function (r) {
      var out = '<text class="art__meta art__meta--l" x="74" y="' + y + '">' + esc(r[0]) + '</text>' +
        '<text class="art__meta art__meta--v" x="166" y="' + y + '" text-anchor="end">' + esc(r[1]) + '</text>' +
        '<path class="art__rule" d="M74 ' + (y + 7) + 'h92"/>';
      y += 20;
      return out;
    }).join('');
    return '<ellipse class="art__shadow" cx="120" cy="290" rx="86" ry="7"/>' +
      '<path class="art__body" d="M60 34h120l14 244a8 8 0 0 1-8 8H54a8 8 0 0 1-8-8z"/>' +
      '<path class="art__shade" d="M60 34h14l-10 252H54a8 8 0 0 1-8-8z"/>' +
      '<rect class="art__seal" x="60" y="30" width="120" height="16" rx="2"/>' +
      '<rect class="art__label" x="64" y="84" width="112" height="176" rx="2"/>' +
      '<text class="art__brand" x="120" y="102" text-anchor="middle">О ЛОТЕ</text>' +
      lines +
      '<text class="art__meta" x="120" y="' + (y + 8) + '" text-anchor="middle">Санкт-Петербург</text>';
  }

  var DRAW = { sachet: sachet, v60: v60, filters: filters, chemex: chemex, grinder: grinder };

  function svg(inner, extra) {
    return '<svg class="art ' + (extra || '') + '" viewBox="0 0 240 300" aria-hidden="true" focusable="false">' + inner + '</svg>';
  }

  window.ART = {
    front: function (p) {
      var draw = p.art ? DRAW[p.art] : pouch;
      var kind = p.cat === 'gear' ? 'art--gear' : 'art--pack';
      return svg(draw(p), kind + ' tone-' + p.pack);
    },
    back: function (p, roastDate) {
      return svg(back(p, roastDate), 'art--pack tone-' + p.pack);
    }
  };
})();
