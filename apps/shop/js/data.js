/*
  Данные магазина «Зерно и Пламя».
  Всё вымышлено: цены, остатки, адреса. Редактируйте здесь, логика в app.js.

  Поля товара:
    id        slug для адреса #/product/<id>
    cat       single | blend | drip | gear
    pack      ключ цвета упаковки (см. --pack-* в css/style.css)
    art       для drip и gear: какую иллюстрацию рисовать (sachet | v60 | filters | chemex | grinder)
    process   массив: washed | natural | honey (у аксессуаров пусто)
    roast     filter | espresso | omni | null
    profile   кислотность, плотность, сладость по шкале 1-5
    variants  варианты веса или фасовки с ценой
    grinds    true, если товар можно смолоть
    badges    new (Новый урожай) | hit (Хит) | low (Мало осталось)
    stock     сколько единиц на складе (ограничивает количество в корзине), null = без ограничений
    rank      порядок в сортировке «Рекомендуем» (меньше = выше)
    added     дата поступления (для сортировки «Новинки»)
    photo     фото для галереи на странице товара
    pairs     «С этим берут»: три id
*/
window.APP_DATA = {
  freeShippingFrom: 3000,
  promo: { code: 'ZERNO10', percent: 10 },

  categories: [
    { id: 'all', label: 'Всё' },
    { id: 'single', label: 'Моносорта' },
    { id: 'blend', label: 'Бленды' },
    { id: 'drip', label: 'Дрип-пакеты' },
    { id: 'gear', label: 'Аксессуары' }
  ],
  processes: [
    { id: 'washed', label: 'Мытая' },
    { id: 'natural', label: 'Натуральная' },
    { id: 'honey', label: 'Хани' }
  ],
  roasts: [
    { id: 'filter', label: 'Под фильтр', short: 'фильтр' },
    { id: 'espresso', label: 'Под эспрессо', short: 'эспрессо' },
    { id: 'omni', label: 'Омни', short: 'омни' }
  ],
  grinds: [
    { id: 'beans', label: 'Зерно' },
    { id: 'turka', label: 'Под турку' },
    { id: 'espresso', label: 'Под эспрессо' },
    { id: 'filter', label: 'Под фильтр' },
    { id: 'french', label: 'Под френч-пресс' }
  ],
  badges: {
    new: 'Новый урожай',
    hit: 'Хит',
    low: 'Мало осталось'
  },
  sorts: [
    { id: 'rec', label: 'Сначала рекомендуем' },
    { id: 'price-asc', label: 'Сначала дешевле' },
    { id: 'price-desc', label: 'Сначала дороже' },
    { id: 'sca', label: 'По оценке SCA' },
    { id: 'new', label: 'Новинки' }
  ],

  delivery: [
    { id: 'courier', label: 'Курьер по Санкт-Петербургу', price: 350, note: 'На следующий день после обжарки, в выбранный интервал' },
    { id: 'pickup', label: 'Самовывоз из обжарочной', price: 0, note: 'Васильевский остров, Обжарочный переулок, 4. Пн-Сб 10:00-20:00' },
    { id: 'pvz', label: 'Пункт выдачи по России', price: 290, note: '2-6 дней после отправки, срок зависит от города' }
  ],

  products: [
    {
      id: 'ethiopia-yirgacheffe',
      name: 'Эфиопия Иргачеффе',
      cat: 'single', pack: 'eth',
      country: 'Эфиопия', region: 'Иргачеффе, зона Гедео', altitude: '1900-2100 м',
      variety: 'Местные эфиопские разновидности', harvest: '2025/26',
      process: ['washed'], roast: 'filter',
      descriptors: ['бергамот', 'жасмин', 'персик', 'лимонная цедра'],
      sca: 87.5,
      profile: { acidity: 5, body: 2, sweetness: 4 },
      variants: [ { id: '250', label: '250 г', price: 990 }, { id: '1000', label: '1 кг', price: 3490 } ],
      grinds: true, badges: ['new'], stock: 40, rank: 1, added: '2026-09-08',
      photo: 'beans',
      lead: 'Светлый и цветочный, как чёрный чай с бергамотом. Хорош в воронке и аэропрессе.',
      text: 'Лот с кооперативной станции в Гедео: ягоды собирают вручную, после депульпации зерно ферментируют 36 часов и промывают в каналах. Мы обжариваем его светло, чтобы сохранить жасмин и цитрус. Во второй неделе после обжарки раскрывается персик.',
      brew: 'V60: 15 г кофе на 250 мл воды 93 °C, помол средне-мелкий, общее время 2:45-3:00.',
      pairs: ['v60-ceramic', 'filters-v60', 'kenya-aa']
    },
    {
      id: 'colombia-huila',
      name: 'Колумбия Уила',
      cat: 'single', pack: 'col',
      country: 'Колумбия', region: 'Уила, муниципалитет Питалито', altitude: '1600-1800 м',
      variety: 'Кастильо, Катурра', harvest: '2025/26',
      process: ['washed'], roast: 'omni',
      descriptors: ['карамель', 'красное яблоко', 'молочный шоколад'],
      sca: 85,
      profile: { acidity: 3, body: 3, sweetness: 4 },
      variants: [ { id: '250', label: '250 г', price: 850 }, { id: '1000', label: '1 кг', price: 2990 } ],
      grinds: true, badges: ['hit'], stock: 60, rank: 2, added: '2026-06-20',
      photo: 'beans',
      lead: 'Сбалансированный кофе на каждый день: одинаково хорош в турке, воронке и с молоком.',
      text: 'Лот от двенадцати семейных ферм вокруг Питалито. Мягкая яблочная кислотность, карамельная сладость и плотное шоколадное послевкусие. Омни-обжарка: подходит и для фильтра, и для эспрессо.',
      brew: 'Френч-пресс: 17 г на 280 мл, крупный помол, 4 минуты, затем снять пенку и разлить.',
      pairs: ['grinder-hand', 'drip-assorted', 'guatemala-antigua']
    },
    {
      id: 'kenya-aa',
      name: 'Кения АА',
      cat: 'single', pack: 'ken',
      country: 'Кения', region: 'Ньери, станция Гатомбойя', altitude: '1750-1900 м',
      variety: 'SL28, SL34', harvest: '2025/26',
      process: ['washed'], roast: 'filter',
      descriptors: ['чёрная смородина', 'грейпфрут', 'тростниковый сахар'],
      sca: 87,
      profile: { acidity: 5, body: 3, sweetness: 3 },
      variants: [ { id: '250', label: '250 г', price: 1090 }, { id: '1000', label: '1 кг', price: 3890 } ],
      grinds: true, badges: ['low'], stock: 3, rank: 4, added: '2026-05-14',
      photo: 'beans',
      lead: 'Яркий и сочный, со смородиной и грейпфрутом. Последние пачки этого урожая.',
      text: 'Класс АА означает самое крупное зерно после сортировки на ситах. Двойная ферментация по кенийской схеме даёт высокую кислотность с ягодным оттенком. Остаток лота небольшой, следующая поставка ожидается весной.',
      brew: 'Кемекс: 30 г на 500 мл воды 94 °C, помол средний, 4:00-4:30.',
      pairs: ['chemex-6', 'filters-v60', 'ethiopia-yirgacheffe']
    },
    {
      id: 'brazil-cerrado',
      name: 'Бразилия Серрадо',
      cat: 'single', pack: 'bra',
      country: 'Бразилия', region: 'Серрадо Минейро', altitude: '1000-1200 м',
      variety: 'Мундо Ново, Желтый Катуаи', harvest: '2025',
      process: ['natural'], roast: 'espresso',
      descriptors: ['фундук', 'какао', 'карамель'],
      sca: 83,
      profile: { acidity: 1, body: 4, sweetness: 3 },
      variants: [ { id: '250', label: '250 г', price: 690 }, { id: '1000', label: '1 кг', price: 2390 } ],
      grinds: true, badges: ['hit'], stock: 80, rank: 3, added: '2026-03-02',
      photo: 'beans',
      lead: 'Низкая кислотность, орех и какао. Понятный вкус для капучино и турки.',
      text: 'Ягоды сушат целиком на открытых площадках, поэтому зерно набирает сладость и плотность. Обжарка чуть темнее средней: в молочных напитках вкус не теряется.',
      brew: 'Эспрессо: 18 г на выходе 36 г за 27-30 секунд, 93 °C.',
      pairs: ['grinder-hand', 'blend-morning', 'colombia-decaf']
    },
    {
      id: 'guatemala-antigua',
      name: 'Гватемала Антигуа',
      cat: 'single', pack: 'gua',
      country: 'Гватемала', region: 'Антигуа, склоны вулкана Агуа', altitude: '1500-1700 м',
      variety: 'Бурбон, Катурра', harvest: '2025/26',
      process: ['washed'], roast: 'omni',
      descriptors: ['тёмный шоколад', 'специи', 'апельсин'],
      sca: 84.5,
      profile: { acidity: 3, body: 4, sweetness: 3 },
      variants: [ { id: '250', label: '250 г', price: 890 }, { id: '1000', label: '1 кг', price: 3150 } ],
      grinds: true, badges: [], stock: 45, rank: 6, added: '2026-07-01',
      photo: 'beans',
      lead: 'Плотный, шоколадный, с апельсиновой цедрой в послевкусии.',
      text: 'Вулканические почвы и прохладные ночи дают плотное тело и пряность. Хорошо переносит и воронку, и гейзерную кофеварку.',
      brew: 'Аэропресс: 15 г на 230 мл, помол средний, 1:30 настаивания, отжим 30 секунд.',
      pairs: ['v60-ceramic', 'colombia-huila', 'drip-ethiopia']
    },
    {
      id: 'rwanda-kivu',
      name: 'Руанда Киву',
      cat: 'single', pack: 'rwa',
      country: 'Руанда', region: 'Ньямашеке, озеро Киву', altitude: '1700-1900 м',
      variety: 'Ред Бурбон', harvest: '2025/26',
      process: ['honey'], roast: 'filter',
      descriptors: ['клюква', 'красный чай', 'мёд'],
      sca: 86.5,
      profile: { acidity: 4, body: 2, sweetness: 5 },
      variants: [ { id: '250', label: '250 г', price: 1050 }, { id: '1000', label: '1 кг', price: 3690 } ],
      grinds: true, badges: ['new', 'low'], stock: 5, rank: 5, added: '2026-09-15',
      photo: 'beans',
      lead: 'Хани-обработка: мёд, клюква и чайная лёгкость.',
      text: 'При хани-обработке с зерна снимают кожицу, но оставляют часть сладкой мякоти, и так сушат. Получается сладость натуральной обработки и чистота мытой. Небольшой лот от станции у озера Киву.',
      brew: 'V60: 15 г на 250 мл воды 92 °C, три пролива по 80 мл.',
      pairs: ['v60-ceramic', 'ethiopia-yirgacheffe', 'filters-v60']
    },
    {
      id: 'colombia-decaf',
      name: 'Колумбия Декаф',
      packSub: 'Декаф',
      cat: 'single', pack: 'dec',
      country: 'Колумбия', region: 'Уила', altitude: '1500-1700 м',
      variety: 'Кастильо', harvest: '2025',
      process: ['washed'], roast: 'omni',
      descriptors: ['молочный шоколад', 'изюм', 'печенье'],
      sca: 84,
      profile: { acidity: 2, body: 3, sweetness: 4 },
      variants: [ { id: '250', label: '250 г', price: 890 }, { id: '1000', label: '1 кг', price: 3190 } ],
      grinds: true, badges: [], stock: 30, rank: 9, added: '2026-04-10',
      photo: 'beans',
      lead: 'Кофеин удалён натуральным способом, вкус остался.',
      text: 'Декофеинизация этилацетатом из сахарного тростника: мягкий способ, который бережёт сладость. Удалено 99,9% кофеина. Для вечернего кофе и для тех, кому нельзя кофеин.',
      brew: 'Турка: 10 г на 100 мл холодной воды, помол очень мелкий, нагревать до первого подъёма пенки.',
      pairs: ['blend-evening', 'drip-assorted', 'brazil-cerrado']
    },
    {
      id: 'blend-morning',
      name: 'Эспрессо-бленд «Утро»',
      packTitle: '«Утро»', packSub: 'эспрессо-бленд',
      cat: 'blend', pack: 'mor',
      country: 'Бразилия, Колумбия', region: '60% Серрадо, 40% Уила', altitude: '1000-1800 м',
      variety: 'Мундо Ново, Кастильо', harvest: '2025/26',
      process: ['natural', 'washed'], roast: 'espresso',
      descriptors: ['молочный шоколад', 'фундук', 'карамель'],
      sca: 83,
      profile: { acidity: 2, body: 4, sweetness: 4 },
      variants: [ { id: '250', label: '250 г', price: 750 }, { id: '1000', label: '1 кг', price: 2590 } ],
      grinds: true, badges: ['hit'], stock: 120, rank: 7, added: '2026-02-01',
      photo: 'beans',
      lead: 'Наш основной эспрессо: сладкий, плотный, дружит с молоком.',
      text: 'Бразилия даёт тело и ореховую сладость, Колумбия добавляет карамель и лёгкую яблочную кислотность. Этот бленд варят в нескольких кофейнях Петербурга.',
      brew: 'Эспрессо: 18 г на выходе 38 г за 28 секунд. Для капучино можно чуть короче.',
      pairs: ['grinder-hand', 'blend-evening', 'brazil-cerrado']
    },
    {
      id: 'blend-evening',
      name: 'Эспрессо-бленд «Вечер»',
      packTitle: '«Вечер»', packSub: 'эспрессо-бленд',
      cat: 'blend', pack: 'eve',
      country: 'Эфиопия, Гватемала', region: '50% Гуджи, 50% Антигуа', altitude: '1500-2100 м',
      variety: 'Эфиопские разновидности, Бурбон', harvest: '2025/26',
      process: ['natural', 'washed'], roast: 'espresso',
      descriptors: ['вишня', 'тёмный шоколад', 'специи'],
      sca: 84,
      profile: { acidity: 3, body: 4, sweetness: 3 },
      variants: [ { id: '250', label: '250 г', price: 790 }, { id: '1000', label: '1 кг', price: 2790 } ],
      grinds: true, badges: [], stock: 70, rank: 8, added: '2026-02-01',
      photo: 'beans',
      lead: 'Эспрессо с ягодой: натуральная Эфиопия поверх шоколадной Гватемалы.',
      text: 'Бленд для тех, кому «Утро» кажется слишком спокойным. В чистом эспрессо заметна вишня, в флэт уайте остаётся тёмный шоколад.',
      brew: 'Эспрессо: 18 г на выходе 40 г за 30 секунд, 94 °C.',
      pairs: ['blend-morning', 'colombia-decaf', 'grinder-hand']
    },
    {
      id: 'drip-ethiopia',
      name: 'Дрип-пакеты «Эфиопия»',
      packSub: 'Иргачеффе',
      cat: 'drip', pack: 'eth', art: 'sachet',
      country: 'Эфиопия', region: 'Иргачеффе', altitude: '1900-2100 м',
      variety: 'Местные эфиопские разновидности', harvest: '2025/26',
      process: ['washed'], roast: 'filter',
      descriptors: ['бергамот', 'персик', 'чёрный чай'],
      sca: 87.5,
      profile: { acidity: 4, body: 2, sweetness: 4 },
      variants: [ { id: '10', label: '10 шт', price: 690 }, { id: '30', label: '30 шт', price: 1890 } ],
      grinds: false, badges: ['new'], stock: 50, rank: 10, added: '2026-09-10',
      photo: 'pourover',
      lead: 'Иргачеффе в дрип-пакетах по 12 г: заварить в офисе или в поездке.',
      text: 'Смолото и упаковано в азоте в день обжарки, поэтому аромат держится до трёх месяцев. Каждый пакет на одну чашку 180-200 мл.',
      brew: 'Раскрыть пакет на чашке, пролить 30 мл воды 90-93 °C, подождать 30 секунд и долить до 180 мл в три приёма.',
      pairs: ['drip-assorted', 'ethiopia-yirgacheffe', 'v60-ceramic']
    },
    {
      id: 'drip-assorted',
      name: 'Дрип-пакеты «Ассорти»',
      packTitle: 'Ассорти', packSub: 'пять стран',
      cat: 'drip', pack: 'kraft', art: 'sachet',
      country: 'Пять стран', region: 'Эфиопия, Кения, Колумбия, Руанда, Гватемала', altitude: '1500-2100 м',
      variety: 'Разные', harvest: '2025/26',
      process: ['washed', 'honey'], roast: 'filter',
      descriptors: ['ягоды', 'карамель', 'цитрус'],
      sca: 86,
      profile: { acidity: 4, body: 3, sweetness: 4 },
      variants: [ { id: '10', label: '10 шт', price: 740 }, { id: '30', label: '30 шт', price: 1990 } ],
      grinds: false, badges: [], stock: 40, rank: 11, added: '2026-08-01',
      photo: 'pourover',
      lead: 'Пять моносортов по два пакета: способ найти свой кофе.',
      text: 'В коробке по два пакета каждого сорта и карточка с описанием вкуса. Удобно попробовать разное перед покупкой большой пачки.',
      brew: 'Раскрыть пакет на чашке, пролить 30 мл воды 90-93 °C, подождать 30 секунд и долить до 180 мл.',
      pairs: ['drip-ethiopia', 'colombia-huila', 'kenya-aa']
    },
    {
      id: 'v60-ceramic',
      name: 'Воронка V60, керамика',
      cat: 'gear', pack: 'stone', art: 'v60',
      spec: 'Размер 02, на 1-4 чашки. Керамика, спиральные рёбра, одно большое отверстие.',
      process: [], roast: null, descriptors: [],
      variants: [ { id: '1', label: '1 шт', price: 2490 } ],
      grinds: false, badges: ['hit'], stock: 15, rank: 12, added: '2026-01-15',
      photo: 'pourover',
      lead: 'Керамическая воронка держит температуру ровнее пластика.',
      text: 'Спиральные рёбра не дают фильтру прилипать к стенкам, одно большое отверстие позволяет управлять скоростью пролива. Перед завариванием прогрейте воронку горячей водой.',
      brew: 'Подходят бумажные фильтры размера 02.',
      pairs: ['filters-v60', 'ethiopia-yirgacheffe', 'grinder-hand']
    },
    {
      id: 'filters-v60',
      name: 'Фильтры для воронки',
      cat: 'gear', pack: 'stone', art: 'filters',
      spec: 'Размер 02, небелёная бумага, 100 штук в упаковке.',
      process: [], roast: null, descriptors: [],
      variants: [ { id: '1', label: '100 шт', price: 450 } ],
      grinds: false, badges: [], stock: null, rank: 14, added: '2026-01-15',
      photo: 'pourover',
      lead: 'Небелёная бумага, размер 02.',
      text: 'Перед завариванием пролейте фильтр горячей водой: уйдёт бумажный привкус и прогреется воронка.',
      brew: 'Совместимы с конусными воронками размера 02.',
      pairs: ['v60-ceramic', 'rwanda-kivu', 'colombia-huila']
    },
    {
      id: 'chemex-6',
      name: 'Кемекс на 6 чашек',
      cat: 'gear', pack: 'stone', art: 'chemex',
      spec: 'Боросиликатное стекло, деревянная муфта с кожаным шнурком. Объём 900 мл.',
      process: [], roast: null, descriptors: [],
      variants: [ { id: '1', label: '1 шт', price: 5990 } ],
      grinds: false, badges: ['low'], stock: 2, rank: 13, added: '2026-06-01',
      photo: 'chemex',
      lead: 'Колба и воронка в одном предмете. Чистая чашка без осадка.',
      text: 'Плотные фильтры кемекса задерживают масла, поэтому напиток получается прозрачным и лёгким. Хорош для светлой обжарки и для заваривания на двоих-троих.',
      brew: 'На 500 мл воды берите 30 г кофе среднего помола.',
      pairs: ['kenya-aa', 'grinder-hand', 'ethiopia-yirgacheffe']
    },
    {
      id: 'grinder-hand',
      name: 'Ручная кофемолка',
      cat: 'gear', pack: 'stone', art: 'grinder',
      spec: 'Стальные конические жернова 38 мм, 30 ступеней помола, 25 г за раз.',
      process: [], roast: null, descriptors: [],
      variants: [ { id: '1', label: '1 шт', price: 4790 } ],
      grinds: false, badges: ['hit'], stock: 12, rank: 15, added: '2026-03-20',
      photo: 'beans',
      lead: 'Молоть прямо перед завариванием: самое заметное улучшение вкуса.',
      text: 'Конические жернова дают ровный помол от эспрессо до френч-пресса. Кофемолка разбирается без инструментов, в комплекте кисточка для чистки.',
      brew: 'Для воронки ставьте 14-16 щелчков от нуля, для френч-пресса 24-26.',
      pairs: ['colombia-huila', 'v60-ceramic', 'blend-morning']
    }
  ],

  photos: {
    beans: { src: 'img/beans.webp', w: 1024, h: 679, alt: 'Свежеобжаренные кофейные зёрна крупным планом' },
    pourover: { src: 'img/pourover.webp', w: 1024, h: 577, alt: 'Кофе заваривается в воронке над стеклянным чайником у окна' },
    chemex: { src: 'img/chemex.webp', w: 1024, h: 576, alt: 'Стеклянный кемекс с деревянной муфтой на тёмном фоне' }
  }
};
