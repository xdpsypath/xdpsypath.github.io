/* Клиентская запись: мастер-визард в 4 шага, подтверждение, «Мои записи» */
(function () {
  "use strict";

  const S = window.Store;
  const U = window.UI;
  const D = window.APP_DATA;
  const { $, $$, esc, icon } = U;

  const STEPS = [
    { n: 1, label: "Услуги", title: "Что делаем?", lead: "Можно выбрать несколько услуг: время и сумма пересчитаются сразу." },
    { n: 2, label: "Мастер", title: "К кому записать?", lead: "У каждого мастера своё кресло и своё расписание. Выберите мастера или доверьтесь нам." },
    { n: 3, label: "Время", title: "Когда удобно?", lead: "Показываем только время, в которое помещаются все выбранные услуги." },
    { n: 4, label: "Контакты", title: "Как с вами связаться?", lead: "Имя и телефон нужны, чтобы подтвердить запись и напомнить о визите." }
  ];

  const fresh = () => ({
    step: 1,
    services: [],
    master: null,
    date: null,
    start: null,
    assigned: null,
    name: "",
    phone: "",
    comment: "",
    remind: true,
    tried: {}
  });
  let st = fresh();

  const main = () => $("#main");

  /* ---------- Вычисления по состоянию ---------- */
  function effectiveMaster() {
    if (st.master === "any") return st.assigned;
    return st.master;
  }
  function currentTotals() {
    return S.totals(st.services, effectiveMaster() || (st.master !== "any" ? st.master : null));
  }
  function stepValid(n) {
    if (n >= 1 && !st.services.length) return 1;
    if (n >= 2 && !st.master) return 2;
    if (n >= 3 && (!st.date || st.start == null)) return 3;
    return 0;
  }
  const hintFor = (n) =>
    ({
      1: "Выберите хотя бы одну услугу",
      2: "Выберите мастера или вариант «Любой свободный»",
      3: "Выберите дату и время",
      4: ""
    })[n];

  /* ---------- Каркас визарда ---------- */
  function progressHtml() {
    return (
      '<nav class="progress" aria-label="Шаги записи"><ol class="progress__list">' +
      STEPS.map((s) => {
        const done = s.n < st.step;
        const cur = s.n === st.step;
        const mark = done ? icon("check") : '<span class="num">' + s.n + "</span>";
        const inner = '<span class="progress__dot" aria-hidden="true">' + mark + '</span><span class="progress__label">' + s.label + "</span>";
        const cls = "progress__item" + (done ? " is-done" : "") + (cur ? " is-current" : "");
        if (done)
          return '<li class="' + cls + '"><button class="progress__btn" type="button" data-goto="' + s.n + '" aria-label="Шаг ' + s.n + ": " + s.label + ', изменить">' + inner + "</button></li>";
        return '<li class="' + cls + '"><span class="progress__btn"' + (cur ? ' aria-current="step"' : "") + ">" + inner + '<span class="sr-only">' + (cur ? ", текущий шаг" : ", впереди") + "</span></span></li>";
      }).join("") +
      "</ol></nav>"
    );
  }

  function summaryHtml() {
    const last = st.step === 4;
    return (
      '<aside class="summary" aria-label="Ваша запись">' +
      '<div class="summary__card">' +
      '<p class="summary__title">Ваша запись</p>' +
      '<dl class="summary__list">' +
      '<div><dt>Услуги</dt><dd id="sum-services"></dd></div>' +
      '<div><dt>Мастер</dt><dd id="sum-master"></dd></div>' +
      '<div><dt>Когда</dt><dd id="sum-when"></dd></div>' +
      '<div><dt>Длительность</dt><dd id="sum-dur" class="num"></dd></div>' +
      "</dl>" +
      '<div class="summary__total"><span>Итого</span><strong id="sum-price" class="num"></strong></div>' +
      '<p class="summary__note">Оплата после визита, картой или наличными.</p>' +
      "</div>" +
      '<div class="wizard-nav">' +
      '<button class="btn btn--secondary wizard-nav__back" type="button" id="w-back"' + (st.step === 1 ? " hidden" : "") + ">" + icon("arrow-left") + '<span class="wizard-nav__back-label">Назад</span></button>' +
      '<p class="wizard-nav__total" aria-hidden="true"><strong id="bar-price" class="num"></strong><span id="bar-dur" class="num"></span></p>' +
      (last
        ? '<button class="btn btn--primary wizard-nav__next" type="submit" form="contact-form" id="w-next"><span>Записаться</span>' + icon("check") + "</button>"
        : '<button class="btn btn--primary wizard-nav__next" type="button" id="w-next"><span>Далее</span>' + icon("arrow-right") + "</button>") +
      "</div>" +
      '<p class="wizard-nav__hint" id="w-hint" aria-live="polite"></p>' +
      "</aside>"
    );
  }

  function renderWizard(focus) {
    const s = STEPS[st.step - 1];
    main().innerHTML =
      '<section class="wizard container" aria-labelledby="step-title">' +
      progressHtml() +
      '<div class="wizard__grid">' +
      '<div class="wizard__body">' +
      '<p class="kicker">Шаг ' + s.n + " из 4</p>" +
      '<h1 class="step-title" id="step-title" tabindex="-1">' + s.title + "</h1>" +
      '<p class="step-lead">' + s.lead + "</p>" +
      '<div class="step" id="step-body"></div>' +
      "</div>" +
      summaryHtml() +
      "</div>" +
      "</section>";
    document.title = s.label + ". Запись в барбершоп «Сталь»";
    const body = $("#step-body");
    ({ 1: stepServices, 2: stepMaster, 3: stepTime, 4: stepContacts })[st.step](body);
    bindNav();
    updateSummary();
    if (focus) $("#step-title").focus({ preventScroll: true });
    if (focus) window.scrollTo({ top: 0, behavior: U.reduceMotion() ? "auto" : "smooth" });
  }

  function bindNav() {
    $$(".progress [data-goto]").forEach((b) =>
      b.addEventListener("click", () => {
        st.step = Number(b.dataset.goto);
        renderWizard(true);
      })
    );
    const back = $("#w-back");
    if (back)
      back.addEventListener("click", () => {
        if (st.step > 1) {
          st.step -= 1;
          renderWizard(true);
        }
      });
    const next = $("#w-next");
    if (st.step < 4)
      next.addEventListener("click", () => {
        const bad = stepValid(st.step);
        if (bad) {
          st.tried[st.step] = true;
          updateSummary();
          const first = $("#step-body input:not([disabled])");
          if (first) first.focus();
          return;
        }
        st.step += 1;
        renderWizard(true);
      });
  }

  function updateSummary() {
    const t = currentTotals();
    const names = t.list.map((x) => x.name);
    const sumServices = $("#sum-services");
    if (!sumServices) return;
    sumServices.innerHTML = names.length ? names.map(esc).join("<br>") : '<span class="muted">Не выбраны</span>';
    let masterText = '<span class="muted">Не выбран</span>';
    if (st.master === "any") {
      masterText = st.assigned ? esc(S.masterById(st.assigned).name) + '<span class="muted"> (подобран)</span>' : "Любой свободный";
    } else if (st.master) {
      const m = S.masterById(st.master);
      masterText = esc(m.name) + (m.top ? ' <span class="tag tag--brass">Топ</span>' : "");
    }
    $("#sum-master").innerHTML = masterText;
    $("#sum-when").innerHTML =
      st.date && st.start != null
        ? '<span class="num">' + S.fmtDate(st.date, { weekday: true }) + ", " + S.fmtTime(st.start) + "-" + S.fmtTime(st.start + t.dur) + "</span>"
        : st.date
        ? S.fmtDate(st.date, { weekday: true }) + '<span class="muted">, время не выбрано</span>'
        : '<span class="muted">Не выбрано</span>';
    $("#sum-dur").textContent = t.dur ? S.fmtDur(t.dur) : "-";
    $("#sum-price").textContent = S.fmtMoney(t.price);
    $("#bar-price").textContent = S.fmtMoney(t.price);
    $("#bar-dur").textContent = t.dur ? S.fmtDur(t.dur) : "Ничего не выбрано";

    const hint = $("#w-hint");
    const bad = stepValid(st.step);
    if (bad && st.step < 4) {
      const tried = st.tried[st.step];
      hint.className = "wizard-nav__hint" + (tried ? " is-error" : "");
      hint.innerHTML = (tried ? icon("alert") : "") + "<span>" + hintFor(st.step) + "</span>";
    } else {
      hint.className = "wizard-nav__hint";
      hint.textContent = "";
    }
  }

  /* ---------- Шаг 1: услуги ---------- */
  function stepServices(body) {
    body.innerHTML =
      '<fieldset class="svc-list"><legend class="sr-only">Услуги</legend>' +
      D.services
        .map((s) => {
          const checked = st.services.includes(s.id);
          const featured = s.id === "combo";
          return (
            '<label class="svc' + (featured ? " svc--featured" : "") + '">' +
            '<input class="svc__input" type="checkbox" name="svc" value="' + s.id + '"' + (checked ? " checked" : "") + ">" +
            '<span class="svc__check" aria-hidden="true">' + icon("check") + "</span>" +
            '<span class="svc__main"><span class="svc__name">' + esc(s.name) + (featured ? ' <span class="tag tag--brass">Выгоднее</span>' : "") + "</span>" +
            '<span class="svc__note">' + esc(s.note) + "</span></span>" +
            '<span class="svc__meta"><span class="svc__price num">' + S.fmtMoney(s.price) + '</span><span class="svc__dur num">' + icon("clock") + S.fmtDur(s.dur) + "</span></span>" +
            "</label>"
          );
        })
        .join("") +
      "</fieldset>" +
      '<p class="svc-foot">' + icon("info") + "<span>Цены указаны для мастеров. У топ-мастера стоимость выше на 20%.</span></p>" +
      '<p class="sr-only" id="svc-live" aria-live="polite"></p>';

    body.addEventListener("change", (e) => {
      const input = e.target.closest(".svc__input");
      if (!input) return;
      const id = input.value;
      let note = "";
      if (input.checked) {
        if (id === "combo") {
          const had = st.services.filter((x) => x === "cut" || x === "beard");
          st.services = st.services.filter((x) => x !== "cut" && x !== "beard");
          if (had.length) note = "Стрижка и борода уже входят в комплекс, отдельные услуги сняты.";
        }
        if ((id === "cut" || id === "beard") && st.services.includes("combo")) {
          st.services = st.services.filter((x) => x !== "combo");
          note = "Комплекс «Стрижка + борода» снят, выбрана отдельная услуга.";
        }
        st.services.push(id);
      } else {
        st.services = st.services.filter((x) => x !== id);
      }
      /* Сохраняем порядок как в прайсе */
      st.services = D.services.map((s) => s.id).filter((x) => st.services.includes(x));
      $$(".svc__input", body).forEach((i) => (i.checked = st.services.includes(i.value)));
      $("#svc-live").textContent = note;
      if (note) U.toast(note);
      st.start = null;
      st.assigned = null;
      if (st.services.length) st.tried[1] = false;
      updateSummary();
    });
  }

  /* ---------- Шаг 2: мастер ---------- */
  function masterCard(m) {
    const t = S.totals(st.services, m.id);
    const off = m.daysOff.map((d) => S.WD_SHORT[d]).join(", ");
    return (
      '<label class="master' + (m.top ? " master--top" : "") + '">' +
      '<input class="master__input" type="radio" name="master" value="' + m.id + '"' + (st.master === m.id ? " checked" : "") + ">" +
      '<span class="avatar' + (m.top ? " avatar--brass" : "") + '" aria-hidden="true">' + esc(m.initials) + "</span>" +
      '<span class="master__main">' +
      (m.top ? '<span class="tag tag--brass master__badge">' + icon("award") + "Топ-мастер</span>" : "") +
      '<span class="master__name">' + esc(m.name) + "</span>" +
      '<span class="master__spec">' + esc(m.spec) + "</span>" +
      '<span class="master__stats">' +
      '<span class="master__rating">' + icon("star", "icon--fill") + '<span class="num">' + String(m.rating).replace(".", ",") + '</span><span class="muted"> · ' + m.reviews + " " + S.plural(m.reviews, "отзыв", "отзыва", "отзывов") + "</span></span>" +
      "<span>Стаж " + m.years + " " + S.plural(m.years, "год", "года", "лет") + "</span>" +
      '<span class="muted">Выходной: ' + off + "</span>" +
      "</span>" +
      "</span>" +
      '<span class="master__price"><span class="num">' + S.fmtMoney(t.price) + "</span>" + (m.top ? '<span class="master__markup">+20%</span>' : "") + "</span>" +
      "</label>"
    );
  }

  function stepMaster(body) {
    const regular = D.masters.filter((m) => !m.top);
    const top = D.masters.filter((m) => m.top);
    const base = S.totals(st.services, null);
    body.innerHTML =
      '<fieldset class="masters"><legend class="sr-only">Мастер</legend>' +
      '<label class="master master--any">' +
      '<input class="master__input" type="radio" name="master" value="any"' + (st.master === "any" ? " checked" : "") + ">" +
      '<span class="avatar avatar--ghost" aria-hidden="true">' + icon("users") + "</span>" +
      '<span class="master__main"><span class="master__name">Любой свободный мастер</span>' +
      '<span class="master__spec">Больше свободного времени. Подберём мастера под выбранное окно, без надбавки.</span></span>' +
      '<span class="master__price"><span class="num">' + S.fmtMoney(base.price) + "</span></span>" +
      "</label>" +
      top.map(masterCard).join("") +
      '<div class="masters__row">' + regular.map(masterCard).join("") + "</div>" +
      "</fieldset>";

    body.addEventListener("change", (e) => {
      const input = e.target.closest(".master__input");
      if (!input) return;
      st.master = input.value;
      st.assigned = null;
      /* Если у нового мастера выбранное время занято, сбрасываем его */
      if (st.date && st.start != null) {
        const slot = S.slotsFor(st.date, st.master, S.totals(st.services).dur).find((x) => x.start === st.start);
        if (!slot || slot.reason) st.start = null;
        else if (st.master === "any") st.assigned = S.pickMaster(st.date, slot.free);
      }
      st.tried[2] = false;
      updateSummary();
    });
  }

  /* ---------- Шаг 3: дата и время ---------- */
  function stepTime(body) {
    const dur = S.totals(st.services).dur;
    const today = S.todayKey();
    const days = [];
    for (let i = 0; i < S.SHOP.daysAhead; i++) {
      const key = S.addDays(today, i);
      days.push({ key, info: S.dayStatus(key, st.master, dur) });
    }
    if (!st.date || !days.some((d) => d.key === st.date)) {
      const firstFree = days.find((d) => d.info.count > 0);
      st.date = firstFree ? firstFree.key : today;
      st.start = null;
    }
    const masterName = st.master === "any" ? "любого мастера" : S.masterById(st.master).short;

    body.innerHTML =
      '<fieldset class="dates"><legend class="dates__legend">Дата <span class="muted">· ' + esc(st.master === "any" ? "свободное время у любого мастера" : "расписание: " + masterName) + "</span></legend>" +
      '<div class="dates__scroller" id="dates-scroller">' +
      days
        .map((d) => {
          const dt = S.parseKey(d.key);
          const rel = S.relDay(d.key);
          let note;
          let cls = "date";
          if (d.info.off) {
            note = "выходной";
            cls += " is-off";
          } else if (!d.info.count) {
            note = "нет мест";
            cls += " is-full";
          } else note = d.info.count + " " + S.plural(d.info.count, "окно", "окна", "окон");
          if (S.isWeekend(d.key)) cls += " is-weekend";
          const aria = S.fmtDate(d.key, { weekday: true }) + (rel ? ", " + rel.toLowerCase() : "") + ", " + note;
          return (
            '<label class="' + cls + '">' +
            '<input class="date__input" type="radio" name="date" value="' + d.key + '"' + (st.date === d.key ? " checked" : "") + ' aria-label="' + esc(aria) + '">' +
            '<span class="date__wd" aria-hidden="true">' + (rel || S.WD_SHORT[dt.getDay()]) + "</span>" +
            '<span class="date__day num" aria-hidden="true">' + dt.getDate() + "</span>" +
            '<span class="date__mon" aria-hidden="true">' + S.MONTHS_SHORT[dt.getMonth()] + (rel ? ", " + S.WD_SHORT[dt.getDay()] : "") + "</span>" +
            '<span class="date__note" aria-hidden="true">' + note + "</span>" +
            "</label>"
          );
        })
        .join("") +
      "</div></fieldset>" +
      '<div class="slots" id="slots"></div><p class="sr-only" id="slots-live" aria-live="polite"></p>';

    body.querySelector(".dates").addEventListener("change", (e) => {
      const input = e.target.closest(".date__input");
      if (!input) return;
      st.date = input.value;
      st.start = null;
      st.assigned = null;
      renderSlots(true);
      updateSummary();
    });
    $("#slots").addEventListener("change", onSlotChange);
    renderSlots();
    const checked = body.querySelector(".date__input:checked");
    if (checked) {
      const lab = checked.closest(".date");
      const sc = $("#dates-scroller");
      if (sc.scrollWidth > sc.clientWidth) {
        const lr = lab.getBoundingClientRect();
        const sr = sc.getBoundingClientRect();
        sc.scrollLeft += lr.left - sr.left - (sr.width - lr.width) / 2;
      }
    }
  }

  function renderSlots(announce) {
    const box = $("#slots");
    const dur = S.totals(st.services).dur;
    const slots = S.slotsFor(st.date, st.master, dur);
    const free = slots.filter((s) => !s.reason);
    const dateLabel = S.fmtDate(st.date, { weekday: true });

    if (!free.length) {
      const pool = st.master === "any" ? null : st.master;
      const off = pool ? !S.worksOn(pool, st.date) : false;
      const next = S.nearestFreeDay(st.date, st.master, dur);
      let reason = "Все окна, в которые помещается " + S.fmtDur(dur) + ", уже заняты.";
      if (off) reason = S.masterById(pool).name + " не работает в этот день.";
      else if (st.date === S.todayKey() && slots.every((s) => s.reason === "past" || s.reason === "late"))
        reason = "Сегодня запись уже закрыта: услуги не успеют закончиться до 21:00.";
      box.innerHTML =
        '<div class="empty empty--slots">' +
        '<span class="empty__icon" aria-hidden="true">' + icon("calendar-x", "icon--lg") + "</span>" +
        '<h2 class="empty__title">На ' + esc(S.fmtDate(st.date)) + " свободного времени нет</h2>" +
        '<p class="empty__text">' + esc(reason) + "</p>" +
        '<div class="empty__actions">' +
        (next
          ? '<button class="btn btn--primary" type="button" id="jump-next">' + icon("calendar-check") + "<span>Ближайшее окно: " + esc(S.fmtDate(next, { weekday: true, short: true })) + "</span></button>"
          : "") +
        '<button class="btn btn--secondary" type="button" id="change-master">' + icon("users") + "<span>Другой мастер</span></button>" +
        "</div></div>";
      const jump = $("#jump-next");
      if (jump)
        jump.addEventListener("click", () => {
          st.date = next;
          st.start = null;
          const input = $('.date__input[value="' + next + '"]');
          if (input) {
            input.checked = true;
            input.focus();
          }
          renderSlots(true);
          updateSummary();
        });
      $("#change-master").addEventListener("click", () => {
        st.step = 2;
        renderWizard(true);
      });
      if (announce) $("#slots-live").textContent = "На " + S.fmtDate(st.date) + " свободного времени нет";
      return;
    }

    const groups = [
      { name: "Утро", from: 600, to: 720 },
      { name: "День", from: 720, to: 1020 },
      { name: "Вечер", from: 1020, to: 1260 }
    ];
    box.innerHTML =
      '<div class="slots__head"><h2 class="slots__title">' + esc(dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)) + "</h2>" +
      '<p class="slots__meta">' + free.length + " " + S.plural(free.length, "свободное окно", "свободных окна", "свободных окон") + " на " + S.fmtDur(dur) + "</p></div>" +
      groups
        .map((g) => {
          const list = slots.filter((s) => s.start >= g.from && s.start < g.to && s.reason !== "past");
          if (!list.length) return "";
          const freeCount = list.filter((s) => !s.reason).length;
          return (
            '<fieldset class="slot-group"><legend class="slot-group__name">' + g.name + ' <span class="muted">' + (freeCount ? freeCount + " своб." : "всё занято") + "</span></legend>" +
            '<div class="slot-grid">' +
            list
              .map((s) => {
                const dis = !!s.reason;
                const why = s.reason === "busy" ? "занято" : "не успеем до закрытия";
                return (
                  '<label class="slot' + (dis ? " is-unavailable" : "") + '">' +
                  '<input class="slot__input" type="radio" name="slot" value="' + s.start + '"' + (dis ? " disabled" : "") + (st.start === s.start ? " checked" : "") +
                  (dis ? ' aria-label="' + S.fmtTime(s.start) + ", " + why + '"' : "") + ">" +
                  '<span class="num">' + S.fmtTime(s.start) + "</span></label>"
                );
              })
              .join("") +
            "</div></fieldset>"
          );
        })
        .join("") +
      '<p class="slots__legend"><span class="slot slot--sample is-unavailable" aria-hidden="true"><span class="num">12:00</span></span>Зачёркнутое время занято или услуги не успеют закончиться до 21:00</p>';

    if (announce) $("#slots-live").textContent = dateLabel + ": " + free.length + " " + S.plural(free.length, "свободное окно", "свободных окна", "свободных окон");
  }

  function onSlotChange(e) {
    const input = e.target.closest(".slot__input");
    if (!input) return;
    st.start = Number(input.value);
    if (st.master === "any") {
      const dur = S.totals(st.services).dur;
      const slot = S.slotsFor(st.date, "any", dur).find((x) => x.start === st.start);
      st.assigned = slot ? S.pickMaster(st.date, slot.free) : null;
    }
    st.tried[3] = false;
    updateSummary();
  }

  /* ---------- Шаг 4: контакты ---------- */
  function recapHtml() {
    const t = currentTotals();
    const m = S.masterById(effectiveMaster());
    return (
      '<div class="recap">' +
      '<p class="recap__title">Проверьте запись</p>' +
      '<dl class="recap__list">' +
      '<div><dt>Когда</dt><dd class="num">' + S.fmtDate(st.date, { weekday: true }) + ", " + S.fmtTime(st.start) + "-" + S.fmtTime(st.start + t.dur) + "</dd></div>" +
      "<div><dt>Мастер</dt><dd>" + esc(m ? m.name : "") + "</dd></div>" +
      "<div><dt>Услуги</dt><dd>" + t.list.map((x) => esc(x.name)).join(", ") + "</dd></div>" +
      '<div><dt>Длительность</dt><dd class="num">' + S.fmtDur(t.dur) + "</dd></div>" +
      "</dl>" +
      '<p class="recap__total"><span>Итого</span><strong class="num">' + S.fmtMoney(t.price) + "</strong></p>" +
      "</div>"
    );
  }

  function stepContacts(body) {
    body.innerHTML =
      recapHtml() +
      '<form class="form" id="contact-form" novalidate>' +
      '<div class="form__row">' +
      '<div class="field"><label class="field__label" for="f-name">Имя</label>' +
      '<input class="input" id="f-name" name="name" type="text" autocomplete="given-name" maxlength="40" required aria-describedby="f-name-err" value="' + esc(st.name) + '">' +
      '<p class="field__error" id="f-name-err" hidden></p></div>' +
      '<div class="field"><label class="field__label" for="f-phone">Телефон</label>' +
      '<input class="input num" id="f-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" required placeholder="+7 (___) ___-__-__" aria-describedby="f-phone-hint f-phone-err" value="' + esc(st.phone) + '">' +
      '<p class="field__hint" id="f-phone-hint">Пришлём подтверждение в SMS</p>' +
      '<p class="field__error" id="f-phone-err" hidden></p></div>' +
      "</div>" +
      '<div class="field"><label class="field__label" for="f-comment">Комментарий <span class="muted">необязательно</span></label>' +
      '<textarea class="input input--area" id="f-comment" name="comment" rows="3" maxlength="300" placeholder="Например: хочу оставить длину сверху">' + esc(st.comment) + "</textarea></div>" +
      '<label class="check"><input class="check__input" type="checkbox" id="f-remind"' + (st.remind ? " checked" : "") + '><span class="check__box" aria-hidden="true">' + icon("check") + "</span>" +
      '<span class="check__text">' + icon("bell") + "Напомнить о визите за 2 часа</span></label>" +
      '<p class="form__note">Нажимая «Записаться», вы соглашаетесь, что мы используем имя и телефон только для этой записи.</p>' +
      '<p class="form__error" id="form-error" role="alert" hidden></p>' +
      "</form>";

    const name = $("#f-name");
    const phone = $("#f-phone");
    U.bindPhoneMask(phone);
    name.addEventListener("input", () => {
      st.name = name.value;
      if (name.getAttribute("aria-invalid")) validateName();
    });
    phone.addEventListener("input", () => {
      st.phone = phone.value;
      if (phone.getAttribute("aria-invalid")) validatePhone();
    });
    name.addEventListener("blur", () => name.value.trim() && validateName());
    phone.addEventListener("blur", () => phone.value && validatePhone());
    $("#f-comment").addEventListener("input", (e) => (st.comment = e.target.value));
    $("#f-remind").addEventListener("change", (e) => (st.remind = e.target.checked));
    $("#contact-form").addEventListener("submit", onSubmit);
  }

  function validateName() {
    const v = $("#f-name").value.trim();
    let msg = "";
    if (!v) msg = "Введите имя, чтобы мастер знал, как к вам обращаться";
    else if (v.length < 2 || !/[A-Za-zА-Яа-яЁё]/.test(v)) msg = "Имя должно содержать хотя бы две буквы";
    U.setFieldError($("#f-name"), msg);
    return !msg;
  }
  function validatePhone() {
    const input = $("#f-phone");
    const d = U.phoneDigits(input.value);
    let msg = "";
    if (d.length <= 1) msg = "Введите номер телефона для подтверждения записи";
    else if (d.length !== 11) msg = "В номере не хватает цифр: нужно 10 цифр после +7, сейчас " + (d.length - 1);
    U.setFieldError(input, msg);
    return !msg;
  }

  function onSubmit(e) {
    e.preventDefault();
    const okName = validateName();
    const okPhone = validatePhone();
    if (!okName || !okPhone) {
      (okName ? $("#f-phone") : $("#f-name")).focus();
      return;
    }
    const btn = $("#w-next");
    if (btn.getAttribute("aria-busy") === "true") return;
    U.setBusy(btn, true, "Записываем");
    setTimeout(() => {
      const dur = S.totals(st.services).dur;
      let masterId = st.master;
      let slotOk;
      if (st.master === "any") {
        const slot = S.slotsFor(st.date, "any", dur).find((x) => x.start === st.start);
        slotOk = slot && !slot.reason;
        if (slotOk) masterId = slot.free.includes(st.assigned) ? st.assigned : S.pickMaster(st.date, slot.free);
      } else {
        slotOk = S.isFree(masterId, st.date, st.start, dur) && st.start >= S.earliestStart(st.date);
      }
      if (!slotOk) {
        U.setBusy(btn, false);
        const err = $("#form-error");
        err.hidden = false;
        err.innerHTML = icon("alert") + "<span>Это время только что заняли. Вернитесь к шагу «Время» и выберите другое окно.</span>";
        return;
      }
      const b = S.create({
        masterId,
        date: st.date,
        start: st.start,
        services: st.services,
        name: $("#f-name").value.trim(),
        phone: U.formatPhone($("#f-phone").value),
        comment: $("#f-comment").value.trim(),
        remind: $("#f-remind").checked,
        source: "client"
      });
      st = fresh();
      window.App.updateMineCount();
      location.hash = "#/booking/" + b.id;
    }, 650);
  }

  /* ---------- Подтверждение ---------- */
  function ticketHtml(b) {
    const m = S.masterById(b.masterId);
    const names = b.services.map((id) => S.serviceById(id).name);
    return (
      '<div class="ticket' + (b.status === "cancelled" ? " is-cancelled" : "") + '">' +
      '<div class="ticket__top">' +
      '<p class="ticket__label">Номер записи</p>' +
      '<p class="ticket__code num">' + esc(b.code) + "</p>" +
      (b.status === "cancelled" ? '<p class="status status--cancelled">' + icon("calendar-x") + "Отменена</p>" : '<p class="status status--confirmed">' + icon("calendar-check") + "Подтверждена</p>") +
      "</div>" +
      '<dl class="ticket__list">' +
      "<div><dt>Дата</dt><dd>" + S.fmtDate(b.date, { weekday: true }) + "</dd></div>" +
      '<div><dt>Время</dt><dd class="num">' + S.fmtTime(b.start) + "-" + S.fmtTime(b.start + b.dur) + "</dd></div>" +
      "<div><dt>Мастер</dt><dd>" + esc(m.name) + (m.top ? ' <span class="tag tag--brass">Топ</span>' : "") + "</dd></div>" +
      "<div><dt>Услуги</dt><dd>" + names.map(esc).join("<br>") + "</dd></div>" +
      '<div><dt>Длительность</dt><dd class="num">' + S.fmtDur(b.dur) + "</dd></div>" +
      '<div class="ticket__sum"><dt>Сумма</dt><dd class="num">' + S.fmtMoney(b.price) + "</dd></div>" +
      "</dl>" +
      '<p class="ticket__addr">' + icon("map-pin") + "<span>" + esc(S.SHOP.address) + ". " + esc(S.SHOP.metro) + "</span></p>" +
      "</div>"
    );
  }

  function renderDone(id) {
    const b = S.byId(id);
    if (!b) {
      main().innerHTML =
        '<section class="container page-pad"><div class="empty empty--page">' +
        '<span class="empty__icon" aria-hidden="true">' + icon("calendar-x", "icon--lg") + "</span>" +
        '<h1 class="empty__title empty__title--big" tabindex="-1">Запись не найдена</h1>' +
        '<p class="empty__text">Возможно, демо-данные сбросили в панели администратора. Запишитесь заново, это займёт полминуты.</p>' +
        '<div class="empty__actions"><a class="btn btn--primary" href="#/">' + icon("scissors") + "<span>Записаться</span></a></div></div></section>";
      document.title = "Запись не найдена. Сталь";
      return;
    }
    const cancelled = b.status === "cancelled";
    const when = S.fmtDate(b.date, { weekday: true }).split(", ");
    main().innerHTML =
      '<section class="done container page-pad" aria-labelledby="done-title">' +
      '<div class="done__head">' +
      (cancelled
        ? '<p class="kicker kicker--danger">' + icon("calendar-x") + "Запись отменена</p>" +
          '<h1 class="display" id="done-title" tabindex="-1">Запись отменена</h1>' +
          '<p class="lead">Время ' + S.fmtTime(b.start) + ", " + esc(S.fmtDate(b.date)) + " снова свободно. Если захотите прийти в другой день, запишитесь заново.</p>"
        : '<p class="kicker kicker--success">' + icon("circle-check") + "Запись подтверждена</p>" +
          '<h1 class="display" id="done-title" tabindex="-1">До встречи, ' + esc(b.name) + "</h1>" +
          '<p class="lead">Ждём вас ' + esc(when[1]) + ", " + esc(when[0]) + ", в " + S.fmtTime(b.start) + ". Приходите за 5 минут: сварим кофе. Если планы изменятся, отмените запись здесь или позвоните " +
          '<a class="link num" href="tel:' + S.SHOP.phoneHref + '">' + S.SHOP.phone + "</a>.</p>") +
      '<div class="done__actions">' +
      (cancelled
        ? '<a class="btn btn--primary" href="#/">' + icon("scissors") + "<span>Записаться снова</span></a>"
        : '<button class="btn btn--primary" type="button" id="cal-add">' + icon("calendar-plus") + "<span>Добавить в календарь</span></button>" +
          '<button class="btn btn--danger-outline" type="button" id="cancel-booking">' + icon("calendar-x") + "<span>Отменить запись</span></button>") +
      "</div>" +
      '<p class="done__more"><a class="link" href="#/my">Все мои записи</a>' + (cancelled ? "" : '<span aria-hidden="true"> · </span><a class="link" href="#/">Новая запись</a>') + "</p>" +
      "</div>" +
      ticketHtml(b) +
      "</section>";
    document.title = (cancelled ? "Запись отменена" : "Вы записаны") + ". Сталь";
    const cal = $("#cal-add");
    if (cal)
      cal.addEventListener("click", () => {
        U.downloadIcs(b);
        U.toast("Файл календаря скачан. Откройте его, чтобы добавить событие.");
      });
    const cancelBtn = $("#cancel-booking");
    if (cancelBtn) cancelBtn.addEventListener("click", () => askCancel(b, () => renderDone(b.id)));
  }

  function askCancel(b, after) {
    U.confirmAction({
      title: "Отменить запись " + b.code + "?",
      text: S.fmtDate(b.date, { weekday: true }) + ", " + S.fmtTime(b.start) + ". Время освободится для других клиентов, вернуть запись не получится.",
      confirm: "Отменить запись",
      keep: "Оставить запись"
    }).then((ok) => {
      if (!ok) return;
      S.cancel(b.id, "client");
      window.App.updateMineCount();
      U.toast("Запись " + b.code + " отменена", "danger");
      after();
      const h = $("h1", main());
      if (h) h.focus();
    });
  }

  /* ---------- Мои записи ---------- */
  function renderMine() {
    const list = S.mine();
    const today = S.todayKey();
    const nowM = S.nowMinutes();
    const isUpcoming = (b) => b.status !== "cancelled" && (b.date > today || (b.date === today && b.start + b.dur > nowM));
    const upcoming = list.filter(isUpcoming).sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start);
    const history = list.filter((b) => !isUpcoming(b)).sort((a, b) => b.createdAt - a.createdAt);
    document.title = "Мои записи. Сталь";

    if (!list.length) {
      main().innerHTML =
        '<section class="container page-pad mine">' +
        '<div class="empty empty--page">' +
        '<span class="empty__icon" aria-hidden="true">' + icon("calendar", "icon--lg") + "</span>" +
        '<h1 class="empty__title empty__title--big" tabindex="-1">Записей пока нет</h1>' +
        '<p class="empty__text">Здесь появятся визиты, на которые вы записались в этом браузере: с датой, мастером и кнопкой отмены. Запись занимает полминуты.</p>' +
        '<div class="empty__actions"><a class="btn btn--primary" href="#/">' + icon("scissors") + "<span>Записаться</span></a></div>" +
        "</div></section>";
      return;
    }

    const card = (b, lead) => {
      const m = S.masterById(b.masterId);
      const dt = S.parseKey(b.date);
      const rel = S.relDay(b.date);
      return (
        '<li class="visit' + (lead ? " visit--lead" : "") + '">' +
        '<div class="visit__date" aria-hidden="true"><span class="visit__day num">' + dt.getDate() + '</span><span class="visit__mon">' + S.MONTHS_SHORT[dt.getMonth()] + ", " + S.WD_SHORT[dt.getDay()] + "</span></div>" +
        '<div class="visit__main">' +
        (lead ? '<p class="visit__flag">Ближайший визит' + (rel ? ", " + rel.toLowerCase() : "") + "</p>" : "") +
        '<h3 class="visit__title"><span class="sr-only">' + S.fmtDate(b.date, { weekday: true }) + ", </span><span class=\"num\">" + S.fmtTime(b.start) + "-" + S.fmtTime(b.start + b.dur) + "</span></h3>" +
        '<p class="visit__services">' + b.services.map((id) => esc(S.serviceById(id).name)).join(", ") + "</p>" +
        '<p class="visit__meta">' + esc(m.name) + ' · <span class="num">' + S.fmtMoney(b.price) + '</span> · № <span class="num">' + esc(b.code) + "</span></p>" +
        "</div>" +
        '<div class="visit__actions">' +
        '<a class="btn btn--secondary btn--sm" href="#/booking/' + b.id + '">Подробнее</a>' +
        '<button class="btn btn--ghost btn--sm" type="button" data-ics="' + b.id + '">' + icon("calendar-plus") + "<span>В календарь</span></button>" +
        '<button class="btn btn--danger-ghost btn--sm" type="button" data-cancel="' + b.id + '">' + icon("calendar-x") + "<span>Отменить запись</span></button>" +
        "</div></li>"
      );
    };

    const histRow = (b) => {
      const st2 = b.status === "cancelled" ? '<span class="status status--cancelled">' + icon("calendar-x") + "Отменена</span>" : '<span class="status status--past">' + icon("circle-check") + "Прошла</span>";
      return (
        '<li class="history__row"><a class="history__link" href="#/booking/' + b.id + '">' +
        '<span class="num history__when">' + S.fmtDate(b.date, { short: true }) + ", " + S.fmtTime(b.start) + "</span>" +
        '<span class="history__what">' + b.services.map((id) => esc(S.serviceById(id).name)).join(", ") + "</span>" +
        st2 + "</a></li>"
      );
    };

    main().innerHTML =
      '<section class="container page-pad mine" aria-labelledby="mine-title">' +
      '<div class="mine__head"><h1 class="display" id="mine-title" tabindex="-1">Мои записи</h1>' +
      '<p class="lead">Визиты, на которые вы записались в этом браузере. Отменить можно в любой момент до начала.</p></div>' +
      (upcoming.length
        ? '<h2 class="section-label">Предстоящие</h2><ul class="visits">' + upcoming.map((b, i) => card(b, i === 0)).join("") + "</ul>"
        : '<div class="empty empty--inline"><span class="empty__icon" aria-hidden="true">' + icon("calendar") + '</span><div><h2 class="empty__title">Предстоящих визитов нет</h2><p class="empty__text">Все прошлые и отменённые записи ниже.</p></div><a class="btn btn--primary" href="#/">' + icon("scissors") + "<span>Записаться</span></a></div>") +
      (history.length ? '<h2 class="section-label">История</h2><ul class="history">' + history.map(histRow).join("") + "</ul>" : "") +
      '<p class="mine__foot"><a class="btn btn--primary" href="#/">' + icon("plus") + "<span>Новая запись</span></a></p>" +
      "</section>";

    $$("[data-ics]", main()).forEach((btn) =>
      btn.addEventListener("click", () => {
        U.downloadIcs(S.byId(btn.dataset.ics));
        U.toast("Файл календаря скачан");
      })
    );
    $$("[data-cancel]", main()).forEach((btn) => btn.addEventListener("click", () => askCancel(S.byId(btn.dataset.cancel), renderMine)));
  }

  window.Client = {
    wizard(focus) {
      renderWizard(focus);
    },
    done: renderDone,
    mine: renderMine,
    reset() {
      st = fresh();
    }
  };
})();
