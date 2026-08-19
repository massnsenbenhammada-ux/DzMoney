"use strict";

(() => {
  const tg = window.Telegram?.WebApp;
  const api = async (url, options = {}) => {
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    if (tg?.initData) headers["X-Telegram-Init-Data"] = tg.initData;
    const response = await fetch(url, { ...options, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || data.error || `HTTP ${response.status}`);
    return data;
  };
  const escapeHtml = value => String(value ?? "").replace(/[&<>\"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));

  function ensurePanel() {
    let panel = document.getElementById("dzmoney-task-v2-panel");
    if (panel) return panel;
    panel = document.createElement("section");
    panel.id = "dzmoney-task-v2-panel";
    panel.className = "info-card";
    panel.innerHTML = `<div style="width:100%"><div style="display:flex;justify-content:space-between;align-items:center;gap:12px"><div><h2 style="margin:0">Daily Tasks</h2><p style="margin:4px 0 12px">Complete activities and earn Coins + DZX.</p></div><button id="dz-task-refresh" type="button">Refresh</button></div><div id="dz-task-list"></div></div>`;
    (document.querySelector("main") || document.body).appendChild(panel);
    panel.style.display = "none";
    panel.querySelector("#dz-task-refresh").addEventListener("click", loadTasks);
    return panel;
  }

  async function loadTasks() {
    const list = ensurePanel().querySelector("#dz-task-list");
    list.innerHTML = `<p>Loading tasks…</p>`;
    try {
      const result = await api("/api/v2/tasks");
      const tasks = Array.isArray(result.tasks) ? result.tasks : [];
      if (!tasks.length) { list.innerHTML = `<p>No tasks available right now.</p>`; return; }
      list.innerHTML = tasks.map(task => {
        const locked = !task.available;
        const when = task.nextAvailableAt ? new Date(task.nextAvailableAt).toLocaleString() : "";
        return `<div style="padding:12px 0;border-top:1px solid rgba(127,127,127,.2)"><div style="display:flex;justify-content:space-between;gap:12px;align-items:center"><div><strong>${escapeHtml(task.title)}</strong><div style="font-size:.85em;opacity:.75">${escapeHtml(task.type)} · ${Number(task.rewardCoins).toLocaleString()} Coins + ${escapeHtml(task.rewardDZX)} DZX</div>${locked ? `<div style="font-size:.8em;opacity:.7">Available again: ${escapeHtml(when)}</div>` : ""}</div><button type="button" data-task-id="${escapeHtml(task.id)}" ${locked ? "disabled" : ""}>${locked ? "Locked" : "Start"}</button></div></div>`;
      }).join("");
      list.querySelectorAll("button[data-task-id]").forEach(button => button.addEventListener("click", () => startTask(button.dataset.taskId, button)));
    } catch (error) {
      list.innerHTML = `<p>Unable to load tasks: ${escapeHtml(error.message)}</p>`;
    }
  }

  async function startTask(taskId, button) {
    button.disabled = true;
    try {
      const result = await api(`/api/v2/tasks/${encodeURIComponent(taskId)}/start`, { method: "POST", body: "{}" });
      button.textContent = "Started";
      button.dataset.completionId = result.completion?.id || "";
    } catch (error) {
      button.disabled = false;
      alert(error.message);
    }
  }

  function showTasks() {
    const panel = ensurePanel();
    panel.style.display = "block";
    loadTasks();
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const originalOpenSection = window.openSection;
  window.openSection = function(page) {
    if (typeof originalOpenSection === "function") originalOpenSection.apply(this, arguments);
    if (page === "tasks") showTasks();
    else { const panel = document.getElementById("dzmoney-task-v2-panel"); if (panel) panel.style.display = "none"; }
  };
  window.addEventListener("DOMContentLoaded", ensurePanel);
})();
