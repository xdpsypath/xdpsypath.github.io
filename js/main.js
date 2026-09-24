(function () {
  "use strict";

  const data = window.PORTFOLIO;
  const $ = (sel) => document.querySelector(sel);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const escape = (value) =>
    String(value).replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[ch]);

  const icons = {
    github: '<path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    email: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    telegram: '<path d="m21 4-3 16-6.5-5.5L16 9l-7.5 5L3 12z"/>',
    linkedin: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 11v6M8 7.5v.01M12 17v-6M12 13.5c0-1.5 1-2.5 2.5-2.5s2.5 1 2.5 2.5V17"/>',
    resume: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  };

  const icon = (name) =>
    `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${icons[name]}</svg>`;

  // ---------- Простые текстовые поля ----------

  function renderBindings() {
    const values = {
      name: data.name,
      role: data.role,
      status: data.status,
      tagline: data.tagline,
    };

    document.querySelectorAll("[data-bind]").forEach((el) => {
      const key = el.dataset.bind;
      if (key in values) el.textContent = values[key];
    });

    $('[data-bind="logo"]').innerHTML = `<span>~/</span>${escape(data.handle)}`;
    document.title = `${data.name}. ${data.role}`;
    $("#year").textContent = new Date().getFullYear();

    if (!data.status) $(".status").remove();
  }

  // ---------- Обо мне ----------

  function renderAbout() {
    $("#about-text").innerHTML = data.about.map((p) => `<p>${escape(p)}</p>`).join("");
    $("#stats").innerHTML = data.stats
      .map(
        (s) => `
        <li class="stat reveal">
          <span class="stat__value">${escape(s.value)}</span>
          <span class="stat__label">${escape(s.label)}</span>
        </li>`
      )
      .join("");
  }

  // ---------- Стек ----------

  function renderSkills() {
    $("#skills-list").innerHTML = data.skills
      .map(
        (g) => `
        <div class="skill-group reveal">
          <h3>${escape(g.group)}</h3>
          <ul class="chips">${g.items.map((i) => `<li class="chip">${escape(i)}</li>`).join("")}</ul>
        </div>`
      )
      .join("");
  }

  // ---------- Проекты ----------

  const tagLabels = {
    app: "Веб-приложения",
    site: "Сайты",
    landing: "Лендинги",
    backend: "Backend",
    fullstack: "Fullstack",
    frontend: "Frontend",
  };

  const tagLabel = (tag) => tagLabels[tag] || tag.charAt(0).toUpperCase() + tag.slice(1);

  function projectCard(p) {
    // Ссылка на код: полный URL или путь к папке внутри репозитория портфолио
    const code = p.links?.github || (p.links?.code && data.repo ? `${data.repo}/tree/main/${p.links.code}` : "");
    const links = [];
    if (code) {
      links.push(`<a href="${escape(code)}" target="_blank" rel="noopener" aria-label="Исходный код: ${escape(p.title)}">${icon("github")}</a>`);
    }

    const media = p.image
      ? `<a class="project__media" href="${escape(p.links?.demo || "#")}" tabindex="-1" aria-hidden="true">
          <img src="${escape(p.image)}" alt="" loading="lazy" width="1280" height="800" />
        </a>`
      : "";
    const demo = p.links?.demo
      ? `<a class="project__demo" href="${escape(p.links.demo)}">Открыть демо<span class="visually-hidden">: ${escape(p.title)}</span> ${icon("external")}</a>`
      : "";

    const highlights = p.highlights?.length
      ? `<ul class="project__highlights">${p.highlights.map((h) => `<li>${escape(h)}</li>`).join("")}</ul>`
      : "";

    const metrics = p.metrics?.length
      ? `<div class="metrics">${p.metrics
          .map(
            (m) => `
            <div class="metric">
              <span class="metric__value">${escape(m.value)}</span>
              <span class="metric__label">${escape(m.label)}</span>
            </div>`
          )
          .join("")}</div>`
      : "";

    return `
      <article class="project reveal" data-tags="${escape((p.tags || []).join(" "))}">
        ${media}
        <div class="project__head">
          <h3 class="project__title">${escape(p.title)}</h3>
          ${links.length ? `<div class="project__links">${links.join("")}</div>` : ""}
        </div>
        <p class="project__summary">${escape(p.summary)}</p>
        ${highlights}
        ${metrics}
        <ul class="chips" aria-label="Стек">${p.stack.map((s) => `<li class="chip chip--sm">${escape(s)}</li>`).join("")}</ul>
        ${demo}
      </article>`;
  }

  function renderProjects() {
    const list = $("#projects-list");
    list.innerHTML = data.projects.map(projectCard).join("");

    const tags = [...new Set(data.projects.flatMap((p) => p.tags || []))];
    const filters = $("#filters");

    if (tags.length < 2) {
      filters.remove();
      return;
    }

    filters.innerHTML = ["all", ...tags]
      .map(
        (t) =>
          `<button class="filter" type="button" data-tag="${escape(t)}" aria-pressed="${t === "all"}">${
            t === "all" ? "Все" : escape(tagLabel(t))
          }</button>`
      )
      .join("");

    filters.addEventListener("click", (e) => {
      const btn = e.target.closest(".filter");
      if (!btn) return;
      const tag = btn.dataset.tag;

      filters.querySelectorAll(".filter").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
      list.querySelectorAll(".project").forEach((card) => {
        card.hidden = tag !== "all" && !card.dataset.tags.split(" ").includes(tag);
      });
    });
  }

  // ---------- Опыт ----------

  function renderExperience() {
    // Пустой опыт: убираем раздел и пункт меню, а не показываем пустой заголовок
    if (!data.experience?.length) {
      $("#experience").remove();
      document.querySelector('.nav a[href="#experience"]')?.remove();
      return;
    }
    $("#timeline").innerHTML = data.experience
      .map(
        (job) => `
        <li class="job reveal">
          <p class="job__period">${escape(job.period)}</p>
          <h3 class="job__title">${escape(job.role)} <span class="job__company">· ${escape(job.company)}</span></h3>
          ${
            job.points?.length
              ? `<ul class="job__points">${job.points.map((pt) => `<li>${escape(pt)}</li>`).join("")}</ul>`
              : ""
          }
        </li>`
      )
      .join("");
  }

  // ---------- Контакты ----------

  function renderContacts() {
    const c = data.contacts;
    const shortUrl = (url) => url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");

    const items = [
      c.email && { kind: "email", label: "Почта", value: c.email, href: `mailto:${c.email}` },
      c.telegram && { kind: "telegram", label: "Telegram", value: "@" + shortUrl(c.telegram).split("/").pop(), href: c.telegram },
      c.github && { kind: "github", label: "GitHub", value: shortUrl(c.github), href: c.github },
      c.linkedin && { kind: "linkedin", label: "LinkedIn", value: shortUrl(c.linkedin), href: c.linkedin },
      c.resume && { kind: "resume", label: "Резюме", value: "Скачать PDF", href: c.resume },
    ].filter(Boolean);

    $("#contact-links").innerHTML = items
      .map((item) => {
        const external = item.kind !== "email" ? ' target="_blank" rel="noopener"' : "";
        return `
          <a class="contact-link reveal" href="${escape(item.href)}"${external}>
            <span class="contact-link__icon">${icon(item.kind)}</span>
            <span class="contact-link__text">
              <span class="contact-link__label">${item.label}</span>
              <span class="contact-link__value">${escape(item.value)}</span>
            </span>
          </a>`;
      })
      .join("");
  }

  // ---------- Терминал ----------

  function jsonLines() {
    const str = (v) => `<span class="t-str">"${escape(v)}"</span>`;
    const key = (k) => `  <span class="t-key">"${k}"</span>: `;
    const tools = data.tools || data.skills.flatMap((g) => g.items).slice(0, 5);

    return [
      "{",
      key("name") + str(data.name) + ",",
      key("role") + str(data.role) + ",",
      key("location") + str(data.location) + ",",
      key("tools") + "[" + tools.map(str).join(", ") + "],",
      key("open_to_work") + `<span class="t-num">${Boolean(data.status)}</span>`,
      "}",
    ].join("\n");
  }

  function renderTerminal() {
    const el = $("#terminal");
    const prompt = '<span class="t-prompt">$</span> ';
    const command = `curl -s api.${data.handle}.dev/me | jq`;
    const cursor = '<span class="t-cursor"></span>';
    const output = jsonLines();
    const final = `${prompt}${escape(command)}\n${output}\n\n${prompt}${cursor}`;

    if (reducedMotion) {
      el.innerHTML = final;
      return;
    }

    let i = 0;
    const type = () => {
      el.innerHTML = `${prompt}${escape(command.slice(0, i))}${cursor}`;
      if (i++ < command.length) {
        setTimeout(type, 28 + Math.random() * 40);
      } else {
        setTimeout(() => {
          el.innerHTML = `${prompt}${escape(command)}\n<span class="t-muted">…</span>`;
          setTimeout(() => (el.innerHTML = final), 380);
        }, 300);
      }
    };
    setTimeout(type, 500);
  }

  // ---------- Поведение ----------

  function setupTheme() {
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const current = () => root.dataset.theme || (media.matches ? "dark" : "light");

    $("#theme-toggle").addEventListener("click", () => {
      const next = current() === "dark" ? "light" : "dark";
      root.dataset.theme = next;
      try {
        localStorage.setItem("portfolio.theme", next);
      } catch (e) {}
    });
  }

  function setupNav() {
    const nav = $("#nav");
    const toggle = $("#nav-toggle");
    const header = $(".header");

    const setOpen = (open) => {
      nav.classList.toggle("is-open", open);
      toggle.setAttribute("aria-expanded", String(open));
    };

    toggle.addEventListener("click", () => setOpen(!nav.classList.contains("is-open")));
    nav.addEventListener("click", (e) => {
      if (e.target.closest("a")) setOpen(false);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") setOpen(false);
    });

    const onScroll = () => header.classList.toggle("is-scrolled", window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    // Подсветка активного пункта меню
    const links = [...nav.querySelectorAll("a")];
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          links.forEach((a) => a.classList.toggle("is-active", a.hash === `#${entry.target.id}`));
        });
      },
      { rootMargin: "-45% 0px -50% 0px" }
    );
    document.querySelectorAll("main section[id]").forEach((s) => observer.observe(s));
  }

  function setupReveal() {
    const items = document.querySelectorAll(".reveal");
    if (reducedMotion || !("IntersectionObserver" in window)) {
      items.forEach((el) => el.classList.add("is-visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -8% 0px" }
    );
    items.forEach((el) => observer.observe(el));
  }

  renderBindings();
  renderAbout();
  renderSkills();
  renderProjects();
  renderExperience();
  renderContacts();
  renderTerminal();
  setupTheme();
  setupNav();
  setupReveal();
})();
