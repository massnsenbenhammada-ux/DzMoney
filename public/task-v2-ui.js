"use strict";

(() => {
  const tg = window.Telegram?.WebApp;

  const CATEGORIES = [
    { id: "daily", title: "Daily Activity", subtitle: "Your daily earning routine", icon: "☀️" },
    { id: "game", title: "Game Tasks", subtitle: "Play partner Mini Apps", icon: "🎮" },
    { id: "social", title: "Social Tasks", subtitle: "Follow, join and engage", icon: "◎" },
    { id: "web", title: "Web Tasks", subtitle: "Visit websites and links", icon: "◉" },
    { id: "special", title: "Special Tasks", subtitle: "Higher-value verified tasks", icon: "✦" },
    { id: "partner", title: "Partner Tasks", subtitle: "Exclusive partner campaigns", icon: "◆" }
  ];

  const DAILY_ORDER = [
    "daily_checkin",
    "check_updates",
    "share_friends",
    "view_ads",
    "invite_1",
    "invite_10"
  ];

  let allTasks = [];
  let currentCategory = null;

  async function api(url, options = {}) {
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    if (tg?.initData) headers["X-Telegram-Init-Data"] = tg.initData;
    const response = await fetch(url, { ...options, headers });
    const raw = await response.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch (_) {}
    if (!response.ok) {
      const error = new Error(data.message || data.error || raw || `HTTP ${response.status}`);
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  }

  const escapeHtml = value => String(value ?? "").replace(/[&<>\"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
  }[c]));

  const getMain = () => document.querySelector("main");

  function categoryById(id) {
    return CATEGORIES.find(category => category.id === id) || CATEGORIES[0];
  }

  function renderShell(category = null) {
    const main = getMain();
    if (!main) return;
    currentCategory = category;

    const heading = category ? categoryById(category) : null;
    main.innerHTML = `
      <section class="dz-tasks-page">
        <div class="dz-tasks-hero">
          <div class="dz-tasks-eyebrow">DZMoney EARN</div>
          <h1>${heading ? escapeHtml(heading.title) : "Tasks"}</h1>
          <p>${heading ? escapeHtml(heading.subtitle) : "Choose an activity category and earn DZP + DZX."}</p>
        </div>
        ${category ? `
          <button class="dz-task-back" id="dz-task-back" type="button"><span>‹</span> All task categories</button>
          <section class="dz-task-section-head">
            <div class="dz-category-mark">${heading.icon}</div>
            <div><span>Category</span><h2>${escapeHtml(heading.title)}</h2></div>
            <button class="dz-task-refresh-icon" id="dz-task-refresh" type="button" aria-label="Refresh">↻</button>
          </section>
          <div id="dz-task-list" class="dz-task-list"></div>
        ` : `
          <div class="dz-category-list">
            ${CATEGORIES.map((item, index) => `
              <button class="dz-category-card" type="button" data-category="${item.id}">
                <span class="dz-category-number">0${index + 1}</span>
                <span class="dz-category-icon">${item.icon}</span>
                <span class="dz-category-copy"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.subtitle)}</small></span>
                <span class="dz-category-arrow">›</span>
              </button>
            `).join("")}
          </div>
          <div class="dz-tasks-note"><span>i</span><p>Rewards, limits and task availability are controlled securely by DzMoney.</p></div>
        `}
      </section>
    `;

    if (category) {
      document.getElementById("dz-task-back")?.addEventListener("click", () => renderShell());
      document.getElementById("dz-task-refresh")?.addEventListener("click", loadTasks);
      loadTasks();
    } else {
      main.querySelectorAll("[data-category]").forEach(button => {
        button.addEventListener("click", () => renderShell(button.dataset.category));
      });
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function sortTasks(tasks, category) {
    if (category !== "daily") return tasks;
    const order = new Map(DAILY_ORDER.map((id, index) => [id, index]));
    return [...tasks].sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999));
  }

  function renderTasks(tasks) {
    const list = document.getElementById("dz-task-list");
    if (!list) return;
    const visible = sortTasks(allTasks.filter(task => String(task.type).toLowerCase() === currentCategory), currentCategory);

    if (!visible.length) {
      list.innerHTML = `
        <div class="dz-empty-state">
          <div class="dz-empty-icon">${categoryById(currentCategory).icon}</div>
          <h3>No tasks available yet</h3>
          <p>New ${escapeHtml(categoryById(currentCategory).title.toLowerCase())} will appear here when they are published.</p>
        </div>`;
      return;
    }

    list.innerHTML = visible.map((task, index) => {
      const locked = !task.available;
      const when = task.nextAvailableAt ? new Date(task.nextAvailableAt).toLocaleString() : "";
      const coins = Number(task.rewardCoins || 0).toLocaleString();
      const dzx = escapeHtml(task.rewardDZX ?? 0);
      const icon = currentCategory === "daily" ? ["☀️", "↻", "↗", "▶", "01", "10"][index] || "•" : categoryById(currentCategory).icon;
      return `
        <article class="dz-task-row ${locked ? "is-locked" : ""}">
          <div class="dz-task-index">${String(index + 1).padStart(2, "0")}</div>
          <div class="dz-task-icon">${icon}</div>
          <div class="dz-task-content">
            <div class="dz-task-title-line"><h3>${escapeHtml(task.title)}</h3>${locked ? `<span class="dz-task-status">Locked</span>` : ""}</div>
            <p>${escapeHtml(task.description || "Complete this task to earn your reward.")}</p>
            <div class="dz-task-reward"><b>+${coins}</b> DZP <i>•</i> <b>+${dzx}</b> DZX</div>
            ${locked ? `<small class="dz-task-cooldown">Available again ${escapeHtml(when)}</small>` : ""}
          </div>
          <button class="dz-task-action" type="button" data-task-id="${escapeHtml(task.id)}" ${locked ? "disabled" : ""}>${locked ? "Locked" : "Start"}</button>
        </article>`;
    }).join("");

    list.querySelectorAll("[data-task-id]").forEach(button => {
      button.addEventListener("click", () => startTask(button.dataset.taskId, button));
    });
  }

  async function loadTasks() {
    const list = document.getElementById("dz-task-list");
    if (!list) return;
    list.innerHTML = `<div class="dz-loading"><span></span><span></span><span></span><p>Loading tasks</p></div>`;
    try {
      const result = await api("/api/v2/tasks");
      allTasks = Array.isArray(result.tasks) ? result.tasks : [];
      renderTasks(allTasks);
    } catch (error) {
      const message = error.status === 401 ? "Please reopen DzMoney from Telegram." : error.message;
      list.innerHTML = `<div class="dz-error-state"><strong>Unable to load tasks</strong><p>${escapeHtml(message)}</p><button id="dz-task-retry" type="button">Try again</button></div>`;
      document.getElementById("dz-task-retry")?.addEventListener("click", loadTasks);
    }
  }

  async function startTask(taskId, button) {
    button.disabled = true;
    button.textContent = "Starting";
    try {
      const result = await api(`/api/v2/tasks/${encodeURIComponent(taskId)}/start`, { method: "POST", body: "{}" });
      button.textContent = "Started";
      button.classList.add("is-started");
      button.dataset.completionId = result.completion?.id || "";
    } catch (error) {
      button.disabled = false;
      button.textContent = "Start";
      if (error.status === 409) button.textContent = "Locked";
      alert(error.message || "Unable to start task.");
    }
  }

  function showTasksV2() {
    renderShell();
    if (typeof window.setActiveNav === "function") window.setActiveNav("tasks");
  }

  const originalOpenSection = window.openSection;
  window.openSection = function(page) {
    if (page === "tasks") {
      showTasksV2();
      return;
    }
    if (typeof originalOpenSection === "function") return originalOpenSection.apply(this, arguments);
  };
})();