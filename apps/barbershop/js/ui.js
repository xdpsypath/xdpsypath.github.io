/* Общие UI-помощники: экранирование, иконки, тосты, диалог подтверждения, маска телефона, .ics */
(function () {
  "use strict";

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ESC[c]);

  const icon = (name, cls) =>
    '<svg class="icon' + (cls ? " " + cls : "") + '" aria-hidden="true" focusable="false"><use href="#i-' + name + '"/></svg>';

  const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Тосты ---------- */
  function toast(text, kind) {
    const region = $("#toasts");
    const el = document.createElement("div");
    el.className = "toast" + (kind ? " toast--" + kind : "");
    el.innerHTML = icon(kind === "danger" ? "calendar-x" : "circle-check") + "<span>" + esc(text) + "</span>";
    region.appendChild(el);
    requestAnimationFrame(() => el.classList.add("is-in"));
    setTimeout(() => {
      el.classList.remove("is-in");
      setTimeout(() => el.remove(), reduceMotion() ? 0 : 250);
    }, 4200);
  }

  /* ---------- Подтверждение деструктивного действия ----------
     Кнопка подтверждения повторяет действие; фокус возвращается на кнопку-триггер. */
  function confirmAction(opts) {
    const dlg = $("#confirm");
    const trigger = document.activeElement;
    $("#confirm-title").textContent = opts.title;
    $("#confirm-text").textContent = opts.text;
    $("#confirm-yes").textContent = opts.confirm;
    $("#confirm-no").textContent = opts.keep || "Не отменять";
    dlg.returnValue = "";
    return new Promise((resolve) => {
      const done = () => {
        dlg.removeEventListener("close", done);
        const ok = dlg.returnValue === "ok";
        resolve(ok);
        if (!ok && trigger && document.contains(trigger)) trigger.focus();
      };
      dlg.addEventListener("close", done);
      dlg.showModal();
      $("#confirm-no").focus();
    });
  }

  /* Клик по подложке закрывает модальные окна */
  function closeOnBackdrop(dlg) {
    dlg.addEventListener("click", (e) => {
      if (e.target === dlg) dlg.close("cancel");
    });
  }

  /* ---------- Телефон: маска +7 (XXX) XXX-XX-XX ---------- */
  function phoneDigits(value) {
    let d = String(value).replace(/\D/g, "");
    if (d.startsWith("8")) d = "7" + d.slice(1);
    if (d && !d.startsWith("7")) d = "7" + d;
    return d.slice(0, 11);
  }
  function formatPhone(value) {
    const d = phoneDigits(value);
    if (!d) return "";
    const p = d.slice(1);
    let out = "+7";
    if (p.length) out += " (" + p.slice(0, 3);
    if (p.length >= 3) out += ")";
    if (p.length > 3) out += " " + p.slice(3, 6);
    if (p.length > 6) out += "-" + p.slice(6, 8);
    if (p.length > 8) out += "-" + p.slice(8, 10);
    return out;
  }
  function bindPhoneMask(input) {
    input.addEventListener("input", (e) => {
      /* Стирание разделителя не должно «застревать»: при удалении пересчитываем по цифрам */
      const deleting = e.inputType && e.inputType.startsWith("delete");
      const d = phoneDigits(input.value);
      input.value = deleting && d.length <= 1 ? "" : formatPhone(input.value);
    });
    input.addEventListener("focus", () => {
      if (!input.value) input.value = "+7 ";
    });
    input.addEventListener("blur", () => {
      if (phoneDigits(input.value).length <= 1) input.value = "";
    });
  }
  const phoneValid = (v) => phoneDigits(v).length === 11;

  /* ---------- Ошибки полей ---------- */
  function setFieldError(input, message) {
    const field = input.closest(".field");
    const box = field && field.querySelector(".field__error");
    if (!box) return;
    if (message) {
      box.innerHTML = icon("alert") + "<span>" + esc(message) + "</span>";
      box.hidden = false;
      input.setAttribute("aria-invalid", "true");
      field.classList.add("is-invalid");
    } else {
      box.hidden = true;
      box.textContent = "";
      input.removeAttribute("aria-invalid");
      field.classList.remove("is-invalid");
    }
  }

  /* ---------- Кнопка в состоянии загрузки ---------- */
  function setBusy(btn, busy, label) {
    if (busy) {
      btn.dataset.label = btn.innerHTML;
      btn.setAttribute("aria-busy", "true");
      btn.classList.add("is-loading");
      btn.innerHTML = '<span class="spinner" aria-hidden="true"></span><span>' + esc(label || "Сохраняем") + "</span>";
    } else {
      btn.removeAttribute("aria-busy");
      btn.classList.remove("is-loading");
      if (btn.dataset.label) btn.innerHTML = btn.dataset.label;
    }
  }

  /* ---------- Календарь .ics ---------- */
  function icsStamp(date) {
    const p = (n) => String(n).padStart(2, "0");
    return (
      date.getUTCFullYear() + p(date.getUTCMonth() + 1) + p(date.getUTCDate()) + "T" +
      p(date.getUTCHours()) + p(date.getUTCMinutes()) + p(date.getUTCSeconds()) + "Z"
    );
  }
  function icsLocal(key, minutes) {
    const p = (n) => String(n).padStart(2, "0");
    return key.replace(/-/g, "") + "T" + p(Math.floor(minutes / 60)) + p(minutes % 60) + "00";
  }
  const icsText = (s) => String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

  function downloadIcs(b) {
    const S = window.Store;
    const shop = S.SHOP;
    const master = S.masterById(b.masterId);
    const names = b.services.map((id) => S.serviceById(id).name).join(", ");
    /* Время «плавающее» (без часового пояса): событие встаёт на то же локальное время */
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Stal barbershop demo//RU",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      "UID:" + b.id + "@stal-demo.local",
      "DTSTAMP:" + icsStamp(new Date()),
      "DTSTART:" + icsLocal(b.date, b.start),
      "DTEND:" + icsLocal(b.date, b.start + b.dur),
      "SUMMARY:" + icsText("Барбершоп «Сталь»: " + names),
      "LOCATION:" + icsText(shop.address),
      "DESCRIPTION:" + icsText("Мастер: " + master.name + "\nНомер записи: " + b.code + "\nСумма: " + b.price + " руб.\nТелефон: " + shop.phone)
    ];
    if (b.remind) {
      lines.push("BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + icsText("Скоро визит в «Сталь»"), "TRIGGER:-PT2H", "END:VALARM");
    }
    lines.push("END:VEVENT", "END:VCALENDAR");
    const blob = new Blob([lines.join("\r\n") + "\r\n"], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "stal-" + b.code.replace(/\D/g, "") + "-" + b.date + ".ics";
    a.hidden = true;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 1000);
  }

  window.UI = {
    $,
    $$,
    esc,
    icon,
    reduceMotion,
    toast,
    confirmAction,
    closeOnBackdrop,
    phoneDigits,
    formatPhone,
    bindPhoneMask,
    phoneValid,
    setFieldError,
    setBusy,
    downloadIcs
  };
})();
