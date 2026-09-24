/* Справочные данные приложения «Копилка».
   Категории, валюты и правила генерации демо-данных.
   Чтобы добавить категорию, допишите объект в нужный список:
   id (латиница, уникальный), name (подпись), icon (id символа из спрайта в index.html),
   slot (номер цвета диаграммы 1-8; 0 = серый цвет «Остальное»). */
window.APP_DATA = {
  version: 1,

  categories: {
    expense: [
      { id: 'food', name: 'Продукты', icon: 'shopping-basket', slot: 1 },
      { id: 'cafe', name: 'Кафе', icon: 'coffee', slot: 2 },
      { id: 'transport', name: 'Транспорт', icon: 'bus', slot: 3 },
      { id: 'home', name: 'Жильё', icon: 'house', slot: 4 },
      { id: 'phone', name: 'Связь', icon: 'smartphone', slot: 5 },
      { id: 'health', name: 'Здоровье', icon: 'heart-pulse', slot: 6 },
      { id: 'fun', name: 'Развлечения', icon: 'ticket', slot: 7 },
      { id: 'clothes', name: 'Одежда', icon: 'shirt', slot: 8 },
      { id: 'gifts', name: 'Подарки', icon: 'gift', slot: 0 },
      { id: 'other', name: 'Другое', icon: 'ellipsis', slot: 0 }
    ],
    income: [
      { id: 'salary', name: 'Зарплата', icon: 'briefcase', slot: 0 },
      { id: 'side', name: 'Подработка', icon: 'laptop', slot: 0 },
      { id: 'cashback', name: 'Кэшбэк', icon: 'badge-percent', slot: 0 },
      { id: 'income-other', name: 'Другое', icon: 'coins', slot: 0 }
    ]
  },

  currencies: [
    { id: 'RUB', symbol: '₽', name: 'Рубль' },
    { id: 'USD', symbol: '$', name: 'Доллар' },
    { id: 'EUR', symbol: '€', name: 'Евро' }
  ],

  /* Демо: суммы в рублях. Генератор раскладывает их по дням текущего
     и двух предыдущих месяцев (до сегодняшнего дня включительно). */
  demo: {
    fixed: [
      { day: 1, type: 'expense', category: 'home', amount: 38000, note: 'Аренда квартиры' },
      { day: 5, type: 'income', category: 'salary', amount: 62000, note: 'Аванс' },
      { day: 20, type: 'income', category: 'salary', amount: 58000, note: 'Зарплата' },
      { day: 3, type: 'income', category: 'cashback', amount: 1340, note: 'Кэшбэк по карте' },
      { day: 10, type: 'expense', category: 'home', amount: 5870, note: 'Коммунальные услуги' },
      { day: 7, type: 'expense', category: 'phone', amount: 650, note: 'Мобильная связь' },
      { day: 12, type: 'expense', category: 'phone', amount: 750, note: 'Домашний интернет' },
      { day: 14, type: 'expense', category: 'fun', amount: 399, note: 'Подписка на музыку' }
    ],
    /* Повторяющиеся траты: сколько раз в месяц и диапазон суммы. */
    random: [
      { type: 'expense', category: 'food', times: 11, min: 480, max: 3400, notes: ['Супермаркет у дома', 'Рынок', 'Доставка продуктов', 'Пекарня', ''] },
      { type: 'expense', category: 'cafe', times: 7, min: 290, max: 1850, notes: ['Кофе с собой', 'Обед с коллегами', 'Ужин в пиццерии', 'Завтрак', ''] },
      { type: 'expense', category: 'transport', times: 9, min: 62, max: 690, notes: ['Метро', 'Такси до дома', 'Каршеринг', 'Электричка', ''] },
      { type: 'expense', category: 'fun', times: 2, min: 600, max: 2400, notes: ['Кино', 'Концерт', 'Боулинг'] },
      { type: 'expense', category: 'health', times: 1, min: 900, max: 3200, notes: ['Аптека', 'Стоматолог'] },
      { type: 'expense', category: 'clothes', times: 1, min: 2400, max: 7900, notes: ['Кроссовки', 'Куртка', 'Футболки'] },
      { type: 'expense', category: 'gifts', times: 1, min: 1500, max: 4200, notes: ['Подарок маме', 'День рождения друга'] },
      { type: 'expense', category: 'other', times: 1, min: 300, max: 1600, notes: ['Хозтовары', 'Ремонт обуви'] }
    ],
    extraIncome: [
      { monthOffset: -1, day: 16, category: 'side', amount: 15000, note: 'Вёрстка лендинга' },
      { monthOffset: 0, day: 9, category: 'side', amount: 8500, note: 'Консультация' }
    ],
    /* Лимиты на месяц, рубли. */
    limits: { food: 22000, cafe: 7000, transport: 4500, fun: 4000, clothes: 6000, home: 45000, health: 5000 }
  }
};
