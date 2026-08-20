"use strict";

(() => {
  const tg = window.Telegram?.WebApp;
  let tasks = null;
  let adController = null;
  let loadingAds = false;

  async function api(url, options = {}) {
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    if (tg?.initData) headers["X-Telegram-Init-Data"] = tg.initData;
    const response = await fetch(url, { ...options, headers });
    const raw = await response.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch (_) {}
    if (!response.ok) throw new Error(data.message || data.error || raw || `HTTP ${response.status}`);
    return data;
  }

  function getAdTask() {
    return Array.isArray(tasks) ? tasks.find(t => t.id === "view_ads") : null;
  }

  function updateCounter(button, task) {
    if (!button || !task) return;
    const article = button.closest(".dz-task-row");
    if (!article) return;
    const completed = Number(task.metadata?.completedCount || 0);
    const required = Number(task.requiredCount || task.metadata?.count || 20);
    let counter = article.querySelector(".dz-ads-counter");
    if (!counter) {
      counter = document.createElement("div");
      counter.className = "dz-ads-counter";
      button.parentElement?.insertBefore(counter, button);
    }
    counter.innerHTML = `<span>▶</span><strong>${completed}</strong><em>/ ${required}</em>`;
    counter.setAttribute("aria-label", `${completed} of ${required} ads completed`);
    if (completed >= required) {
      button.textContent = "Completed";
      button.disabled = true;
      button.classList.add("is-started");
      counter.classList.add("is-complete");
    }
  }

  async function loadTaskState() {
    try {
      const result = await api("/api/v2/tasks");
      tasks = Array.isArray(result.tasks) ? result.tasks : [];
      const task = getAdTask();
      const button = document.querySelector('[data-task-id="view_ads"]');
      if (task && button) updateCounter(button, task);
    } catch (_) {}
  }

  function loadAdsGram(blockId) {
    return new Promise((resolve, reject) => {
      if (window.Adsgram) return resolve(window.Adsgram);
      const existing = document.querySelector("script[data-dz-adsgram]");
      if (existing) {
        existing.addEventListener("load", () => resolve(window.Adsgram));
        existing.addEventListener("error", () => reject(new Error("AdsGram SDK failed to load.")));
        return;
      }
      const script = document.createElement("script");
      script.src = "https://sad.adsgram.ai/js/sad.min.js";
      script.async = true;
      script.dataset.dzAdsgram = "1";
      script.onload = () => window.Adsgram ? resolve(window.Adsgram) : reject(new Error("AdsGram SDK is unavailable."));
      script.onerror = () => reject(new Error("AdsGram SDK failed to load."));
      document.head.appendChild(script);
    });
  }

  async function showNextAd(button) {
    if (loadingAds) return;
    loadingAds = true;
    const task = getAdTask();
    if (!task) { loadingAds = false; return; }
    const blockId = String(task.metadata?.adsgramBlockId || "").trim();
    if (!blockId) {
      loadingAds = false;
      alert("Ads are not configured yet. Please try again later.");
      return;
    }

    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = "Loading…";
    try {
      const Adsgram = await loadAdsGram(blockId);
      if (!adController) adController = Adsgram.init({ blockId });
      button.textContent = "Watching…";
      const result = await adController.show();
      if (!result?.done) throw new Error("The ad was not completed.");

      const completion = await api("/api/v2/tasks/view_ads/ad-complete", {
        method: "POST",
        body: JSON.stringify({ provider: "AdsGram", completed: true })
      });
      const refreshed = await api("/api/v2/tasks");
      tasks = Array.isArray(refreshed.tasks) ? refreshed.tasks : [];
      const updatedTask = getAdTask();
      updateCounter(button, updatedTask);

      if (completion.completed) {
        const coins = Number(completion.reward?.coins || 0).toLocaleString("en-US");
        const dzx = String(completion.reward?.dzx || "0").replace(/\.0+$/, "");
        alert(`Daily ads completed!\n+${coins} Coins • +${dzx} DZX`);
      }
    } catch (error) {
      button.disabled = false;
      button.textContent = originalText;
      alert(error.message || "Unable to complete the ad.");
    } finally {
      loadingAds = false;
    }
  }

  function bind() {
    const button = document.querySelector('[data-task-id="view_ads"]');
    if (!button) return;
    const task = getAdTask();
    if (task) updateCounter(button, task);
  }

  document.addEventListener("click", event => {
    const button = event.target.closest?.('[data-task-id="view_ads"]');
    if (!button || button.disabled) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    showNextAd(button);
  }, true);

  const observer = new MutationObserver(() => bind());
  observer.observe(document.body, { childList: true, subtree: true });
  setTimeout(loadTaskState, 300);
})();
