"use strict";

(() => {
  const tg = window.Telegram?.WebApp;

  const api = async (url, options = {}) => {
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    if (tg?.initData) headers["X-Telegram-Init-Data"] = tg.initData;
    const response = await fetch(url, { ...options, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.message || data.error || `HTTP ${response.status}`);
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  };

  const escapeHtml = value => String(value ?? "").replace(/[&<>\"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
  }[c]));

  function getMain() {
    return document.querySelector("main");
  }

  function ensurePanel() {
    const main = getMain();
    if (!main) return null;

    let panel = document.getElementById("dzmoney-task-v2-panel");
    if (!panel) {
      panel = document.createElement("section");
      panel.id = "dzmoney-task-v2-panel";
      panel.className = "tasks-v2-page";
      panel.innerHTML = `
        <div class="page-header">
          <h1>Tasks</h1>
          <p>Complete activities and earn DZP + DZX.</p>
        </div>
        <section class="tasks-v2-card">
          <div class="tasks-v2-toolbar">
            <div>
              <h2>Available Tasks</h2>
              <p>Rewards and limits are controlled securely by DzMoney.</p>
            </div>
            <button id="dz-task-refresh" type="button">Refresh</button>
          </div>
          <div id="dz-task-list" class="tasks-v2-list"></div>
        </section>
      `;
    }
    return panel;
  }

  function renderTasks(tasks) {
    const list = document.getElementById("dz-task-list");
    if (!list) return;
    if (!tasks.length) {
      list.innerHTML = `<div class="loading-card">No tasks available right now.</div>`;
      return;
    }

    list.innerHTML = tasks.map(task => {
      const locked = !task.available;
      const when = task.nextAvailableAt ? new Date(task.nextAvailableAt).toLocaleString() : "";
      const rewardCoins = Number(task.rewardCoins || 0).toLocaleString();
      const rewardDZX = escapeHtml(task.rewardDZX ?? 0);
      return `
        <article class="task-card task-v2-card ${locked ? "task-locked" : ""}">
          <div class="task-icon">${task.type === "daily" ? "🎯" : "🧩"}</div>
          <div class="task-info">
            <h3>${escapeHtml(task.title)}</h3>
            <p>${escapeHtml(task.description || "Complete this task to earn a reward.")}</p>
            <div class="task-reward">+${rewardCoins} DZP + ${rewardDZX} DZX</div>
            ${locked ? `<small>Available again: ${escapeHtml(when)}</small>` : ""}
          </div>
          <button class="task-button ${locked ? "completed" : ""}" type="button" data-task-id="${escapeHtml(task.id)}" ${locked ? "disabled" : ""}>${locked ? "Locked" : "Start"}</button>
        </article>
      `;
    }).join("");

    list.querySelectorAll("button[data-task-id]").forEach(button => {
      button.addEventListener("click", () => startTask(button.dataset.taskId, button));
    });
  }

  async function loadTasks() {
    const list = document.getElementById("dz-task-list");
    if (!list) return;
    list.innerHTML = `<div class="loading-card">Loading tasks...</div>`;
    try {
      const result = await api("/api/v2/tasks");
      renderTasks(Array.isArray(result.tasks) ? result.tasks : []);
    } catch (error) {
      const message = error.status === 401
        ? "Telegram authentication is required. Please reopen the Mini App from Telegram."
        : error.message;
      list.innerHTML = `<div class="error-card">Unable to load tasks: ${escapeHtml(message)}<br><button id="dz-task-retry" type="button">Retry</button></div>`;
      document.getElementById("dz-task-retry")?.addEventListener("click", loadTasks);
    }
  }

  async function startTask(taskId, button) {
    button.disabled = true;
    button.textContent = "Starting...";
    try {
      const result = await api(`/api/v2/tasks/${encodeURIComponent(taskId)}/start`, {
        method: "POST",
        body: "{}"
      });
      button.textContent = "Started";
      button.dataset.completionId = result.completion?.id || "";
      button.classList.add("completed");
    } catch (error) {
      button.disabled = false;
      button.textContent = "Start";
      if (error.status === 409 && error.data?.nextAvailableAt) {
        button.textContent = "Locked";
        button.disabled = true;
      }
      alert(error.message || "Unable to start task.");
    }
  }

  function showTasksV2() {
    const main = getMain();
    if (!main) return;
    main.innerHTML = "";
    const panel = ensurePanel();
    if (!panel) return;
    main.appendChild(panel);
    panel.style.display = "block";

    const refresh = panel.querySelector("#dz-task-refresh");
    if (refresh && !refresh.dataset.bound) {
      refresh.dataset.bound = "1";
      refresh.addEventListener("click", loadTasks);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
    loadTasks();
  }

  const originalOpenSection = window.openSection;
  window.openSection = function(page) {
    if (page === "tasks") {
      showTasksV2();
      if (typeof window.setActiveNav === "function") window.setActiveNav("tasks");
      return;
    }
    if (typeof originalOpenSection === "function") return originalOpenSection.apply(this, arguments);
  };
})();
