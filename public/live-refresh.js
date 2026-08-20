(() => {
  "use strict";

  // DzMoney must behave like an SPA: data refreshes in place and never
  // navigates the user back to Home just because a refresh/poll occurred.
  const STORAGE_KEY = "dzmoney.activeSection";
  const TASK_CATEGORY_KEY = "dzmoney.activeTaskCategory";
  const REFRESH_MS = 15000;
  const TASK_REFRESH_MS = 30000;

  const main = () => document.querySelector("main");
  const navButton = section => document.querySelector(`.nav-item[data-page="${section}"]`);

  let homeMarkup = null;
  let refreshBusy = false;
  let lastTaskRefresh = 0;

  function captureHomeMarkup() {
    const element = main();
    if (element && homeMarkup === null) homeMarkup = element.innerHTML;
  }

  function currentSection() {
    const active = document.querySelector(".nav-item.active");
    return active?.dataset?.page || sessionStorage.getItem(STORAGE_KEY) || "home";
  }

  function rememberSection(section) {
    try {
      sessionStorage.setItem(STORAGE_KEY, section);
    } catch (_) {}
  }

  function rememberTaskCategory(category) {
    try {
      if (category) sessionStorage.setItem(TASK_CATEGORY_KEY, category);
      else sessionStorage.removeItem(TASK_CATEGORY_KEY);
    } catch (_) {}
  }

  function restoreHome() {
    const element = main();
    if (!element || homeMarkup === null) return;
    element.innerHTML = homeMarkup;
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (typeof window.loadUser === "function") window.loadUser();
    if (typeof window.loadDZPBalance === "function") window.loadDZPBalance();
    if (typeof window.loadSquadData === "function") window.loadSquadData();
  }

  function openWithoutReload(section) {
    rememberSection(section);

    if (section === "home") {
      currentSection = "home";
      if (typeof window.setActiveNav === "function") window.setActiveNav("home");
      restoreHome();
      return;
    }

    // For Tasks the task-v2 controller is authoritative. For Friends/Wallet
    // the original SPA functions are safe because they render into <main>.
    if (section === "tasks" && typeof window.openSection === "function") {
      window.openSection(section);
      return;
    }

    if (section === "friends" && typeof window.showFriends === "function") {
      window.currentSection = "friends";
      if (typeof window.setActiveNav === "function") window.setActiveNav("friends");
      window.showFriends();
      return;
    }

    if (section === "wallet" && typeof window.showWallet === "function") {
      window.currentSection = "wallet";
      if (typeof window.setActiveNav === "function") window.setActiveNav("wallet");
      window.showWallet();
    }
  }

  function installNavigationGuard() {
    const original = window.openSection;
    window.openSection = function(section) {
      rememberSection(section);
      if (section === "home") {
        restoreHome();
        if (typeof window.setActiveNav === "function") window.setActiveNav("home");
        window.currentSection = "home";
        return;
      }
      if (typeof original === "function") return original.apply(this, arguments);
    };

    document.addEventListener("click", event => {
      const category = event.target.closest?.("[data-category]");
      if (category) rememberTaskCategory(category.dataset.category);

      const back = event.target.closest?.("#dz-task-back");
      if (back) rememberTaskCategory("");

      const nav = event.target.closest?.(".nav-item[data-page]");
      if (nav) rememberSection(nav.dataset.page);
    }, true);
  }

  async function refreshUserData() {
    if (refreshBusy || document.hidden) return;
    refreshBusy = true;
    try {
      if (typeof window.loadUser === "function") await window.loadUser();
      if (typeof window.loadDZPBalance === "function") await window.loadDZPBalance();

      // Refresh the visible task data without replacing the page. Never poll
      // while a task action/ad is in progress because that could reset its UI.
      if (currentSection() === "tasks" && Date.now() - lastTaskRefresh >= TASK_REFRESH_MS) {
        const activeAction = document.querySelector(".dz-task-action:disabled");
        if (!activeAction) {
          const refreshButton = document.getElementById("dz-task-refresh");
          if (refreshButton) {
            lastTaskRefresh = Date.now();
            refreshButton.click();
          }
        }
      }
    } catch (error) {
      console.warn("DzMoney live refresh error:", error);
    } finally {
      refreshBusy = false;
    }
  }

  function restoreNavigation() {
    const savedSection = sessionStorage.getItem(STORAGE_KEY);
    if (!savedSection || savedSection === "home") return;

    const button = navButton(savedSection);
    if (button) button.click();

    if (savedSection === "tasks") {
      const category = sessionStorage.getItem(TASK_CATEGORY_KEY);
      if (category) {
        setTimeout(() => {
          const categoryButton = document.querySelector(`[data-category="${CSS.escape(category)}"]`);
          if (categoryButton) categoryButton.click();
        }, 150);
      }
    }
  }

  // Event delegation keeps the Daily Reward button functional even if Home
  // is restored from its cached markup after a navigation event.
  document.addEventListener("click", async event => {
    const button = event.target.closest?.("#daily-button");
    if (!button || button.disabled) return;
    if (typeof window.api !== "function") return;

    event.preventDefault();
    button.disabled = true;
    try {
      const data = await window.api("/api/daily/claim", { method: "POST" });
      if (data?.user) {
        window.coins = data.user.coins;
        window.bux = data.user.bux;
      }
      window.dailyRemaining = 86400;
      if (typeof window.updateBalance === "function") window.updateBalance();
      if (typeof window.updateDaily === "function") window.updateDaily();
    } catch (error) {
      alert(error.message || "Unable to claim the daily reward.");
      button.disabled = false;
    }
  }, true);

  captureHomeMarkup();
  installNavigationGuard();
  restoreNavigation();
  setInterval(refreshUserData, REFRESH_MS);
  refreshUserData();
})();
