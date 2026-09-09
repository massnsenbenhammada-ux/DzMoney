const adminTabSections = {
  dashboard: "dashboardSection",
  economy: "economySection",
  users: "usersSection",
  referral: "referralSection",
  squad: "squadSection",
  enforcement: "enforcementSection",
  campaigns: "adminTaskCampaignSection",
};

function setActiveAdminTab(tabName) {
  const sectionId = adminTabSections[tabName];
  if (!sectionId) return;

  document.querySelectorAll(".admin-tab").forEach((button) => {
    const active = button.dataset.adminTab === tabName;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });

  Object.entries(adminTabSections).forEach(([name, id]) => {
    const section = document.getElementById(id);
    if (section) section.hidden = name !== tabName;
  });

  sessionStorage.setItem("dzmoney-admin-active-tab", tabName);
}

function loadAdminTab(tabName) {
  if (typeof loadedTabs === "undefined" || loadedTabs.has(tabName)) return;

  const loaders = {
    dashboard: loadDashboard,
    economy: loadEconomySettings,
    users: loadUsers,
    referral: loadReferralSettings,
    squad: loadSquadSettings,
    enforcement: loadEnforcementState,
    campaigns: loadAdminTasks,
  };
  const loader = loaders[tabName];
  if (!loader) return;

  loadedTabs.add(tabName);
  Promise.resolve(loader()).catch((error) => {
    if (typeof setError === "function")
      setError(error.message || `Unable to load ${tabName}.`);
  });
}

function openAdminTab(tabName) {
  if (!adminTabSections[tabName]) return;
  setActiveAdminTab(tabName);
  if (typeof closeDashboardStream === "function" && tabName !== "dashboard")
    closeDashboardStream("paused");
  loadAdminTab(tabName);
  if (tabName === "dashboard" && typeof openDashboardStream === "function")
    openDashboardStream();
}

document.querySelectorAll(".admin-tab").forEach((button) => {
  button.addEventListener("click", () => openAdminTab(button.dataset.adminTab));
});

document.querySelectorAll("[data-admin-refresh]").forEach((button) => {
  button.addEventListener("click", () => {
    const tabName = button.dataset.adminRefresh;
    loadedTabs.delete(tabName);
    loadAdminTab(tabName);
  });
});

document.getElementById("refreshButton")?.addEventListener("click", () => {
  loadedTabs.delete("dashboard");
  loadAdminTab("dashboard");
});

const savedAdminTab = sessionStorage.getItem("dzmoney-admin-active-tab");
const initialAdminTab = adminTabSections[savedAdminTab]
  ? savedAdminTab
  : "dashboard";
setActiveAdminTab(initialAdminTab);
loadAdminTab(initialAdminTab);
if (
  initialAdminTab === "dashboard" &&
  typeof openDashboardStream === "function"
)
  openDashboardStream();
