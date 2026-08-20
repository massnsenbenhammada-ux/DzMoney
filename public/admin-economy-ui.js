(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/[&<>\"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
  async function api(url, options = {}) {
    const method = String(options.method || "GET").toUpperCase();
    const response = await fetch(url, { ...options, credentials: "same-origin", headers: { "Content-Type": "application/json", ...(method !== "GET" && method !== "HEAD" ? { "X-DzMoney-Admin-Request": "1" } : {}), ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "Request failed");
    return data;
  }
  async function renderEconomy() {
    const details = $("userDetails");
    if (!details || details.dataset.economyInjected === "1") return;
    const userIdBox = [...details.querySelectorAll(".detail-box")].find(box => box.querySelector(".muted")?.textContent.trim() === "User ID");
    const userId = userIdBox?.querySelector("b")?.textContent.trim() || "";
    if (!userId) return;
    try {
      const data = await api(`/api/admin/users/${encodeURIComponent(userId)}/economy`);
      const dzp = Number(data.user?.dzp || 0), dzx = Number(data.user?.dzx || 0);
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `<h3>Economy balances</h3><div class="row"><label class="muted">Exact DZX<input id="adminExactDZX" type="number" min="0" step="0.000000001" value="${esc(dzx)}"></label><label class="muted">DZX delta<input id="adminDeltaDZX" type="number" step="0.000000001" value="0"></label><label class="muted">Exact DZP<input id="adminExactDZP" type="number" min="0" step="1" value="${esc(dzp)}"></label><label class="muted">DZP delta<input id="adminDeltaDZP" type="number" step="1" value="0"></label></div><div class="actions"><button class="primary" id="adminSetEconomy">Set exact DZX/DZP</button><button id="adminDeltaEconomy">Apply DZX/DZP delta</button></div><p class="muted small">DZX and DZP changes are transactional and recorded in the economy ledger. BUX and Coins remain on their dedicated balance controls.</p>`;
      details.appendChild(card);
      details.dataset.economyInjected = "1";
      $("adminSetEconomy").onclick = async () => {
        const exactDZP = Number($("adminExactDZP").value), exactDZXText = $("adminExactDZX").value.trim(), exactDZX = Number(exactDZXText);
        if (!Number.isSafeInteger(exactDZP) || exactDZP < 0) return alert("DZP must be a non-negative whole number.");
        if (!Number.isFinite(exactDZX) || exactDZX < 0) return alert("DZX must be a non-negative number.");
        if (!confirm("Set the exact DZX and DZP balances?")) return;
        try { await api(`/api/admin/users/${encodeURIComponent(userId)}/balance`, { method: "PUT", body: JSON.stringify({ dzx: exactDZXText, dzp: exactDZP }) }); alert("DZX/DZP balances updated."); details.dataset.economyInjected = ""; await window.openUser(userId); } catch (error) { alert(error.message); }
      };
      $("adminDeltaEconomy").onclick = async () => {
        const dzpDelta = Number($("adminDeltaDZP").value), dzxDeltaText = $("adminDeltaDZX").value.trim(), dzxDelta = Number(dzxDeltaText);
        if (!Number.isSafeInteger(dzpDelta)) return alert("DZP delta must be a whole number.");
        if (!Number.isFinite(dzxDelta)) return alert("DZX delta must be a valid number.");
        if (!confirm(`Apply DZX delta ${dzxDelta >= 0 ? "+" : ""}${dzxDelta} and DZP delta ${dzpDelta >= 0 ? "+" : ""}${dzpDelta}?`)) return;
        try { await api(`/api/admin/users/${encodeURIComponent(userId)}/balance`, { method: "POST", body: JSON.stringify({ dzxDelta: dzxDeltaText, dzpDelta }) }); alert("DZX/DZP balances updated."); details.dataset.economyInjected = ""; await window.openUser(userId); } catch (error) { alert(error.message); }
      };
    } catch (error) { console.error("Admin economy UI error:", error); }
  }
  function install() {
    const target = $("userDetails");
    if (!target) return;
    new MutationObserver(() => setTimeout(renderEconomy, 0)).observe(target, { childList: true, subtree: true });
    renderEconomy();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install); else install();
})();
