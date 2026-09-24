/* Панель администратора: вход в демо-режим, расписание дня, боковая панель записи, неделя */
(function () {
  "use strict";

  const S = window.Store;
  const U = window.UI;
  const D = window.APP_DATA;
  const { $, $$, esc, icon } = U;
  const SHOP = S.SHOP;
  const ROWS = (SHOP.close - SHOP.open) / SHOP.step;

  const main = () => $("#admin-main");
  let view = { tab: "day", date: S.todayKey() };
  let returnTo = null; /* куда вернуть фокус после закрытия панели */
  let nowTimer = null;

  const STATUS = {
    confirmed: { label: "Подтверждена", icon: "calendar-check" },
    arrived: { label: "Пришёл", icon: "user-check" },
    noshow: { label: "Не пришёл", icon: "user-x" },
    cancelled: { label: "Отменена", icon: "calendar-x" }
  };
  const SOURCE = { online: "Онлайн-запись", phone: "По телефону", client: "Онлайн-запись с сайта", admin: "Создана администратором" };

  const statusHtml = (s) => '<span class="status status--' + s + '">' + icon(STATUS[s].icon) + STATUS[s].label + "</span>";
  const svcNames = (b) => b.services.map((id) => S.serviceById(id).name);
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  /* ---------- Вход в демо-режим ---------- */
  function renderLogin() {
    document.title = "Демо-режим администратора. Сталь";
    main().innerHTML =
      '<section class="login page-pad" aria-labelledby="login-title">' +
      '<div class="login__main">' +
      '<p class="kicker">' + icon("shield") + "Демо-режим администратора</p>" +
      '<h1 class="display" id="login-title" tabindex="-1">Панель администратора</h1>' +
      '<p class="lead">Это демонстрация: настоящей авторизации нет, пароль не нужен. Записи, в том числе сделанные вами в клиентской части, хранятся только в этом браузере и видны здесь сразу.</p>' +
      '<div class="login__actions">' +
      '<button class="btn btn--primary btn--lg" type="button" id="admin-enter">' + icon("log-in") + "<span>Войти в демо-режим</span></button>" +
      '<a class="btn btn--secondary btn--lg" href="#/">' + icon("arrow-left") + "<span>К записи клиентов</span></a>" +
      "</div></div>" +
      '<ul class="login__features" aria-label="Что есть в панели">' +
      '<li><span class="login__ico" aria-hidden="true">' + icon("columns") + '</span><span><strong>Расписание дня</strong>Колонки мастеров, записи по длительности, линия текущего времени.</span></li>' +
      '<li><span class="login__ico" aria-hidden="true">' + icon("swap") + '</span><span><strong>Перенос и отмена</strong>Смена времени и мастера с проверкой пересечений, отметка «пришёл» и «не пришёл».</span></li>' +
      '<li><span class="login__ico" aria-hidden="true">' + icon("chart") + '</span><span><strong>Сводка за неделю</strong>Выручка и загрузка по дням на одном графике.</span></li>' +
      "</ul>" +
      "</section>";
    $("#admin-enter").addEventListener("click", () => {
      S.setAdmin(true);
      location.hash = "#/admin/day";
    });
  }

  /* ---------- День ---------- */
  function kpiHtml(key) {
    const s = S.dayStats(key);
    return (
      '<div class="kpis">' +
      '<div class="kpi kpi--lead">' +
      '<p class="kpi__label">Выручка за день</p>' +
      '<p class="kpi__value num">' + S.fmtMoney(s.revenue) + "</p>" +
      '<p class="kpi__sub num">Получено ' + S.fmtMoney(s.received) + " · ожидается " + S.fmtMoney(s.expected) + "</p>" +
      "</div>" +
      '<div class="kpi">' +
      '<p class="kpi__label">Записей</p>' +
      '<p class="kpi__value num">' + s.count + "</p>" +
      '<p class="kpi__sub">' + (s.noshow ? s.noshow + " " + S.plural(s.noshow, "неявка", "неявки", "неявок") : "Без неявок") + "</p>" +
      "</div>" +
      '<div class="kpi">' +
      '<p class="kpi__label">Загрузка мастеров</p>' +
      '<p class="kpi__value num">' + Math.round(s.load * 100) + "%</p>" +
      '<span class="meter" aria-hidden="true"><span class="meter__fill" style="--v:' + s.load.toFixed(3) + '"></span></span>' +
      '<p class="kpi__sub">Работают ' + s.working + " из " + D.masters.length + "</p>" +
      "</div>" +
      '<div class="kpi">' +
      '<p class="kpi__label">Средний чек</p>' +
      '<p class="kpi__value num">' + S.fmtMoney(s.avg) + "</p>" +
      '<p class="kpi__sub">Без учёта неявок</p>' +
      "</div>" +
      "</div>"
    );
  }

  function apptHtml(b) {
    const m = S.masterById(b.masterId);
    const names = svcNames(b);
    const len = b.dur / SHOP.step;
    const range = S.fmtTime(b.start) + "-" + S.fmtTime(b.start + b.dur);
    const label = range + ", " + b.name + ", " + names.join(", ") + ", мастер " + m.name + ", статус: " + STATUS[b.status].label;
    return (
      '<button class="appt appt--' + b.status + (len <= 2 ? " appt--short" : "") + '" type="button" data-id="' + b.id + '" style="--start:' + (b.start - SHOP.open) / SHOP.step + ";--len:" + len + '" aria-label="' + esc(label) + '">' +
      '<span class="appt__line"><span class="appt__time num">' + range + '</span><span class="appt__ico">' + icon(STATUS[b.status].icon) + "</span></span>" +
      '<span class="appt__name">' + esc(b.name) + '<span class="appt__svc"> · ' + esc(names.join(", ")) + "</span></span>" +
      (len >= 4 ? '<span class="appt__status">' + STATUS[b.status].label + "</span>" : "") +
      "</button>"
    );
  }

  function schedHtml(key) {
    const today = S.todayKey();
    let times = "";
    for (let h = SHOP.open; h < SHOP.close; h += 60) times += '<span class="sched__hour num" style="--row:' + (h - SHOP.open) / SHOP.step + '">' + S.fmtTime(h) + "</span>";
    const heads0 = D.masters
      .map((m) => {
        const works = S.worksOn(m.id, key);
        const list = S.forDay(key, m.id);
        const busy = list.reduce((s, b) => s + b.dur, 0);
        const pct = Math.round((busy / (SHOP.close - SHOP.open)) * 100);
        return (
          '<div class="sched__head' + (works ? "" : " is-off") + '">' +
          '<span class="avatar avatar--sm' + (m.top ? " avatar--brass" : "") + '" aria-hidden="true">' + esc(m.initials) + "</span>" +
          '<span class="sched__who"><span class="sched__name">' + esc(m.name) + (m.top ? ' <span class="tag tag--brass">Топ</span>' : "") + "</span>" +
          '<span class="sched__load num">' + (works ? list.length + " " + S.plural(list.length, "запись", "записи", "записей") + " · " + pct + "%" : "Выходной") + "</span></span>" +
          "</div>"
        );
      })
      .join("");
    const cols = D.masters
      .map((m, i) => {
        const works = S.worksOn(m.id, key);
        const list = S.forDay(key, m.id);
        return (
          '<div class="sched__col' + (works ? "" : " is-off") + '" data-master="' + m.id + '" style="grid-column:' + (i + 2) + '">' +
          (works ? "" : '<p class="sched__off">' + icon("calendar-x") + "Выходной</p>") +
          list.map(apptHtml).join("") +
          '<span class="sched__ghost" aria-hidden="true" hidden></span>' +
          "</div>"
        );
      })
      .join("");
    let now = "";
    if (key === today) {
      const n = S.nowMinutes();
      if (n >= SHOP.open && n <= SHOP.close) {
        const pos = ((n - SHOP.open) / SHOP.step).toFixed(2);
        now = '<div class="sched__nowlayer" aria-hidden="true"><div class="sched__now" style="--now:' + pos + '"></div></div>';
        times += '<span class="sched__nowtag num" style="--now:' + pos + '">' + S.fmtTime(n) + "</span>";
      }
    }
    return (
      '<div class="sched-wrap" id="sched-wrap">' +
      '<div class="sched" id="sched" tabindex="0" role="region" aria-label="Расписание мастеров на ' + esc(S.fmtDate(key)) + '. Прокручивается по горизонтали">' +
      '<div class="sched__grid" style="--rows:' + ROWS + ";--cols:" + D.masters.length + '">' +
      '<div class="sched__corner" aria-hidden="true"></div>' +
      heads0 +
      '<div class="sched__times" aria-hidden="true">' + times + "</div>" +
      cols +
      now +
      "</div></div></div>"
    );
  }

  function renderDay(key, focusTitle) {
    view = { tab: "day", date: key };
    const today = S.todayKey();
    const rel = S.relDay(key);
    const wd = S.WD_LONG[S.weekday(key)];
    document.title = "Расписание на " + S.fmtDate(key) + ". Сталь, администратор";
    main().innerHTML =
      '<section class="day" aria-labelledby="day-title">' +
      '<div class="toolbar">' +
      '<div class="toolbar__heading"><p class="kicker">' + esc(rel ? rel + ", " + wd : cap(wd)) + "</p>" +
      '<h1 class="admin-title" id="day-title" tabindex="-1">' + esc(S.fmtDate(key)) + "</h1></div>" +
      '<div class="toolbar__controls">' +
      '<div class="date-nav">' +
      '<button class="icon-btn icon-btn--framed" type="button" id="day-prev" aria-label="Предыдущий день">' + icon("chevron-left") + "</button>" +
      '<label class="sr-only" for="day-pick">Выбрать дату</label>' +
      '<input class="input input--date num" type="date" id="day-pick" value="' + key + '">' +
      '<button class="icon-btn icon-btn--framed" type="button" id="day-next" aria-label="Следующий день">' + icon("chevron-right") + "</button>" +
      "</div>" +
      (key !== today ? '<button class="btn btn--secondary btn--sm" type="button" id="day-today">Сегодня</button>' : "") +
      '<button class="btn btn--primary btn--sm" type="button" id="new-booking">' + icon("plus") + "<span>Новая запись</span></button>" +
      "</div></div>" +
      kpiHtml(key) +
      '<div class="sched-bar">' +
      '<ul class="legend" aria-label="Статусы записей">' +
      ["confirmed", "arrived", "noshow"].map((s) => '<li class="legend__item legend__item--' + s + '">' + icon(STATUS[s].icon) + STATUS[s].label + "</li>").join("") +
      "</ul>" +
      '<p class="sched-hint" id="sched-hint" hidden>' + icon("move-h") + "Листайте вбок: " + D.masters.length + " мастера</p>" +
      "</div>" +
      schedHtml(key) +
      '<p class="sched-foot">' + icon("info") + "<span>Нажмите на свободное место в колонке мастера, чтобы создать запись на это время. Нажмите на запись, чтобы открыть детали.</span></p>" +
      "</section>";

    $("#day-prev").addEventListener("click", () => go("day", S.addDays(key, -1)));
    $("#day-next").addEventListener("click", () => go("day", S.addDays(key, 1)));
    $("#day-pick").addEventListener("change", (e) => {
      if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) go("day", e.target.value);
    });
    const tBtn = $("#day-today");
    if (tBtn) tBtn.addEventListener("click", () => go("day", S.todayKey()));
    $("#new-booking").addEventListener("click", (e) => openCreate({ date: key }, e.currentTarget));
    bindSched(key);
    if (focusTitle) $("#day-title").focus({ preventScroll: true });
    scrollToNow(key);
    startNowTimer(key);
  }

  function go(tab, key) {
    location.hash = "#/admin/" + tab + "/" + key;
  }

  function slotPx() {
    const col = $(".sched__col");
    return col ? col.getBoundingClientRect().height / ROWS : 20;
  }

  function bindSched(key) {
    const sched = $("#sched");
    const wrap = $("#sched-wrap");
    sched.addEventListener("click", (e) => {
      const appt = e.target.closest(".appt");
      if (appt) {
        openDetails(appt.dataset.id, appt);
        return;
      }
      const col = e.target.closest(".sched__col");
      if (!col || col.classList.contains("is-off")) return;
      const row = Math.floor((e.clientY - col.getBoundingClientRect().top) / slotPx());
      const start = SHOP.open + Math.max(0, Math.min(ROWS - 1, row)) * SHOP.step;
      openCreate({ date: key, masterId: col.dataset.master, start }, sched);
    });
    /* Подсказка-призрак: где будет новая запись */
    $$(".sched__col", sched).forEach((col) => {
      if (col.classList.contains("is-off")) return;
      const ghost = col.querySelector(".sched__ghost");
      col.addEventListener("pointermove", (e) => {
        if (e.pointerType !== "mouse" || e.target.closest(".appt")) {
          ghost.hidden = true;
          return;
        }
        const row = Math.floor((e.clientY - col.getBoundingClientRect().top) / slotPx());
        if (row < 0 || row >= ROWS) return;
        const start = SHOP.open + row * SHOP.step;
        ghost.hidden = false;
        ghost.style.setProperty("--start", row);
        ghost.innerHTML = icon("plus") + '<span class="num">' + S.fmtTime(start) + "</span>";
      });
      col.addEventListener("pointerleave", () => (ghost.hidden = true));
    });
    /* Горизонтальная прокрутка: подсказка и затемнение края */
    const hint = $("#sched-hint");
    const update = () => {
      const more = sched.scrollWidth - sched.clientWidth > 2;
      hint.hidden = !more;
      wrap.classList.toggle("has-more-right", more && sched.scrollLeft + sched.clientWidth < sched.scrollWidth - 2);
      wrap.classList.toggle("has-more-left", more && sched.scrollLeft > 2);
    };
    sched.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    update();
  }

  function scrollToNow(key) {
    const now = $(".sched__now");
    if (!now || key !== S.todayKey()) return;
    /* Прокручиваем расписание к текущему времени только если линия ниже первого экрана */
    const r = now.getBoundingClientRect();
    if (r.top > window.innerHeight) window.scrollTo({ top: window.scrollY + r.top - window.innerHeight / 2, behavior: "auto" });
  }

  function startNowTimer(key) {
    clearInterval(nowTimer);
    if (key !== S.todayKey()) return;
    nowTimer = setInterval(() => {
      const el = $(".sched__now");
      if (!el) return clearInterval(nowTimer);
      const n = S.nowMinutes();
      const pos = ((Math.min(n, SHOP.close) - SHOP.open) / SHOP.step).toFixed(2);
      el.style.setProperty("--now", pos);
      const tag = $(".sched__nowtag");
      if (tag) {
        tag.style.setProperty("--now", pos);
        tag.textContent = S.fmtTime(n);
      }
    }, 30000);
  }

  function refresh() {
    if (view.tab === "day" && $("#day-title")) {
      const y = window.scrollY;
      const sched = $("#sched");
      const x = sched ? sched.scrollLeft : 0;
      renderDay(view.date, false);
      const s2 = $("#sched");
      if (s2) s2.scrollLeft = x;
      window.scrollTo(0, y);
    } else if (view.tab === "week" && $("#week-title")) {
      renderWeek(view.date, false);
    }
  }

  /* ---------- Боковая панель ---------- */
  const drawer = () => $("#drawer");

  function openDrawer(title, html, trigger) {
    returnTo = trigger || null;
    $("#drawer-title").textContent = title;
    $("#drawer-body").innerHTML = html;
    const d = drawer();
    if (!d.open) d.showModal();
    $("#drawer-body").scrollTop = 0;
    $("#drawer-title").focus();
  }
  function closeDrawer() {
    const d = drawer();
    if (d.open) d.close();
  }
  function restoreFocus() {
    let target = null;
    if (returnTo && typeof returnTo === "string") target = $('.appt[data-id="' + returnTo + '"]');
    else if (returnTo && document.contains(returnTo)) target = returnTo;
    else if (returnTo && returnTo.dataset && returnTo.dataset.id) target = $('.appt[data-id="' + returnTo.dataset.id + '"]');
    if (!target) target = $("#sched") || $("#admin-main");
    returnTo = null;
    if (target) target.focus({ preventScroll: false });
  }

  function timeOptions(masterId, key, dur, excludeId, selected) {
    let html = "";
    let anyFree = false;
    const works = S.worksOn(masterId, key);
    for (let s = SHOP.open; s + dur <= SHOP.close; s += SHOP.step) {
      const free = works && S.isFree(masterId, key, s, dur, excludeId);
      if (free) anyFree = true;
      html += '<option value="' + s + '"' + (free ? "" : " disabled") + (s === selected && free ? " selected" : "") + ">" + S.fmtTime(s) + (free ? "" : ", занято") + "</option>";
    }
    return { html, anyFree, works };
  }

  function masterOptions(selected) {
    return D.masters.map((m) => '<option value="' + m.id + '"' + (m.id === selected ? " selected" : "") + ">" + esc(m.name) + (m.top ? " (топ, +20%)" : "") + "</option>").join("");
  }

  function openDetails(id, trigger) {
    const b = S.byId(id);
    if (!b) return;
    const m = S.masterById(b.masterId);
    const names = svcNames(b);
    const html =
      '<div class="dr-block dr-head">' +
      '<div class="dr-head__row">' + statusHtml(b.status) + '<span class="muted">' + (SOURCE[b.source] || "Онлайн-запись") + "</span></div>" +
      '<p class="dr-name">' + esc(b.name) + "</p>" +
      '<a class="link num dr-phone" href="tel:+' + U.phoneDigits(b.phone) + '">' + icon("phone") + esc(b.phone) + "</a>" +
      "</div>" +
      '<dl class="dr-list">' +
      '<div><dt>Когда</dt><dd class="num">' + esc(cap(S.fmtDate(b.date, { weekday: true }))) + ", " + S.fmtTime(b.start) + "-" + S.fmtTime(b.start + b.dur) + "</dd></div>" +
      "<div><dt>Мастер</dt><dd>" + esc(m.name) + (m.top ? ' <span class="tag tag--brass">Топ</span>' : "") + "</dd></div>" +
      "<div><dt>Услуги</dt><dd>" + names.map(esc).join("<br>") + "</dd></div>" +
      '<div><dt>Сумма</dt><dd class="num dr-sum">' + S.fmtMoney(b.price) + ' <span class="muted">· ' + S.fmtDur(b.dur) + "</span></dd></div>" +
      (b.comment ? "<div><dt>Комментарий</dt><dd>" + esc(b.comment) + "</dd></div>" : "") +
      "<div><dt>Напоминание</dt><dd>" + (b.remind ? "SMS за 2 часа" : "Не нужно") + "</dd></div>" +
      "</dl>" +
      '<fieldset class="dr-block seg"><legend class="dr-label">Статус визита</legend><div class="seg__row">' +
      ["confirmed", "arrived", "noshow"]
        .map(
          (s) =>
            '<label class="seg__opt seg__opt--' + s + '"><input class="seg__input" type="radio" name="status" value="' + s + '"' + (b.status === s ? " checked" : "") + ">" +
            '<span class="seg__face">' + icon(STATUS[s].icon) + STATUS[s].label + "</span></label>"
        )
        .join("") +
      "</div></fieldset>" +
      '<form class="dr-block move" id="move-form" novalidate>' +
      '<p class="dr-label">' + icon("swap") + "Перенести запись</p>" +
      '<div class="move__grid">' +
      '<div class="field"><label class="field__label" for="mv-master">Мастер</label><select class="input select" id="mv-master">' + masterOptions(b.masterId) + "</select></div>" +
      '<div class="field"><label class="field__label" for="mv-date">Дата</label><input class="input num" type="date" id="mv-date" value="' + b.date + '"></div>' +
      '<div class="field"><label class="field__label" for="mv-time">Время</label><select class="input select num" id="mv-time" aria-describedby="mv-err"></select></div>' +
      "</div>" +
      '<p class="field__error" id="mv-err" hidden></p>' +
      '<button class="btn btn--secondary" type="submit" id="mv-submit">' + icon("swap") + "<span>Перенести</span></button>" +
      "</form>" +
      '<div class="dr-block dr-danger">' +
      '<button class="btn btn--danger-outline" type="button" id="dr-cancel">' + icon("calendar-x") + "<span>Отменить запись</span></button>" +
      '<p class="muted dr-note">Время освободится для онлайн-записи.</p>' +
      "</div>";
    openDrawer("Запись № " + b.code, html, trigger);

    /* Статус */
    $$(".seg__input", $("#drawer-body")).forEach((r) =>
      r.addEventListener("change", () => {
        S.update(b.id, { status: r.value });
        $(".dr-head .status").outerHTML = statusHtml(r.value);
        refresh();
        U.toast("Статус: " + STATUS[r.value].label.toLowerCase());
      })
    );

    /* Перенос */
    const mvMaster = $("#mv-master");
    const mvDate = $("#mv-date");
    const mvTime = $("#mv-time");
    const err = $("#mv-err");
    const fillTimes = () => {
      const t = timeOptions(mvMaster.value, mvDate.value, b.dur, b.id, Number(mvTime.value) || b.start);
      mvTime.innerHTML = t.html;
      if (!t.works) showMoveErr(S.masterById(mvMaster.value).short + " не работает в этот день. Выберите другую дату или мастера.");
      else if (!t.anyFree) showMoveErr("На этот день у мастера нет окна на " + S.fmtDur(b.dur) + ".");
      else showMoveErr("");
      if (mvTime.selectedOptions.length && mvTime.selectedOptions[0].disabled) {
        const firstFree = Array.from(mvTime.options).find((o) => !o.disabled);
        if (firstFree) firstFree.selected = true;
      }
    };
    const showMoveErr = (msg) => {
      if (msg) {
        err.hidden = false;
        err.innerHTML = icon("alert") + "<span>" + esc(msg) + "</span>";
        mvTime.setAttribute("aria-invalid", "true");
      } else {
        err.hidden = true;
        err.textContent = "";
        mvTime.removeAttribute("aria-invalid");
      }
    };
    fillTimes();
    mvMaster.addEventListener("change", fillTimes);
    mvDate.addEventListener("change", () => /^\d{4}-\d{2}-\d{2}$/.test(mvDate.value) && fillTimes());
    $("#move-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const masterId = mvMaster.value;
      const key = mvDate.value;
      const start = Number(mvTime.value);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return showMoveErr("Укажите дату переноса.");
      if (!S.worksOn(masterId, key)) return showMoveErr(S.masterById(masterId).short + " не работает в этот день.");
      if (masterId === b.masterId && key === b.date && start === b.start) return showMoveErr("Выберите новое время, дату или мастера: сейчас запись стоит именно так.");
      if (!mvTime.value || !S.isFree(masterId, key, start, b.dur, b.id))
        return showMoveErr("В это время у мастера уже есть запись. Выберите свободное время из списка.");
      const price = S.totals(b.services, masterId).price;
      S.update(b.id, { masterId, date: key, start, price });
      const target = S.masterById(masterId);
      U.toast("Перенесено: " + S.fmtDate(key, { short: true }) + ", " + S.fmtTime(start) + ", " + target.short);
      returnTo = b.id;
      closeDrawer();
      if (key !== view.date) go("day", key);
      else refresh();
    });

    /* Отмена */
    $("#dr-cancel").addEventListener("click", () => {
      U.confirmAction({
        title: "Отменить запись " + b.code + "?",
        text: b.name + ", " + S.fmtDate(b.date, { weekday: true }) + ", " + S.fmtTime(b.start) + ". Клиент увидит отмену в своих записях, время освободится.",
        confirm: "Отменить запись",
        keep: "Не отменять"
      }).then((ok) => {
        if (!ok) return;
        S.cancel(b.id, "admin");
        returnTo = null;
        closeDrawer();
        refresh();
        U.toast("Запись " + b.code + " отменена", "danger");
      });
    });
  }

  function openCreate(pre, trigger) {
    const key = pre.date || view.date;
    const masterId = pre.masterId || D.masters.find((m) => S.worksOn(m.id, key)).id;
    /* Подбираем услугу по умолчанию, которая помещается в выбранное окно */
    let services = [];
    if (pre.start != null) {
      if (S.isFree(masterId, key, pre.start, 60)) services = ["cut"];
      else if (S.isFree(masterId, key, pre.start, 30)) services = ["clipper"];
    }
    const html =
      '<form class="create" id="create-form" novalidate>' +
      '<fieldset class="dr-block create__svc" aria-describedby="cr-svc-err"><legend class="dr-label">Услуги</legend>' +
      '<div class="mini-svc">' +
      D.services
        .map(
          (s) =>
            '<label class="mini-svc__opt"><input class="mini-svc__input" type="checkbox" name="cr-svc" value="' + s.id + '"' + (services.includes(s.id) ? " checked" : "") + ">" +
            '<span class="mini-svc__box" aria-hidden="true">' + icon("check") + "</span>" +
            '<span class="mini-svc__name">' + esc(s.name) + '</span><span class="mini-svc__meta num">' + S.fmtDur(s.dur) + "</span></label>"
        )
        .join("") +
      "</div>" +
      '<p class="field__error" id="cr-svc-err" hidden></p>' +
      "</fieldset>" +
      '<div class="move__grid">' +
      '<div class="field"><label class="field__label" for="cr-master">Мастер</label><select class="input select" id="cr-master">' + masterOptions(masterId) + "</select></div>" +
      '<div class="field"><label class="field__label" for="cr-date">Дата</label><input class="input num" type="date" id="cr-date" value="' + key + '"></div>' +
      '<div class="field"><label class="field__label" for="cr-time">Время</label><select class="input select num" id="cr-time" aria-describedby="cr-time-err"></select></div>' +
      "</div>" +
      '<p class="field__error create__time-err" id="cr-time-err" hidden></p>' +
      '<div class="field"><label class="field__label" for="cr-name">Имя клиента</label><input class="input" id="cr-name" type="text" autocomplete="off" maxlength="40" aria-describedby="cr-name-err"><p class="field__error" id="cr-name-err" hidden></p></div>' +
      '<div class="field"><label class="field__label" for="cr-phone">Телефон</label><input class="input num" id="cr-phone" type="tel" inputmode="tel" autocomplete="off" placeholder="+7 (___) ___-__-__" aria-describedby="cr-phone-err"><p class="field__error" id="cr-phone-err" hidden></p></div>' +
      '<div class="field"><label class="field__label" for="cr-comment">Комментарий <span class="muted">необязательно</span></label><textarea class="input input--area" id="cr-comment" rows="2" maxlength="300"></textarea></div>' +
      '<p class="create__total" id="cr-total" aria-live="polite"></p>' +
      '<button class="btn btn--primary btn--block" type="submit" id="cr-submit">' + icon("plus") + "<span>Создать запись</span></button>" +
      "</form>";
    openDrawer("Новая запись", html, trigger);

    const form = $("#create-form");
    const crMaster = $("#cr-master");
    const crDate = $("#cr-date");
    const crTime = $("#cr-time");
    const chosen = () => $$(".mini-svc__input:checked", form).map((i) => i.value);
    const timeErr = (msg) => {
      const box = $("#cr-time-err");
      if (msg) {
        box.hidden = false;
        box.innerHTML = icon("alert") + "<span>" + esc(msg) + "</span>";
        crTime.setAttribute("aria-invalid", "true");
      } else {
        box.hidden = true;
        box.textContent = "";
        crTime.removeAttribute("aria-invalid");
      }
    };
    let wanted = pre.start != null ? pre.start : null;
    const fill = () => {
      const svc = chosen();
      const dur = Math.max(SHOP.step, S.totals(svc).dur || 30);
      const t = timeOptions(crMaster.value, crDate.value, dur, null, wanted);
      crTime.innerHTML = t.html;
      const sel = crTime.selectedOptions[0];
      if (!sel || sel.disabled || Number(sel.value) !== wanted) {
        /* Для сегодняшнего дня по умолчанию предлагаем ближайшее будущее время */
        const from = crDate.value === S.todayKey() ? S.earliestStart(crDate.value) : 0;
        const opts = Array.from(crTime.options).filter((o) => !o.disabled);
        const firstFree = opts.find((o) => Number(o.value) >= from) || opts[0];
        if (firstFree && (wanted == null || !Array.from(crTime.options).some((o) => Number(o.value) === wanted && !o.disabled))) firstFree.selected = true;
      }
      if (!t.works) timeErr(S.masterById(crMaster.value).short + " не работает в этот день.");
      else if (!t.anyFree) timeErr("Нет окна на " + S.fmtDur(dur) + ". Выберите другой день, мастера или услуги покороче.");
      else if (wanted != null && !S.isFree(crMaster.value, crDate.value, wanted, dur)) timeErr("На " + S.fmtTime(wanted) + " не помещается " + S.fmtDur(dur) + ". Подставлено ближайшее свободное время.");
      else timeErr("");
      const tot = S.totals(svc, crMaster.value);
      $("#cr-total").innerHTML = svc.length ? "Итого: <strong class=\"num\">" + S.fmtMoney(tot.price) + "</strong> · " + S.fmtDur(tot.dur) : "Выберите хотя бы одну услугу";
    };
    fill();
    form.addEventListener("change", (e) => {
      if (e.target === crTime) {
        wanted = Number(crTime.value);
        timeErr("");
        return;
      }
      if (e.target.classList.contains("mini-svc__input")) U.setFieldError(e.target, "");
      fill();
    });
    U.bindPhoneMask($("#cr-phone"));

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const svc = chosen();
      const name = $("#cr-name");
      const phone = $("#cr-phone");
      let firstBad = null;
      const svcErr = $("#cr-svc-err");
      if (!svc.length) {
        svcErr.hidden = false;
        svcErr.innerHTML = icon("alert") + "<span>Отметьте хотя бы одну услугу</span>";
        firstBad = firstBad || $(".mini-svc__input", form);
      } else {
        svcErr.hidden = true;
      }
      const nm = name.value.trim();
      U.setFieldError(name, nm.length < 2 ? "Введите имя клиента, минимум две буквы" : "");
      if (nm.length < 2) firstBad = firstBad || name;
      const pd = U.phoneDigits(phone.value);
      U.setFieldError(phone, pd.length === 11 ? "" : pd.length <= 1 ? "Введите телефон клиента" : "Нужно 10 цифр после +7");
      if (pd.length !== 11) firstBad = firstBad || phone;
      const dur = S.totals(svc).dur;
      const start = Number(crTime.value);
      if (svc.length && (!crTime.value || !S.isFree(crMaster.value, crDate.value, start, dur))) {
        timeErr("Это время пересекается с другой записью мастера. Выберите свободное время.");
        firstBad = firstBad || crTime;
      }
      if (firstBad) {
        firstBad.focus();
        return;
      }
      const btn = $("#cr-submit");
      U.setBusy(btn, true, "Создаём");
      setTimeout(() => {
        const b = S.create({
          masterId: crMaster.value,
          date: crDate.value,
          start,
          services: svc,
          name: nm,
          phone: U.formatPhone(phone.value),
          comment: $("#cr-comment").value.trim(),
          remind: false,
          source: "admin"
        });
        returnTo = b.id;
        closeDrawer();
        if (b.date !== view.date) go("day", b.date);
        else refresh();
        U.toast("Запись создана: " + b.name + ", " + S.fmtTime(b.start));
      }, 400);
    });
  }

  /* ---------- Неделя ---------- */
  function weekData(monday) {
    const today = S.todayKey();
    const days = [];
    for (let i = 0; i < 7; i++) {
      const key = S.addDays(monday, i);
      days.push(Object.assign({ key, future: key > today, isToday: key === today }, S.dayStats(key)));
    }
    return days;
  }

  function niceMax(v) {
    if (v <= 0) return 20000;
    const step = 20000;
    return Math.ceil((v * 1.05) / step) * step;
  }

  function chartSvg(days, width) {
    const H = 260;
    const padL = 56;
    const padR = 8;
    const padT = 24;
    const padB = 52;
    const plotW = Math.max(200, width - padL - padR);
    const plotH = H - padT - padB;
    const max = niceMax(Math.max(...days.map((d) => d.revenue)));
    const band = plotW / days.length;
    const barW = Math.min(56, band * 0.62);
    const y = (v) => padT + plotH - (v / max) * plotH;
    let grid = "";
    for (let i = 0; i <= 4; i++) {
      const v = (max / 4) * i;
      const yy = y(v).toFixed(1);
      grid += '<line class="chart__grid' + (i === 0 ? " chart__grid--base" : "") + '" x1="' + padL + '" x2="' + (padL + plotW) + '" y1="' + yy + '" y2="' + yy + '"/>';
      grid += '<text class="chart__axis" x="' + (padL - 8) + '" y="' + yy + '" dy="0.32em" text-anchor="end">' + (v ? Math.round(v / 1000) + " тыс" : "0") + "</text>";
    }
    const r = 4;
    const bars = days
      .map((d, i) => {
        const cx = padL + band * i + band / 2;
        const x = cx - barW / 2;
        const top = y(d.revenue);
        const h = Math.max(0, padT + plotH - top);
        const rr = Math.min(r, h / 2);
        const path = h
          ? "M" + x.toFixed(1) + "," + (padT + plotH) + "V" + (top + rr).toFixed(1) + "Q" + x.toFixed(1) + "," + top.toFixed(1) + " " + (x + rr).toFixed(1) + "," + top.toFixed(1) +
            "H" + (x + barW - rr).toFixed(1) + "Q" + (x + barW).toFixed(1) + "," + top.toFixed(1) + " " + (x + barW).toFixed(1) + "," + (top + rr).toFixed(1) + "V" + (padT + plotH) + "Z"
          : "";
        const wd = S.WD_SHORT[S.weekday(d.key)];
        const label = cap(S.fmtDate(d.key, { weekday: true })) + ": выручка " + S.fmtMoney(d.revenue) + (d.future ? " (план)" : "") + ", загрузка " + Math.round(d.load * 100) + "%, записей " + d.count;
        return (
          '<a class="chart__bar' + (d.future ? " is-future" : "") + (d.isToday ? " is-today" : "") + '" href="#/admin/day/' + d.key + '" aria-label="' + esc(label) + '" data-i="' + i + '">' +
          '<rect class="chart__hit" x="' + (cx - band / 2).toFixed(1) + '" y="' + padT + '" width="' + band.toFixed(1) + '" height="' + (plotH + padB) + '"/>' +
          (path ? '<path class="chart__fill" d="' + path + '"/>' : "") +
          '<text class="chart__day" x="' + cx.toFixed(1) + '" y="' + (padT + plotH + 20) + '" text-anchor="middle">' + wd + " " + S.parseKey(d.key).getDate() + "</text>" +
          '<text class="chart__load" x="' + cx.toFixed(1) + '" y="' + (padT + plotH + 38) + '" text-anchor="middle">' + Math.round(d.load * 100) + "%</text>" +
          "</a>"
        );
      })
      .join("");
    return (
      '<svg class="chart__svg" width="' + width + '" height="' + H + '" viewBox="0 0 ' + width + " " + H + '" role="group" aria-label="Выручка по дням недели">' +
      '<defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect class="chart__hatch-bg" width="6" height="6"/><line class="chart__hatch" x1="0" y1="0" x2="0" y2="6"/></pattern></defs>' +
      grid +
      bars +
      "</svg>"
    );
  }

  function renderWeek(key, focusTitle) {
    const monday = S.mondayOf(key);
    view = { tab: "week", date: monday };
    const days = weekData(monday);
    const sunday = S.addDays(monday, 6);
    const total = days.reduce((s, d) => s + d.revenue, 0);
    const count = days.reduce((s, d) => s + d.count, 0);
    const avgLoad = days.reduce((s, d) => s + d.load, 0) / days.length;
    const best = days.slice().sort((a, b) => b.revenue - a.revenue)[0];
    const pm = S.parseKey(monday);
    const ps = S.parseKey(sunday);
    const range = pm.getMonth() === ps.getMonth() ? pm.getDate() + "-" + S.fmtDate(sunday) : S.fmtDate(monday) + " - " + S.fmtDate(sunday);
    const thisWeek = S.mondayOf(S.todayKey()) === monday;
    document.title = "Неделя " + range + ". Сталь, администратор";

    main().innerHTML =
      '<section class="week" aria-labelledby="week-title">' +
      '<div class="toolbar">' +
      '<div class="toolbar__heading"><p class="kicker">' + (thisWeek ? "Текущая неделя" : "Неделя") + "</p>" +
      '<h1 class="admin-title num" id="week-title" tabindex="-1">' + esc(range) + "</h1></div>" +
      '<div class="toolbar__controls">' +
      '<div class="date-nav">' +
      '<button class="icon-btn icon-btn--framed" type="button" id="wk-prev" aria-label="Предыдущая неделя">' + icon("chevron-left") + "</button>" +
      '<button class="icon-btn icon-btn--framed" type="button" id="wk-next" aria-label="Следующая неделя">' + icon("chevron-right") + "</button>" +
      "</div>" +
      (thisWeek ? "" : '<button class="btn btn--secondary btn--sm" type="button" id="wk-today">Текущая неделя</button>') +
      "</div></div>" +
      '<div class="kpis">' +
      '<div class="kpi kpi--lead"><p class="kpi__label">Выручка за неделю</p><p class="kpi__value num">' + S.fmtMoney(total) + '</p><p class="kpi__sub">Факт по прошедшим дням и план по записям на будущие</p></div>' +
      '<div class="kpi"><p class="kpi__label">Записей</p><p class="kpi__value num">' + count + '</p><p class="kpi__sub">' + Math.round(count / 7) + " в день в среднем</p></div>" +
      '<div class="kpi"><p class="kpi__label">Средняя загрузка</p><p class="kpi__value num">' + Math.round(avgLoad * 100) + '%</p><span class="meter" aria-hidden="true"><span class="meter__fill" style="--v:' + avgLoad.toFixed(3) + '"></span></span></div>' +
      '<div class="kpi"><p class="kpi__label">Лучший день</p><p class="kpi__value">' + (best.revenue ? cap(S.WD_LONG[S.weekday(best.key)]) : "-") + '</p><p class="kpi__sub num">' + (best.revenue ? S.fmtMoney(best.revenue) : "Нет записей") + "</p></div>" +
      "</div>" +
      '<div class="chart card">' +
      '<div class="chart__head"><h2 class="chart__title">Выручка по дням</h2>' +
      '<ul class="chart__legend"><li><span class="swatch swatch--fact" aria-hidden="true"></span>Факт и сегодня</li><li><span class="swatch swatch--plan" aria-hidden="true"></span>План по записям</li><li><span class="chart__legend-pct">%</span>Загрузка мастеров</li></ul></div>' +
      '<div class="chart__box" id="chart-box"></div>' +
      '<div class="chart__tip" id="chart-tip" hidden></div>' +
      "</div>" +
      '<div class="table-wrap card"><table class="table">' +
      '<caption class="sr-only">Сводка по дням недели</caption>' +
      '<thead><tr><th scope="col">День</th><th scope="col" class="t-num">Записей</th><th scope="col">Загрузка</th><th scope="col" class="t-num">Выручка</th></tr></thead><tbody>' +
      days
        .map(
          (d) =>
            "<tr" + (d.isToday ? ' class="is-today"' : "") + '><th scope="row"><a class="link" href="#/admin/day/' + d.key + '">' + esc(cap(S.fmtDate(d.key, { weekday: true, short: true }))) + "</a>" + (d.isToday ? ' <span class="tag">сегодня</span>' : "") + "</th>" +
            '<td class="t-num num">' + d.count + "</td>" +
            '<td><span class="t-load"><span class="meter meter--inline" aria-hidden="true"><span class="meter__fill" style="--v:' + d.load.toFixed(3) + '"></span></span><span class="num">' + Math.round(d.load * 100) + "%</span></span></td>" +
            '<td class="t-num num">' + S.fmtMoney(d.revenue) + (d.future ? ' <span class="muted">план</span>' : "") + "</td></tr>"
        )
        .join("") +
      '</tbody><tfoot><tr><th scope="row">Итого</th><td class="t-num num">' + count + '</td><td><span class="num">' + Math.round(avgLoad * 100) + '%</span></td><td class="t-num num">' + S.fmtMoney(total) + "</td></tr></tfoot>" +
      "</table></div>" +
      "</section>";

    $("#wk-prev").addEventListener("click", () => go("week", S.addDays(monday, -7)));
    $("#wk-next").addEventListener("click", () => go("week", S.addDays(monday, 7)));
    const tb = $("#wk-today");
    if (tb) tb.addEventListener("click", () => go("week", S.mondayOf(S.todayKey())));
    drawChart(days);
    if (focusTitle) $("#week-title").focus({ preventScroll: true });
  }

  let chartDays = null;
  function drawChart(days) {
    chartDays = days || chartDays;
    const box = $("#chart-box");
    if (!box || !chartDays) return;
    box.innerHTML = chartSvg(chartDays, Math.floor(box.clientWidth));
    const tip = $("#chart-tip");
    const show = (a) => {
      const d = chartDays[Number(a.dataset.i)];
      tip.innerHTML =
        "<strong>" + esc(cap(S.fmtDate(d.key, { weekday: true }))) + "</strong>" +
        '<span class="num">Выручка: ' + S.fmtMoney(d.revenue) + (d.future ? " (план)" : "") + "</span>" +
        '<span class="num">Загрузка: ' + Math.round(d.load * 100) + "%, записей: " + d.count + "</span>";
      tip.hidden = false;
      const br = a.getBoundingClientRect();
      const cr = box.getBoundingClientRect();
      const tw = tip.offsetWidth;
      let left = br.left - cr.left + br.width / 2 - tw / 2;
      left = Math.max(0, Math.min(cr.width - tw, left));
      tip.style.setProperty("--tip-x", left.toFixed(0));
    };
    $$(".chart__bar", box).forEach((a) => {
      a.addEventListener("mouseenter", () => show(a));
      a.addEventListener("focus", () => show(a));
      a.addEventListener("mouseleave", () => (tip.hidden = true));
      a.addEventListener("blur", () => (tip.hidden = true));
    });
  }
  let rsz = null;
  window.addEventListener("resize", () => {
    clearTimeout(rsz);
    rsz = setTimeout(() => {
      if (view.tab === "week" && $("#chart-box")) drawChart();
    }, 120);
  });

  /* ---------- Общие обработчики ---------- */
  function init() {
    const d = drawer();
    d.addEventListener("close", () => {
      $("#drawer-body").innerHTML = "";
      restoreFocus();
    });
    d.querySelector("[data-close]").addEventListener("click", closeDrawer);
    U.closeOnBackdrop(d);
    U.closeOnBackdrop($("#confirm"));

    $("#reset-demo").addEventListener("click", () => {
      U.confirmAction({
        title: "Сбросить демо-данные?",
        text: "Все записи, включая сделанные в клиентской части и созданные вами здесь, удалятся. Расписание заполнится заново демо-записями на 14 дней.",
        confirm: "Сбросить демо-данные",
        keep: "Оставить как есть"
      }).then((ok) => {
        if (!ok) return;
        S.resetDemo();
        window.App.updateMineCount();
        refresh();
        U.toast("Демо-данные сброшены", "danger");
        const h = $("h1", main());
        if (h) h.focus();
      });
    });
    $("#admin-logout").addEventListener("click", () => {
      S.setAdmin(false);
      location.hash = "#/admin";
    });
  }

  window.Admin = {
    init,
    login: renderLogin,
    day: renderDay,
    week: renderWeek,
    refresh,
    closeDrawer,
    stopTimers() {
      clearInterval(nowTimer);
    }
  };
})();
