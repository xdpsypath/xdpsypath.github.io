(function () {
  "use strict";

  const root = document.documentElement;
  root.classList.add("js");

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const nf = new Intl.NumberFormat("ru-RU");
  const rub = (n) => nf.format(Math.round(n)) + " ₽";

  /* ---------- Данные ---------- */

  const BODY_NAME = { coupe: "Купе", sedan: "Седан", cabrio: "Кабриолет" };

  const CARS = [
    {
      id: "mercedes-300sl",
      make: "Mercedes-Benz",
      model: "300 SL Roadster",
      year: 1961,
      km: 58000,
      engine: "3.0 л, бензин",
      power: 215,
      drive: "Задний",
      gearbox: "Механика",
      body: "cabrio",
      classic: true,
      price: 0,
      badge: "Коллекционный экземпляр",
      img: "img/classic-roadster.jpg",
      alt: "Чёрный классический родстер Mercedes-Benz 300 SL в профиль",
      note: "Полная реставрация в 2019 году, сертификат подлинности узлов, два владельца за последние 30 лет.",
      featured: 1,
    },
    {
      id: "porsche-911",
      make: "Porsche",
      model: "911 Carrera S",
      year: 2017,
      km: 38400,
      engine: "3.0 л, бензин",
      power: 420,
      drive: "Задний",
      gearbox: "Робот PDK",
      body: "coupe",
      price: 11900000,
      badge: "Один владелец",
      img: "img/sport-grey.webp",
      alt: "Серый Porsche 911 у современного здания",
      note: "Обслуживался только у официального дилера, пакет Sport Chrono, керамическое покрытие кузова.",
      featured: 2,
    },
    {
      id: "mercedes-s500",
      make: "Mercedes-Benz",
      model: "S 500 4MATIC",
      year: 2019,
      km: 54200,
      engine: "4.0 л, бензин",
      power: 469,
      drive: "Полный",
      gearbox: "Автомат",
      body: "sedan",
      price: 9400000,
      badge: "Новое поступление",
      img: "img/sedan-forest.webp",
      alt: "Чёрный седан Mercedes-Benz S-класса на лесной дороге",
      note: "Задние массажные кресла, пакет Executive, ночное видение. Пробег подтверждён по дилерской базе.",
      featured: 3,
    },
    {
      id: "bentley",
      make: "Bentley",
      model: "Continental GT",
      year: 2012,
      km: 61000,
      engine: "6.0 л W12, бензин",
      power: 575,
      drive: "Полный",
      gearbox: "Автомат",
      body: "coupe",
      price: 6900000,
      badge: "В кадре на главной",
      img: "img/coupe-studio.webp",
      alt: "Тёмное купе Bentley Continental GT в студийном свете",
      note: "Свежее ТО на 60 000 км с заменой свечей и катушек. Салон без износа, оригинальная краска по кругу.",
      featured: 4,
    },
    {
      id: "aston",
      make: "Aston Martin",
      model: "Vanquish Volante",
      year: 2015,
      km: 29000,
      engine: "6.0 л V12, бензин",
      power: 576,
      drive: "Задний",
      gearbox: "Автомат",
      body: "cabrio",
      price: 13500000,
      badge: "Малый пробег",
      img: "img/convertible-white.jpg",
      alt: "Белый кабриолет Aston Martin Vanquish Volante у парка",
      note: "Хранился в тёплом боксе, эксплуатировался только летом. Карбоновый пакет экстерьера.",
      featured: 5,
    },
    {
      id: "bmw-m235i",
      make: "BMW",
      model: "M235i Coupe",
      year: 2016,
      km: 72000,
      engine: "3.0 л, бензин",
      power: 326,
      drive: "Задний",
      gearbox: "Автомат",
      body: "coupe",
      price: 3450000,
      badge: "Два цвета в наличии",
      img: "img/showroom.webp",
      alt: "Красное и синее купе BMW 2 серии у здания с бетонными стенами",
      note: "В наличии красный и синий автомобили в одинаковой комплектации. Спортивный выхлоп M Performance.",
      featured: 6,
    },
    {
      id: "huracan",
      make: "Lamborghini",
      model: "Huracán LP 610-4",
      year: 2016,
      km: 18500,
      engine: "5.2 л V10, бензин",
      power: 610,
      drive: "Полный",
      gearbox: "Робот",
      body: "coupe",
      price: 21800000,
      badge: "Гарантия 24 месяца",
      img: "img/sport-blue.jpg",
      alt: "Синий Lamborghini Huracán с красными тормозными суппортами крупным планом",
      note: "Карбон-керамические тормоза, система подъёма носа, полная история обслуживания в Германии.",
      featured: 7,
    },
  ];

  /* ---------- Кредит: общая формула ---------- */

  // Ставка зависит от первого взноса: чем больше взнос, тем ниже ставка
  function rateFor(downPct) {
    if (downPct >= 50) return 9.9;
    if (downPct >= 30) return 11.9;
    return 13.9;
  }

  function monthlyPayment(principal, annualRate, months) {
    const r = annualRate / 100 / 12;
    return (principal * r) / (1 - Math.pow(1 + r, -months));
  }

  const fromPerMonth = (price) => monthlyPayment(price * 0.7, rateFor(30), 60);

  /* ---------- Шапка и меню ---------- */

  const header = $("#header");
  const nav = $("#nav");
  const toggle = $("#nav-toggle");

  const onScroll = () => header.classList.toggle("is-scrolled", window.scrollY > 24);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  function setMenu(open) {
    nav.classList.toggle("is-open", open);
    header.classList.toggle("menu-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Закрыть меню" : "Открыть меню");
    $("use", toggle).setAttribute("href", open ? "#i-x" : "#i-menu");
  }

  toggle.addEventListener("click", () => setMenu(!nav.classList.contains("is-open")));
  nav.addEventListener("click", (e) => {
    if (e.target.closest("a")) setMenu(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && nav.classList.contains("is-open")) {
      setMenu(false);
      toggle.focus();
    }
  });

  const navLinks = $$("a", nav);
  const spy = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        navLinks.forEach((a) => a.classList.toggle("is-active", a.hash === "#" + entry.target.id));
      });
    },
    { rootMargin: "-45% 0px -50% 0px" }
  );
  $$("main section[id]").forEach((s) => spy.observe(s));

  /* ---------- Каталог ---------- */

  const grid = $("#catalog-grid");
  const empty = $("#catalog-empty");
  const status = $("#catalog-status");
  const filterButtons = $$(".filter");
  const sortSelect = $("#sort");

  const state = { body: "all", budget: 0, sort: "featured" };

  const matches = (car, body, budget) => {
    const bodyOk = body === "all" || (body === "classic" ? car.classic : car.body === body);
    const budgetOk = !budget || (car.price > 0 && car.price <= budget);
    return bodyOk && budgetOk;
  };

  const SORTERS = {
    featured: (a, b) => a.featured - b.featured,
    "price-asc": (a, b) => (a.price || Infinity) - (b.price || Infinity),
    "price-desc": (a, b) => (b.price || Infinity) - (a.price || Infinity),
    "year-desc": (a, b) => b.year - a.year,
  };

  function priceLabel(car) {
    return car.price ? rub(car.price) : "Цена по запросу";
  }

  function carCard(car, isFeatured) {
    const credit = car.price
      ? `<p class="car__credit">в кредит от ${rub(fromPerMonth(car.price))}/мес</p>`
      : `<p class="car__credit">показ по предварительной записи</p>`;
    return `
      <article class="car${isFeatured ? " car--featured" : ""}" id="car-${car.id}">
        <div class="car__media">
          <img src="${car.img}" alt="${car.alt}" loading="lazy" width="1024" height="683" />
          <span class="car__badge">${car.badge}</span>
        </div>
        <div class="car__body">
          <h3 class="car__name">${car.make} ${car.model}<small>${car.classic ? "Классика" : BODY_NAME[car.body]}, ${car.drive.toLowerCase()} привод</small></h3>
          <ul class="car__specs">
            <li><svg class="icon" aria-hidden="true"><use href="#i-calendar"/></svg>${car.year}</li>
            <li><svg class="icon" aria-hidden="true"><use href="#i-gauge"/></svg>${nf.format(car.km)} км</li>
            <li><svg class="icon" aria-hidden="true"><use href="#i-zap"/></svg>${car.power} л.с.</li>
          </ul>
          <div class="car__foot">
            <div>
              <p class="car__price">${priceLabel(car)}</p>
              ${credit}
            </div>
            <button class="car__more" type="button" data-car="${car.id}" aria-haspopup="dialog">
              Подробнее<span class="visually-hidden">: ${car.make} ${car.model}</span>
              <svg class="icon" aria-hidden="true"><use href="#i-arrow-right"/></svg>
            </button>
          </div>
        </div>
      </article>`;
  }

  function plural(n, one, few, many) {
    const m10 = n % 10;
    const m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }

  function renderCatalog() {
    const list = CARS.filter((c) => matches(c, state.body, state.budget)).sort(SORTERS[state.sort]);
    // Ведущая карточка только при сортировке «Рекомендуем» и полном списке
    const featuredId = state.sort === "featured" && state.body === "all" && !state.budget ? list[0]?.id : null;

    grid.innerHTML =
      list.map((car) => carCard(car, car.id === featuredId)).join("") +
      (list.length
        ? `<article class="car-order" id="car-order">
            <h3 class="car-order__title">Не нашли свой автомобиль?</h3>
            <p>Привезём под заказ из Европы, ОАЭ или Кореи за 4-8 недель. Та же проверка по 140 пунктам до покупки.</p>
            <a class="btn btn--secondary" href="#visit" data-goal-order>Оставить запрос</a>
          </article>`
        : "");
    fitOrderTile(featuredId ? list.length + 1 : list.length);
    grid.hidden = list.length === 0;
    empty.hidden = list.length !== 0;

    const parts = [`${list.length} ${plural(list.length, "автомобиль", "автомобиля", "автомобилей")}`];
    if (state.budget) parts.push(`бюджет до ${nf.format(state.budget / 1e6)} млн ₽`);
    status.innerHTML =
      `<span>Показано: ${parts.join(", ")}</span>` +
      (state.budget ? '<button class="link-btn" type="button" id="clear-budget">Убрать ограничение бюджета</button>' : "");
    revealItems($$(".car", grid));
  }

  // Плитка «под заказ» растягивается на остаток ряда, чтобы в сетке не было пустых ячеек
  let usedSlots = 0;
  function fitOrderTile(slots) {
    if (slots !== undefined) usedSlots = slots;
    const tile = $("#car-order");
    if (!tile) return;
    const cols = getComputedStyle(grid).gridTemplateColumns.split(" ").length;
    const rest = usedSlots % cols;
    tile.style.gridColumn = `span ${rest === 0 ? cols : cols - rest}`;
  }
  window.addEventListener("resize", () => fitOrderTile());

  grid.addEventListener("click", (e) => {
    if (e.target.closest("[data-goal-order]")) $("#v-car").value = "order";
  });

  filterButtons.forEach((btn) =>
    btn.addEventListener("click", () => {
      state.body = btn.dataset.body;
      filterButtons.forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
      renderCatalog();
    })
  );

  sortSelect.addEventListener("change", () => {
    state.sort = sortSelect.value;
    renderCatalog();
  });

  status.addEventListener("click", (e) => {
    if (e.target.id !== "clear-budget") return;
    state.budget = 0;
    $("#finder-budget").value = "0";
    updateFinderCount();
    renderCatalog();
    grid.querySelector(".car__more")?.focus();
  });

  $("#reset-filters").addEventListener("click", () => {
    state.body = "all";
    state.budget = 0;
    filterButtons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.body === "all")));
    $("#finder-body").value = "all";
    $("#finder-budget").value = "0";
    updateFinderCount();
    renderCatalog();
    grid.querySelector(".car__more")?.focus();
  });

  /* ---------- Быстрый подбор в первом экране ---------- */

  const finder = $("#finder");

  function updateFinderCount() {
    const body = $("#finder-body").value;
    const budget = Number($("#finder-budget").value);
    const n = CARS.filter((c) => matches(c, body, budget)).length;
    $(".btn__label", $("#finder-submit")).textContent =
      n === 0 ? "Оставить запрос на подбор" : `Показать ${n} ${plural(n, "автомобиль", "автомобиля", "автомобилей")}`;
  }

  finder.addEventListener("change", updateFinderCount);
  finder.addEventListener("submit", (e) => {
    e.preventDefault();
    state.body = $("#finder-body").value;
    state.budget = Number($("#finder-budget").value);
    filterButtons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.body === state.body)));
    renderCatalog();
    $("#catalog").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
  });

  /* ---------- Карточка автомобиля в модальном окне ---------- */

  const modal = $("#car-modal");
  let lastTrigger = null;
  let modalCar = null;

  function openModal(car, trigger) {
    modalCar = car;
    lastTrigger = trigger;
    $("#modal-img").src = car.img;
    $("#modal-img").alt = car.alt;
    $("#modal-badge").textContent = car.badge;
    $("#modal-title").textContent = `${car.make} ${car.model}`;
    $("#modal-price").innerHTML = car.price
      ? `${rub(car.price)}<small>или от ${rub(fromPerMonth(car.price))} в месяц при взносе 30% на 5 лет</small>`
      : `Цена по запросу<small>Показ и документы по предварительной записи</small>`;
    const specs = [
      ["Год выпуска", car.year],
      ["Пробег", nf.format(car.km) + " км"],
      ["Двигатель", car.engine],
      ["Мощность", car.power + " л.с."],
      ["Привод", car.drive],
      ["Коробка", car.gearbox],
    ];
    $("#modal-specs").innerHTML = specs.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");
    $("#modal-checks").innerHTML = [car.note, "Пройдена проверка по 140 пунктам, отчёт доступен до покупки", "Юридически чист: без залогов и ограничений"]
      .map((t) => `<li><svg class="icon" aria-hidden="true"><use href="#i-check"/></svg><span>${t}</span></li>`)
      .join("");
    $("#modal-credit").hidden = !car.price;

    document.body.classList.add("modal-open");
    modal.showModal();
    $("#modal-close").focus();
  }

  function closeModal(then) {
    const finish = () => {
      modal.classList.remove("is-closing");
      modal.close();
    };
    // Действие после закрытия выполняем явно, а фокус возвращаем только при обычном закрытии
    modal._after = then || null;
    if (reduceMotion) {
      finish();
    } else {
      modal.classList.add("is-closing");
      setTimeout(finish, 160);
    }
  }

  modal.addEventListener("close", () => {
    document.body.classList.remove("modal-open");
    if (modal._after) {
      const fn = modal._after;
      modal._after = null;
      fn();
    } else if (lastTrigger && document.contains(lastTrigger)) {
      lastTrigger.focus();
    }
  });

  // Escape: анимируем закрытие вместо мгновенного
  modal.addEventListener("cancel", (e) => {
    e.preventDefault();
    closeModal();
  });

  // Клик по подложке закрывает окно
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  $("#modal-close").addEventListener("click", () => closeModal());

  grid.addEventListener("click", (e) => {
    const card = e.target.closest(".car");
    if (!card || !grid.contains(card)) return;
    const btn = $(".car__more", card);
    const car = CARS.find((c) => c.id === btn.dataset.car);
    openModal(car, btn);
  });

  $("#modal-cta").addEventListener("click", () => {
    const car = modalCar;
    closeModal(() => {
      $("#v-car").value = car.id;
      $("#visit").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
      $("#v-name").focus({ preventScroll: true });
    });
  });

  $("#modal-credit").addEventListener("click", () => {
    const car = modalCar;
    closeModal(() => {
      $("#credit-car").value = car.id;
      updateCredit();
      $("#credit").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
      $("#credit-car").focus({ preventScroll: true });
    });
  });

  /* ---------- Кредитный калькулятор ---------- */

  const creditForm = $("#credit-form");
  const creditCar = $("#credit-car");
  const down = $("#credit-down");
  const buyable = CARS.filter((c) => c.price).sort((a, b) => a.price - b.price);

  creditCar.innerHTML = buyable
    .map((c) => `<option value="${c.id}">${c.make} ${c.model}, ${rub(c.price)}</option>`)
    .join("");
  creditCar.value = "mercedes-s500";

  function updateCredit() {
    const car = CARS.find((c) => c.id === creditCar.value);
    const downPct = Number(down.value);
    const months = Number(new FormData(creditForm).get("term"));
    const rate = rateFor(downPct);
    const principal = car.price * (1 - downPct / 100);
    const pay = monthlyPayment(principal, rate, months);

    $("#credit-down-out").textContent = `${downPct}% · ${rub(car.price * (downPct / 100))}`;
    down.style.setProperty("--fill", ((downPct - down.min) / (down.max - down.min)) * 100 + "%");
    $("#credit-payment").textContent = rub(pay);
    $("#credit-rate").textContent = rate.toLocaleString("ru-RU") + "%";
    $("#credit-sum").textContent = rub(principal);
    $("#credit-over").textContent = rub(pay * months - principal);
  }

  creditForm.addEventListener("input", updateCredit);
  creditForm.addEventListener("submit", (e) => e.preventDefault());
  updateCredit();

  /* ---------- Запись на тест-драйв ---------- */

  const form = $("#visit-form");
  const submit = $("#visit-submit");
  const carSelect = $("#v-car");
  const dateInput = $("#v-date");

  carSelect.innerHTML =
    `<option value="any">Осмотр без конкретной модели</option>` +
    `<option value="tradein">Оценка моего автомобиля (трейд-ин)</option>` +
    `<option value="order">Подбор автомобиля под заказ</option>` +
    CARS.map((c) => `<option value="${c.id}">Тест-драйв: ${c.make} ${c.model}, ${c.year}</option>`).join("");

  $$("[data-goal]").forEach((link) => link.addEventListener("click", () => (carSelect.value = "tradein")));

  // Дата в локальном времени: toISOString() дал бы UTC и мог сдвинуть день
  const pad = (n) => String(n).padStart(2, "0");
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  dateInput.min = iso(tomorrow);
  dateInput.value = iso(tomorrow);

  const validators = {
    name: (v) => v.trim().length >= 2,
    phone: (v) => v.replace(/\D/g, "").length === 11,
    date: (v) => Boolean(v) && v >= dateInput.min,
  };

  function setError(input, invalid) {
    input.setAttribute("aria-invalid", String(invalid));
    document.getElementById(input.id + "-error").hidden = !invalid;
  }

  Object.keys(validators).forEach((name) => {
    const input = form.elements[name];
    input.addEventListener("blur", () => {
      if (input.value) setError(input, !validators[name](input.value));
    });
    input.addEventListener("input", () => {
      if (input.getAttribute("aria-invalid") === "true" && validators[name](input.value)) setError(input, false);
    });
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    let firstInvalid = null;
    Object.keys(validators).forEach((name) => {
      const input = form.elements[name];
      const invalid = !validators[name](input.value);
      setError(input, invalid);
      if (invalid && !firstInvalid) firstInvalid = input;
    });
    if (firstInvalid) {
      firstInvalid.focus();
      return;
    }

    submit.setAttribute("aria-busy", "true");
    $(".btn__label", submit).textContent = "Отправляем";

    const date = new Date(dateInput.value + "T00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
    // Демо: имитация запроса к серверу
    setTimeout(() => {
      submit.removeAttribute("aria-busy");
      $("#visit-success-text").textContent = `Ждём вас ${date}. Менеджер перезвонит в течение 20 минут, чтобы подтвердить время.`;
      const success = $("#visit-success");
      success.hidden = false;
      success.focus();
    }, 1200);
  });

  /* ---------- Появление блоков ---------- */

  let io = null;
  if (!reduceMotion && "IntersectionObserver" in window) {
    io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const el = entry.target;
          el.classList.add("is-visible");
          io.unobserve(el);
          el.addEventListener(
            "transitionend",
            () => {
              el.classList.remove("reveal", "is-visible");
              el.style.transitionDelay = "";
            },
            { once: true }
          );
        });
      },
      { rootMargin: "0px 0px -8% 0px" }
    );
  }

  function revealItems(items) {
    if (!io) return;
    items.forEach((el, i) => {
      el.classList.add("reveal");
      el.style.transitionDelay = Math.min(i % 3, 3) * 70 + "ms";
      io.observe(el);
    });
  }

  renderCatalog();
  updateFinderCount();
  revealItems($$(".catalog__head, .stats__grid > div, .inspection__panel, .calc, .credit__copy, .tradein__inner, .visit__copy, .form"));
})();
