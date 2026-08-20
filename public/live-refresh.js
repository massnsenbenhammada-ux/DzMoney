(() => {
  "use strict";

  // Keep DzMoney on the current SPA page while server-side data refreshes.
  // A data refresh must never call location.reload() or rebuild the current page.
  const STORAGE_KEY = "dzmoney.activeSection";
  const TASK_CATEGORY_KEY = "dzmoney.activeTaskCategory";
  const REFRESH_MS = 15000;
  const TASK_REFRESH_MS = 30000;

  let refreshBusy = false;
  let lastTaskRefresh = 0;

  const currentSection = () => {
    const active = document.querySelector(".nav-item.active");
    return active?.dataset?.page || sessionStorage.getItem(STORAGE_KEY) || "home";
  };

  const rememberSection = section => {
    try { sessionStorage.setItem(STORAGE_KEY, section); } catch (_) {}
  };

  const rememberTaskCategory = category => {
    try {
      if (category) sessionStorage.setItem(TASK_CATEGORY_KEY, category);
      else sessionStorage.removeItem(TASK_CATEGORY_KEY);
    } catch (_) {}
  };

  // Remember navigation without changing the existing navigation implementation.
  // This is also what lets the app recover the Tasks page if Telegram/Railway
  // performs an unavoidable document refresh.
  document.addEventListener("click", event => {
    const nav = event.target.closest?.(".nav-item[data-page]");
    if (nav) rememberSection(nav.dataset.page);

    const category = event.target.closest?.("[data-category]");
    if (category) rememberTaskCategory(category.dataset.category);

    if (event.target.closest?.("#dz-task-back")) rememberTaskCategory("");
  }, true);

  async function refreshDataInPlace() {
    if (refreshBusy || document.hidden) return;
    refreshBusy = true;

    try {
      // These functions update only their existing DOM values.
      if (typeof window.loadUser === "function") await window.loadUser();
      if (typeof window.loadDZPBalance === "function") await window.loadDZPBalance();

      // The task-v2 UI has its own refresh button and API loader. Use that
      // loader only when the user is actually on a category page and no task
      // action/ad is currently running, so we never interrupt an active task.
      if (currentSection() === "tasks" && Date.now() - lastTaskRefresh >= TASK_REFRESH_MS) {
        const refreshButton = document.getElementById("dz-task-refresh");
        const activeAction = document.querySelector(".dz-task-action:disabled");
        if (refreshButton && !activeAction) {
          lastTaskRefresh = Date.now();
          refreshButton.click();
        }
      }
    } catch (error) {
      console.warn("DzMoney live refresh error:", error);
    } finally {
      refreshBusy = false;
    }
  }

  function restoreNavigationAfterDocumentRefresh() {
    const section = sessionStorage.getItem(STORAGE_KEY);
    if (!section || section === "home") return;

    const button = document.querySelector(`.nav-item[data-page="${CSS.escape(section)}"]`);
    if (!button) return;

    button.click();

    if (section === "tasks") {
      const category = sessionStorage.getItem(TASK_CATEGORY_KEY);
      if (!category) return;

      setTimeout(() => {
        const categoryButton = document.querySelector(`[data-category="${CSS.escape(category)}"]`);
        if (categoryButton) categoryButton.click();
      }, 200);
    }
  }

  restoreNavigationAfterDocumentRefresh();
  refreshDataInPlace();
  setInterval(refreshDataInPlace, REFRESH_MS);
})();
