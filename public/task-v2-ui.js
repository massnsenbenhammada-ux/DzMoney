"use strict";

(() => {
  if (!document.querySelector('link[data-dz-task-fix]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/task-v2-fix.css?v=5';
    link.dataset.dzTaskFix = '1';
    document.head.appendChild(link);
  }

  const tg = window.Telegram?.WebApp;
  const CATEGORIES = [
    { id: "daily", title: "Daily Activity", subtitle: "Complete daily activities and earn rewards", icon: "☀️" },
    { id: "game", title: "Game Tasks", subtitle: "Play partner Mini Apps and earn rewards", icon: "🎮" },
    { id: "social", title: "Social Tasks", subtitle: "Follow, join and engage", icon: "👥" },
    { id: "web", title: "Web Tasks", subtitle: "Visit websites and complete actions", icon: "◎" },
    { id: "special", title: "Special Tasks", subtitle: "Higher-value verified tasks", icon: "✦" },
    { id: "partner", title: "Partner Tasks", subtitle: "Exclusive partner campaigns", icon: "🤝" }
  ];
  const DAILY_ORDER = ["daily_checkin", "check_updates", "share_friends", "view_ads", "invite_1", "invite_10"];
  let allTasks = [], currentCategory = null;

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

  const escapeHtml = value => String(value ?? "").replace(/[&<>\"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;", "'":"&#39;" }[c]));
  const getMain = () => document.querySelector("main");
  const categoryById = id => CATEGORIES.find(category => category.id === id) || CATEGORIES[0];

  function formatInteger(value) {
    const number = Number(value || 0);
    return Number.isFinite(number) ? Math.round(number).toLocaleString("en-US") : "0";
  }

  function formatDZX(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "0";
    if (Number.isInteger(number)) return number.toLocaleString("en-US");
    return number.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 4 });
  }

  // IMPORTANT: reward_coins/rewardCoins are the in-app Coins balance, not DZP.
  // DZP is a separate economic points/token unit and must never be shown here as the
  // label for task coin rewards.
  function rewardMarkup(task) {
    return `<div class="dz-task-reward"><b>+${formatInteger(task.rewardCoins)}</b> Coins <i>•</i> <b>💎 +${formatDZX(task.rewardDZX)}</b> DZX</div>`;
  }

  function renderShell(category = null) {
    const main = getMain();
    if (!main) return;
    currentCategory = category;
    const heading = category ? categoryById(category) : null;

    if (!category) {
      main.innerHTML = `<section class="dz-tasks-page">
        <div class="dz-tasks-hero">
          <div class="dz-tasks-eyebrow">DZMONEY EARN</div>
          <h1>Tasks</h1>
          <p>Choose a category and complete tasks to earn <strong>Coins</strong> + <strong>DZX</strong> rewards.</p>
        </div>
        <div class="dz-category-list">${CATEGORIES.map((item,index)=>`
          <button class="dz-category-card" type="button" data-category="${item.id}">
            <span class="dz-category-number">0${index+1}</span>
            <span class="dz-category-icon">${item.icon}</span>
            <span class="dz-category-copy"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.subtitle)}</small></span>
            <span class="dz-category-arrow">›</span>
          </button>`).join("")}</div>
        <div class="dz-tasks-note"><span>i</span><p>Rewards, limits and task availability are controlled securely by DzMoney.</p></div>
      </section>`;
      main.querySelectorAll("[data-category]").forEach(button => button.addEventListener("click", () => renderShell(button.dataset.category)));
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    main.innerHTML = `<section class="dz-tasks-page">
      <button class="dz-task-back" id="dz-task-back" type="button"><span>‹</span> Tasks</button>
      <div class="dz-tasks-hero">
        <div class="dz-tasks-eyebrow">CATEGORY 0${CATEGORIES.findIndex(x => x.id === category) + 1}</div>
        <h1>${escapeHtml(heading.title)}</h1>
        <p>${escapeHtml(heading.subtitle)}</p>
      </div>
      <section class="dz-task-section-head">
        <div class="dz-category-mark">${heading.icon}</div>
        <div><span>${category === "daily" ? "Daily reset" : "Available tasks"}</span><h2>${escapeHtml(heading.title)}</h2></div>
        <button class="dz-task-refresh-icon" id="dz-task-refresh" type="button" aria-label="Refresh tasks">↻</button>
      </section>
      <div id="dz-task-list" class="dz-task-list"></div>
      <div class="dz-tasks-note"><span>✓</span><p>Rewards are verified server-side. Task limits and availability are controlled securely by DzMoney.</p></div>
    </section>`;

    document.getElementById("dz-task-back")?.addEventListener("click", () => renderShell());
    document.getElementById("dz-task-refresh")?.addEventListener("click", loadTasks);
    loadTasks();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function sortTasks(tasks, category) {
    if (category !== "daily") return tasks;
    const order = new Map(DAILY_ORDER.map((id,index) => [id,index]));
    return [...tasks].sort((a,b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999));
  }

  function renderTasks() {
    const list = document.getElementById("dz-task-list");
    if (!list) return;
    const visible = sortTasks(allTasks.filter(task => String(task.type).toLowerCase() === currentCategory), currentCategory);

    if (!visible.length) {
      list.innerHTML = `<div class="dz-empty-state"><div class="dz-empty-icon">${categoryById(currentCategory).icon}</div><h3>No tasks available yet</h3><p>New ${escapeHtml(categoryById(currentCategory).title.toLowerCase())} will appear here when published.</p></div>`;
      return;
    }

    list.innerHTML = visible.map((task,index) => {
      const locked = !task.available;
      const when = task.nextAvailableAt ? new Date(task.nextAvailableAt).toLocaleString() : "";
      const icons = ["✓","↻","↗","▶","＋","＋"];
      const icon = currentCategory === "daily" ? (icons[index] || "•") : categoryById(currentCategory).icon;
      const action = locked ? "Locked" : task.id === "daily_checkin" ? "Claim" : task.id === "check_updates" ? "Go ↗" : task.id === "share_friends" ? "Share" : task.id === "invite_1" || task.id === "invite_10" ? "Invite" : "Start";
      const referralNote = task.id === "invite_1" || task.id === "invite_10" ? `<small class="dz-task-cooldown">Lifetime 20% from eligible referred activity</small>` : "";
      const cooldown = locked ? `<small class="dz-task-cooldown">Available again ${escapeHtml(when)}</small>` : "";

      return `<article class="dz-task-row ${locked ? "is-locked" : ""}">
        <div class="dz-task-index">${String(index+1).padStart(2,"0")}</div>
        <div class="dz-task-icon">${icon}</div>
        <div class="dz-task-content">
          <div class="dz-task-title-line"><h3>${escapeHtml(task.title)}</h3>${locked ? `<span class="dz-task-status">Locked</span>` : ""}</div>
          <p>${escapeHtml(task.description || "Complete this task to earn your reward.")}</p>
          ${rewardMarkup(task)}${referralNote}${cooldown}
        </div>
        <button class="dz-task-action" type="button" data-task-id="${escapeHtml(task.id)}" ${locked ? "disabled" : ""}>${action}</button>
      </article>`;
    }).join("");

    list.querySelectorAll("[data-task-id]").forEach(button => button.addEventListener("click", () => startTask(button.dataset.taskId, button)));
  }

  async function loadTasks() {
    const list = document.getElementById("dz-task-list");
    if (!list) return;
    list.innerHTML = `<div class="dz-loading"><span></span><span></span><span></span><p>Loading tasks</p></div>`;
    try {
      const result = await api("/api/v2/tasks");
      allTasks = Array.isArray(result.tasks) ? result.tasks : [];
      renderTasks();
    } catch (error) {
      const message = error.status === 401 ? "Please reopen DzMoney from Telegram." : error.message;
      list.innerHTML = `<div class="dz-error-state"><strong>Unable to load tasks</strong><p>${escapeHtml(message)}</p><button id="dz-task-retry" type="button">Try again</button></div>`;
      document.getElementById("dz-task-retry")?.addEventListener("click", loadTasks);
    }
  }

  async function startTask(taskId, button) {
    const task = allTasks.find(item => String(item.id) === String(taskId));
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = taskId === "daily_checkin" ? "Claiming" : "Starting";
    try {
      const result = await api(`/api/v2/tasks/${encodeURIComponent(taskId)}/start`, { method: "POST", body: "{}" });
      if (taskId === "daily_checkin") {
        const reward = await api(`/api/v2/tasks/${encodeURIComponent(taskId)}/verify`, { method: "POST", body: JSON.stringify({ source: "daily_checkin" }) });
        button.textContent = "Claimed";
        button.classList.add("is-started");
        const rewardText = `+${formatInteger(reward.reward?.coins)} Coins • +${formatDZX(reward.reward?.dzx)} DZX`;
        setTimeout(() => alert(`Daily Check-in complete!\n${rewardText}`), 50);
        await loadTasks();
        return;
      }
      if (taskId === "check_updates" && task?.metadata?.channelUrl) window.open(task.metadata.channelUrl, "_blank");
      if (taskId === "share_friends") {
        const username = tg?.initDataUnsafe?.user?.username || "";
        const bot = window.DZMONEY_BOT_USERNAME || "DzMoneyBot";
        const ref = username ? `https://t.me/${bot}?start=ref_${encodeURIComponent(username)}` : `https://t.me/${bot}`;
        const share = `https://t.me/share/url?url=${encodeURIComponent(ref)}&text=${encodeURIComponent("Join me on DzMoney and earn rewards 💎")}`;
        window.open(share, "_blank");
      }
      button.textContent = taskId === "check_updates" ? "Opened" : taskId === "share_friends" ? "Shared" : originalText === "Invite" ? "Invited" : "Started";
      button.classList.add("is-started");
      button.dataset.completionId = result.completion?.id || "";
    } catch (error) {
      button.disabled = false;
      button.textContent = originalText;
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
    if (page === "tasks") { showTasksV2(); return; }
    if (typeof originalOpenSection === "function") return originalOpenSection.apply(this, arguments);
  };
})();
