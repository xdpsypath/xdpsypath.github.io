// Всё содержимое витрины — в этом файле. Замените тексты на свои,
// разметка подтянется автоматически. Пустые поля ("" или []) не отображаются.

window.PORTFOLIO = {
  name: "Иван Иванов",
  role: "Fullstack-разработчик",
  location: "Удалённо",
  status: "Беру проекты",
  tagline:
    "Делаю сайты и веб-приложения под ключ: от продающего лендинга до онлайн-записи с панелью администратора. Аккуратный интерфейс, работа с телефона и понятный код, который легко поддерживать.",

  // Используется в «терминале» на первом экране и в ссылках на код
  handle: "xdpsypath",
  repo: "https://github.com/xdpsypath/xdpsypath.github.io",

  about: [
    "Я fullstack-разработчик. Здесь собраны работы, которые показывают, как я подхожу к задачам заказчика: сначала разбираюсь в бизнесе и пользователях, потом проектирую экраны и только после этого пишу код.",
    "Каждый проект открывается прямо в браузере: можно записаться в барбершоп, собрать корзину в магазине или пройти тест уровня английского. Всё работает на бесплатном хостинге без сервера.",
    "Слежу за доступностью (WCAG 2.2 AA), тёмной темой, скоростью загрузки и мобильной версией. Проверяю интерфейсы автоматическими тестами в браузере.",
  ],

  stats: [
    { value: "8", label: "проектов с живыми демо" },
    { value: "5", label: "веб-приложений без своего сервера" },
    { value: "AA", label: "уровень доступности WCAG 2.2" },
  ],

  contacts: {
    email: "",
    telegram: "",
    github: "https://github.com/xdpsypath",
    linkedin: "",
    resume: "",
  },

  skills: [
    { group: "Интерфейсы", items: ["HTML", "CSS", "JavaScript", "Адаптивная вёрстка", "Дизайн-токены", "SVG-графики"] },
    { group: "Веб-приложения", items: ["SPA без фреймворков", "PWA и офлайн", "IndexedDB", "localStorage", "Дашборды", "Экспорт CSV"] },
    { group: "Качество и публикация", items: ["WCAG 2.2 AA", "Тёмная тема", "Playwright-тесты", "axe-core", "GitHub Pages", "Web3Forms"] },
  ],

  // tags используются для фильтра над списком проектов
  projects: [
    {
      title: "Онлайн-запись в барбершоп",
      summary:
        "Клиент записывается в 4 шага, администратор ведёт расписание мастеров. Свободные слоты считаются с учётом длительности услуг и уже сделанных записей.",
      highlights: [
        "Пошаговая запись: услуги, мастер, время, контакты",
        "Расписание дня по мастерам, перенос и отмена записей",
        "Выгрузка записи в календарь (.ics)",
      ],
      stack: ["JavaScript", "SPA", "localStorage", "SVG"],
      tags: ["app"],
      image: "assets/previews/barbershop.jpg",
      links: { demo: "apps/barbershop/", code: "apps/barbershop" },
    },
    {
      title: "Интернет-магазин кофе",
      summary:
        "Каталог обжарочной с фильтрами и поиском по вкусам, корзиной, промокодом и оформлением заказа в 4 шага. Упаковки товаров нарисованы в SVG.",
      highlights: [
        "Фильтры сохраняются в ссылке",
        "Остатки на складе ограничивают количество",
        "История заказов и повтор заказа",
      ],
      stack: ["JavaScript", "SPA", "SVG", "localStorage"],
      tags: ["app"],
      image: "assets/previews/shop.jpg",
      links: { demo: "apps/shop/", code: "apps/shop" },
    },
    {
      title: "Дашборд сети кофеен",
      summary:
        "Аналитика продаж пяти кофеен: выручка, чеки, доли точек, тепловая карта посещаемости по часам и таблица позиций меню.",
      highlights: [
        "Графики на SVG без библиотек",
        "Сравнение с прошлым периодом",
        "Выгрузка выборки в CSV",
      ],
      stack: ["JavaScript", "SVG", "Dataviz"],
      tags: ["app"],
      image: "assets/previews/dashboard.jpg",
      links: { demo: "apps/dashboard/", code: "apps/dashboard" },
    },
    {
      title: "Трекер бюджета «Копилка»",
      summary:
        "Приложение для телефона: устанавливается на главный экран и работает без интернета. Запись траты за три касания, лимиты по категориям.",
      highlights: [
        "PWA: service worker и манифест",
        "Данные в IndexedDB на устройстве",
        "Экспорт и импорт JSON",
      ],
      stack: ["PWA", "IndexedDB", "JavaScript", "SVG"],
      tags: ["app"],
      image: "assets/previews/budget.jpg",
      links: { demo: "apps/budget/?demo", code: "apps/budget" },
    },
    {
      title: "Сайт траттории",
      summary:
        "Четыре страницы: главная, меню, бронь стола и контакты. Меню хранится в одном файле, владелец меняет блюда без программиста.",
      highlights: [
        "Поиск по составу и фильтры меню",
        "Бронь с правилами зала и веранды",
        "Заявки на почту через Web3Forms",
      ],
      stack: ["HTML", "CSS", "JavaScript"],
      tags: ["site"],
      image: "assets/previews/restaurant.jpg",
      links: { demo: "apps/restaurant/", code: "apps/restaurant" },
    },
    {
      title: "Лендинг строительной компании",
      summary:
        "Частные дома под ключ по фиксированной смете. Калькулятор стоимости, этапы стройки со сменой фото и запись на экскурсию на объект.",
      highlights: ["Калькулятор стоимости дома", "Этапы стройки с фото"],
      stack: ["HTML", "CSS", "JavaScript"],
      tags: ["landing"],
      image: "assets/previews/construction.jpg",
      links: { demo: "landings/construction/", code: "landings/construction" },
    },
    {
      title: "Лендинг школы английского",
      summary:
        "Онлайн-школа разговорного английского: тест уровня из пяти вопросов, тарифы с оплатой помесячно или за три месяца, запись на пробный урок.",
      highlights: ["Тест уровня с рекомендацией группы", "Тарифы и форма записи"],
      stack: ["HTML", "CSS", "JavaScript"],
      tags: ["landing"],
      image: "assets/previews/english-school.jpg",
      links: { demo: "landings/english-school/", code: "landings/english-school" },
    },
    {
      title: "Лендинг автосалона",
      summary:
        "Премиальные автомобили с пробегом: каталог с фильтрами, карточка автомобиля в модальном окне и кредитный калькулятор.",
      highlights: ["Каталог и быстрый подбор", "Кредитный калькулятор"],
      stack: ["HTML", "CSS", "JavaScript"],
      tags: ["landing"],
      image: "assets/previews/autosalon.jpg",
      links: { demo: "landings/autosalon/", code: "landings/autosalon" },
    },
  ],

  // Опыт работы. Пустой список скрывает раздел и пункт меню.
  experience: [],
};
