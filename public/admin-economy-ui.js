(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "").replace(/[&<>\"']/g, (m) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));

  async function api(url, options = {}) {
    const method = String(options.method || "GET").toUpperCase();
    const response = await fetch(url, {
      ...options,
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        ...(method !== "GET" && method !== "HEAD" ? {"X-DzMoney-Admin-Request":"1"} : {}),
        ...(options.headers || {})
      }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "Request failed");
    return data;
  }

  async function renderUserDZP() {
    const details = $("userDetails");
    if (!details || details.dataset.dzpInjected === "1") return;

    const boxes = details.querySelectorAll(".detail-box");
    let userId = "";
    for (const box of boxes) {
      const label = box.querySelector(".muted");
      if (label && label.textContent.trim() === "User ID") {
        userId = box.querySelector("b")?.textContent.trim() || "";
        break;
      }
    }
    if (!userId) return;

    try {
      const data = await api(`/api/admin/users/${encodeURIComponent(userId)}/economy`);
      const dzp = Number(data.user?.dzp || 0);
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `
        <h3>DZP balance</h3>
        <div class="row">
          <label class="muted">Exact DZP balance
            <input id="adminExactDZP" type="number" min="0" step="1" value="${esc(dzp)}">
          </label>
          <label class="muted">DZP delta
            <input id="adminDeltaDZP" type="number" step="1" value="0">
          </label>
        </div>
        <div class="actions">
          <button class="primary" id="adminSetDZP">Set exact DZP</button>
          <button id="adminDeltaDZPButton">Apply DZP delta</button>
        </div>
        <p class="muted small">Admin changes are authoritative system balance changes and are recorded in the DZP/economy ledger.</p>`;
      details.appendChild(card);
      details.dataset.dzpInjected = "1";

      $("adminSetDZP").onclick = async () => {
        const value = Number($("adminExactDZP").value);
        if (!Number.isSafeInteger(value) || value < 0) return alert("DZP must be a non-negative whole number.");
        if (!confirm(`Set DZP balance to ${value.toLocaleString()}?`)) return;
        try {
          await api(`/api/admin/users/${encodeURIComponent(userId)}/balance`, {
            method: "PUT",
            body: JSON.stringify({ dzp: value })
          });
          alert("DZP balance updated.");
          if (typeof window.openUser === "function") {
            details.dataset.dzpInjected = "";
            await window.openUser(userId);
          }
        } catch (error) { alert(error.message); }
      };

      $("adminDeltaDZPButton").onclick = async () => {
        const delta = Number($("adminDeltaDZP").value);
        if (!Number.isSafeInteger(delta)) return alert("DZP delta must be a whole number.");
        if (!confirm(`Apply DZP delta ${delta >= 0 ? "+" : ""}${delta.toLocaleString()}?`)) return;
        try {
          await api(`/api/admin/users/${encodeURIComponent(userId)}/balance`, {
            method: "POST",
            body: JSON.stringify({ dzpDelta: delta })
          });
          alert("DZP balance updated.");
          if (typeof window.openUser === "function") {
            details.dataset.dzpInjected = "";
            await window.openUser(userId);
          }
        } catch (error) { alert(error.message); }
      };
    } catch (error) {
      console.error("Admin DZP UI error:", error);
    }
  }

  function installObserver() {
    const target = $("userDetails");
    if (!target) return;
    const observer = new MutationObserver(() => {
      window.setTimeout(renderUserDZP, 0);
    });
    observer.observe(target, { childList: true, subtree: true });
    renderUserDZP();
  }

  function refreshEconomyDescription() {
    const settingsForm = $("settingsForm");
    if (!settingsForm) return;
    const boxes = settingsForm.querySelectorAll(".detail-box");
    boxes.forEach((box) => {
      if (box.textContent.includes("Fixed economy:")) {
        box.innerHTML = `<b>Economic rates:</b> 1 TON = DZX rate and 1 DZX = COIN rate. These values are controlled by the Admin Panel and apply to the system.`;
      }
    });
  }

  const originalLoadSettings = window.loadSettings;
  if (typeof originalLoadSettings === "function") {
    window.loadSettings = async function(...args) {
      const result = await originalLoadSettings.apply(this, args);
      refreshEconomyDescription();
      return result;
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installObserver);
  } else {
    installObserver();
  }
})();
