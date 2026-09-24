(function () {
  "use strict";

  document.documentElement.classList.add("js");

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Шапка и мобильное меню ---------- */

  const header = $("#header");
  const nav = $("#nav");
  const toggle = $("#nav-toggle");

  const onScroll = () => header.classList.toggle("is-scrolled", window.scrollY > 8);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  function setMenu(open) {
    nav.classList.toggle("is-open", open);
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

  // Подсветка текущего раздела
  const navLinks = $$("a[href^='#']", nav);
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

  /* ---------- Этапы: смена фото ---------- */

  const stages = $$(".stage");
  const stageImg = $("#stage-img");

  function activateStage(stage) {
    if (stage.classList.contains("is-active")) return;
    stages.forEach((s) => {
      const active = s === stage;
      s.classList.toggle("is-active", active);
      $(".stage__btn", s).setAttribute("aria-pressed", String(active));
    });

    const swap = () => {
      stageImg.src = stage.dataset.img;
      stageImg.alt = stage.dataset.alt;
      stageImg.classList.remove("is-swapping");
    };

    if (reduceMotion) {
      swap();
    } else {
      stageImg.classList.add("is-swapping");
      setTimeout(swap, 180);
    }
  }

  stages.forEach((stage) => {
    const btn = $(".stage__btn", stage);
    btn.addEventListener("click", () => activateStage(stage));
    btn.addEventListener("mouseenter", () => activateStage(stage));
    btn.addEventListener("focus", () => activateStage(stage));
  });

  // Предзагрузка фото этапов, чтобы смена была мгновенной
  window.addEventListener("load", () => {
    stages.forEach((s) => {
      const img = new Image();
      img.src = s.dataset.img;
    });
  });

  /* ---------- Калькулятор ---------- */

  const calc = $("#calc-form");
  const area = $("#area");

  // Базовая цена за м² для газобетона, ₽
  const BASE_PRICE = { shell: 32000, warm: 48000, turnkey: 78000 };
  const MATERIAL = { gas: 1, brick: 1.18, frame: 0.88 };
  const MATERIAL_SPEED = { gas: 1, brick: 1.2, frame: 0.8 };
  const LEVEL_NAME = { shell: "коробка", warm: "тёплый контур", turnkey: "под ключ" };
  const MATERIAL_NAME = { gas: "газобетон", brick: "кирпич", frame: "каркас" };

  // Что входит в каждую комплектацию: последний индекс включённых пунктов
  const INCLUDES = [
    "Проект, геология и смета",
    "Фундамент, стены, перекрытия, кровля",
    "Окна, входная дверь, утеплённый фасад",
    "Электрика, отопление, вода и канализация",
    "Чистовая отделка и сантехника",
  ];
  const INCLUDED_UP_TO = { shell: 1, warm: 2, turnkey: 4 };
  const includesList = $("#calc-includes");

  const nf = new Intl.NumberFormat("ru-RU");
  const millions = (rub) =>
    (rub / 1e6).toLocaleString("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " млн ₽";

  function plural(n, one, few, many) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
    return many;
  }

  function months(sqm, level, material) {
    const base = { shell: 2 + sqm / 80, warm: 3 + sqm / 60, turnkey: 4 + sqm / 50 }[level];
    return Math.max(2, Math.round(base * MATERIAL_SPEED[material]));
  }

  function updateCalc() {
    const data = new FormData(calc);
    const sqm = Number(data.get("area"));
    const floors = data.get("floors");
    const material = data.get("material");
    const level = data.get("level");

    // Двухэтажный дом дешевле на м²: меньше фундамента и кровли
    const floorFactor = floors === "2" ? 0.95 : 1;
    const perSqm = Math.round((BASE_PRICE[level] * MATERIAL[material] * floorFactor) / 500) * 500;
    const total = perSqm * sqm;
    const time = months(sqm, level, material);

    $("#area-out").textContent = sqm + " м²";
    area.style.setProperty("--fill", ((sqm - area.min) / (area.max - area.min)) * 100 + "%");
    $("#calc-price").textContent = millions(total);
    $("#calc-range").textContent = `от ${millions(total * 0.95)} до ${millions(total * 1.05)}`.replace(" млн ₽ до", " до");
    $("#calc-sqm").textContent = nf.format(perSqm) + " ₽";
    $("#calc-time").textContent = time + " " + plural(time, "месяц", "месяца", "месяцев");

    includesList.innerHTML = INCLUDES.map((item, i) => {
      const on = i <= INCLUDED_UP_TO[level];
      return `<li class="${on ? "" : "is-off"}"><svg class="icon" aria-hidden="true"><use href="#${on ? "i-check" : "i-x"}"/></svg><span>${item}<span class="visually-hidden">${on ? "" : ", не входит"}</span></span></li>`;
    }).join("");

    $("#estimate").value = `${sqm} м², ${floors} эт., ${MATERIAL_NAME[material]}, ${LEVEL_NAME[level]}: ${millions(total)}`;
  }

  calc.addEventListener("input", updateCalc);
  calc.addEventListener("submit", (e) => e.preventDefault());
  updateCalc();

  /* ---------- Форма записи ---------- */

  const form = $("#visit-form");
  const submit = $("#visit-submit");
  const success = $("#visit-success");

  const validators = {
    name: (v) => v.trim().length >= 2,
    phone: (v) => v.replace(/\D/g, "").length === 11,
  };

  function setError(input, invalid) {
    const error = document.getElementById(input.id + "-error");
    input.setAttribute("aria-invalid", String(invalid));
    error.hidden = !invalid;
  }

  Object.keys(validators).forEach((name) => {
    const input = form.elements[name];
    // Ошибку показываем после ухода из поля, а убираем сразу после исправления
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

    // Демо: имитация запроса к серверу
    setTimeout(() => {
      submit.removeAttribute("aria-busy");
      success.hidden = false;
      success.focus();
    }, 1200);
  });

  /* ---------- Появление блоков ---------- */

  const revealTargets = $$(".section-head, .stages, .bento > *, .calc, .faq__list, .form, .band__list li, .facts > div");
  if (!reduceMotion && "IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const el = entry.target;
          el.classList.add("is-visible");
          io.unobserve(el);
          // После появления возвращаем элементу его собственные переходы (hover и т.д.)
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
      { rootMargin: "0px 0px -10% 0px" }
    );
    revealTargets.forEach((el, i) => {
      el.classList.add("reveal");
      // Небольшая лесенка внутри групп
      const siblings = [...el.parentElement.children];
      el.style.transitionDelay = Math.min(siblings.indexOf(el), 4) * 60 + "ms";
      io.observe(el);
    });
  }
})();
