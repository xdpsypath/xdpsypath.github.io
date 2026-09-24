/* Hash-роутер: #/ запись, #/my мои записи, #/booking/<id> подтверждение,
   #/admin вход, #/admin/day/<дата> расписание, #/admin/week/<дата> неделя */
(function () {
  "use strict";

  const S = window.Store;
  const U = window.UI;
  const { $ } = U;

  const clientShell = $("#client-shell");
  const adminShell = $("#admin-shell");
  const skip = $(".skip-link");
  let firstRender = true;
  let lastRoute = "";

  function updateMineCount() {
    const n = S.mine().filter((b) => b.status !== "cancelled" && (b.date > S.todayKey() || (b.date === S.todayKey() && b.start + b.dur > S.nowMinutes()))).length;
    const badge = $("#mine-count");
    badge.hidden = !n;
    badge.textContent = n;
    $("#mine-link").setAttribute("aria-label", "Мои записи" + (n ? ", предстоящих: " + n : ""));
  }

  function parse() {
    /* Обратные слэши нормализуем: некоторые инструменты передают путь с "\" */
    const raw = decodeURIComponent(location.hash || "").replace(/\\/g, "/").replace(/^#/, "");
    const parts = raw.split("/").filter(Boolean);
    return parts;
  }

  const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || "");

  function setMode(admin) {
    clientShell.hidden = admin;
    adminShell.hidden = !admin;
    skip.setAttribute("href", admin ? "#admin-main" : "#main");
    document.body.classList.toggle("is-admin", admin);
  }

  function setAdminChrome(entered, tab) {
    $("#admin-nav").hidden = !entered;
    $("#admin-actions").hidden = !entered;
    document.querySelectorAll(".admin-nav__link").forEach((a) => {
      if (a.dataset.tab === tab) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
  }

  function route() {
    const parts = parse();
    const key = parts.join("/");
    const focus = !firstRender && key !== lastRoute;
    lastRoute = key;
    window.Admin.stopTimers();
    const drawer = $("#drawer");
    if (drawer.open && parts[0] !== "admin") drawer.close();

    if (parts[0] === "admin") {
      setMode(true);
      const entered = S.adminEntered();
      const sub = parts[1];
      if (!sub) {
        if (entered) {
          location.replace("#/admin/day");
          return;
        }
        setAdminChrome(false);
        window.Admin.login();
      } else if (sub === "week") {
        /* Прямая ссылка открывает панель: авторизации нет, это демо */
        if (!entered) S.setAdmin(true);
        setAdminChrome(true, "week");
        window.Admin.week(isDate(parts[2]) ? parts[2] : S.todayKey(), focus);
      } else {
        if (!entered) S.setAdmin(true);
        setAdminChrome(true, "day");
        window.Admin.day(isDate(parts[2]) ? parts[2] : S.todayKey(), focus);
      }
      if (focus && !sub) {
        const h = $("#admin-main h1");
        if (h) h.focus({ preventScroll: true });
      }
      if (focus) window.scrollTo(0, 0);
    } else {
      setMode(false);
      if (parts[0] === "my") {
        window.Client.mine();
        if (focus) $("#main h1").focus({ preventScroll: true });
        if (focus) window.scrollTo(0, 0);
      } else if (parts[0] === "booking" && parts[1]) {
        window.Client.done(parts[1]);
        if (focus) $("#main h1").focus({ preventScroll: true });
        if (focus) window.scrollTo(0, 0);
      } else {
        window.Client.wizard(focus);
      }
      updateMineCount();
    }
    firstRender = false;
  }

  window.App = { updateMineCount };

  window.Admin.init();
  window.addEventListener("hashchange", route);
  /* Изменения из другой вкладки: запись клиента сразу видна в открытой админке */
  window.addEventListener("storage", (e) => {
    if (!e.key || e.key.indexOf("stal.") !== 0) return;
    S.reload();
    if (!adminShell.hidden) window.Admin.refresh();
    else updateMineCount();
  });
  route();
})();
