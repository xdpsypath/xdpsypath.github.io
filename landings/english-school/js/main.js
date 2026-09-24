(function () {
  "use strict";

  const root = document.documentElement;
  root.classList.add("js");

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Облачка диалога в первом экране появляются после загрузки
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add("is-loaded")));

  /* ---------- Шапка и меню ---------- */

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

  /* ---------- Тест уровня ---------- */

  const QUESTIONS = [
    { text: "I ___ to the cinema yesterday.", options: ["go", "went", "have gone"], answer: 1 },
    { text: "She has been working here ___ 2019.", options: ["for", "since", "from"], answer: 1 },
    { text: "If I ___ more free time, I would travel more.", options: ["have", "had", "will have"], answer: 1 },
    { text: "I'm really looking forward ___ you next week.", options: ["to see", "seeing", "to seeing"], answer: 2 },
    { text: "Hardly ___ the meeting started when the fire alarm went off.", options: ["had", "did", "has"], answer: 0 },
  ];

  const LEVELS = [
    { max: 1, code: "A2", name: "Elementary", advice: "Начните с группы «Старт»: базовая грамматика через разговор, без зубрёжки правил.", group: "группу A2" },
    { max: 3, code: "B1", name: "Intermediate", advice: "Вы понимаете много, но говорите с паузами. Мини-группа B1 уберёт этот барьер за 3-4 месяца.", group: "группу B1" },
    { max: 4, code: "B2", name: "Upper-Intermediate", advice: "Хорошая база. Подойдёт группа B2 или разговорный клуб, чтобы говорить свободнее и точнее.", group: "группу B2" },
    { max: 5, code: "C1", name: "Advanced", advice: "Отличный результат. Рекомендуем разговорный клуб и индивидуальные уроки под рабочие задачи.", group: "разговорный клуб C1" },
  ];

  const quizForm = $("#quiz-form");
  const legend = $("#quiz-legend");
  const optionsBox = $("#quiz-options");
  const count = $("#quiz-count");
  const progress = $("#quiz-progress");
  const bar = $(".progress__bar", progress);
  const back = $("#quiz-back");
  const next = $("#quiz-next");
  const result = $("#quiz-result");
  const keys = ["A", "B", "C"];

  let step = 0;
  let answers = [];
  let detectedLevel = null;

  const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  function renderQuestion() {
    const q = QUESTIONS[step];
    legend.innerHTML = escapeHtml(q.text).replace("___", '<span class="gap"><span class="visually-hidden">пропуск</span></span>');
    optionsBox.innerHTML = q.options
      .map(
        (opt, i) => `
        <label class="answer">
          <input type="radio" name="q" value="${i}" ${answers[step] === i ? "checked" : ""} />
          <span data-key="${keys[i]}">${escapeHtml(opt)}</span>
        </label>`
      )
      .join("");

    count.textContent = `Вопрос ${step + 1} из ${QUESTIONS.length}`;
    progress.setAttribute("aria-valuenow", String(step + 1));
    bar.style.width = ((step + 1) / QUESTIONS.length) * 100 + "%";
    back.disabled = step === 0;
    next.disabled = answers[step] === undefined;
    $(".btn__label", next).textContent = step === QUESTIONS.length - 1 ? "Узнать уровень" : "Дальше";
  }

  optionsBox.addEventListener("change", (e) => {
    answers[step] = Number(e.target.value);
    next.disabled = false;
  });

  back.addEventListener("click", () => {
    if (step === 0) return;
    step -= 1;
    renderQuestion();
    legend.focus?.();
  });

  quizForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (answers[step] === undefined) return;

    if (step < QUESTIONS.length - 1) {
      step += 1;
      renderQuestion();
      $("input", optionsBox).focus();
      return;
    }
    showResult();
  });

  function showResult() {
    const score = answers.reduce((sum, a, i) => sum + (a === QUESTIONS[i].answer ? 1 : 0), 0);
    detectedLevel = LEVELS.find((l) => score <= l.max);

    $("#quiz-level").textContent = detectedLevel.code;
    $("#quiz-level-name").textContent = `${detectedLevel.name} · ${score} из ${QUESTIONS.length} верно`;
    $("#quiz-advice").textContent = detectedLevel.advice;
    $("#quiz-cta").textContent = `Записаться в ${detectedLevel.group}`;

    quizForm.hidden = true;
    $(".quiz__top").hidden = true;
    result.hidden = false;
    result.focus();
    updateSummary();
  }

  $("#quiz-restart").addEventListener("click", () => {
    step = 0;
    answers = [];
    detectedLevel = null;
    result.hidden = true;
    quizForm.hidden = false;
    $(".quiz__top").hidden = false;
    renderQuestion();
    $("input", optionsBox).focus();
    updateSummary();
  });

  renderQuestion();

  /* ---------- Цены: помесячно или за 3 месяца ---------- */

  const nf = new Intl.NumberFormat("ru-RU");
  let chosenPlan = null;

  $$('input[name="billing"]').forEach((radio) =>
    radio.addEventListener("change", () => {
      const quarterly = radio.value === "3" && radio.checked;
      $$(".plan").forEach((plan) => {
        const priceEl = $("[data-price]", plan);
        const monthly = Number(priceEl.dataset.price);
        const price = quarterly ? Math.round((monthly * 0.85) / 100) * 100 : monthly;
        priceEl.textContent = nf.format(price);
        $(".plan__save", plan).textContent = quarterly
          ? `${nf.format(price * 3)} ₽ за 3 месяца, экономия ${nf.format((monthly - price) * 3)} ₽`
          : "";
      });
    })
  );

  $$("[data-plan]").forEach((link) =>
    link.addEventListener("click", () => {
      chosenPlan = link.dataset.plan;
      updateSummary();
    })
  );

  /* ---------- Форма пробного урока ---------- */

  const form = $("#trial-form");
  const submit = $("#trial-submit");
  const summary = $("#form-summary");

  function updateSummary() {
    const parts = [];
    if (chosenPlan) parts.push(`Тариф: ${chosenPlan}`);
    if (detectedLevel) parts.push(`уровень по тесту: ${detectedLevel.code}`);
    summary.hidden = parts.length === 0;
    summary.textContent = parts.join(", ");
  }

  const validators = {
    name: (v) => v.trim().length >= 2,
    contact: (v) => {
      const value = v.trim();
      if (value.startsWith("@")) return /^@[a-zA-Z0-9_]{5,32}$/.test(value);
      return value.replace(/\D/g, "").length === 11;
    },
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

    // Демо: имитация запроса к серверу
    setTimeout(() => {
      submit.removeAttribute("aria-busy");
      const success = $("#trial-success");
      success.hidden = false;
      success.focus();
    }, 1200);
  });

  /* ---------- Появление блоков ---------- */

  if (!reduceMotion && "IntersectionObserver" in window) {
    const targets = $$(".section-head, .method__stat, .method__media, .method__points li, .quiz, .card, .plan, .review, .trial");
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
      { rootMargin: "0px 0px -8% 0px" }
    );
    targets.forEach((el) => {
      el.classList.add("reveal");
      const index = [...el.parentElement.children].indexOf(el);
      el.style.transitionDelay = Math.min(index, 4) * 70 + "ms";
      io.observe(el);
    });
  }
})();
