(() => {
  "use strict";

  const tg = window.Telegram?.WebApp;

  function formatDZP(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return "0";
    return Math.max(0, Math.floor(amount)).toLocaleString();
  }

  async function loadDZP() {
    const element = document.getElementById("dzp");
    if (!element) return;

    try {
      const response = await fetch("/api/economy/me", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          ...(tg?.initData ? { "X-Telegram-Init-Data": tg.initData } : {})
        }
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const dzp = data?.economy?.dzp;

      element.textContent = formatDZP(dzp);
      element.dataset.loaded = "true";
    } catch (error) {
      console.error("DZP balance load error:", error);
      // Keep the visible balance safe and explicit instead of showing stale data.
      element.textContent = "0";
    }
  }

  window.loadDZPBalance = loadDZP;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadDZP, { once: true });
  } else {
    loadDZP();
  }
})();
