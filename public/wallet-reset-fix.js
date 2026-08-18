// DzMoney wallet UI / Testnet withdrawal patch v4.
(function () {
  const originalDisconnect = window.disconnectTonWallet;
  const originalConnect = window.connectTonWallet;
  if (typeof originalDisconnect !== "function" || typeof originalConnect !== "function") return;

  window.disconnectTonWallet = async function () {
    try {
      if (typeof tonConnectUI !== "undefined" && tonConnectUI?.connected) await tonConnectUI.disconnect();
      try { await api("/api/wallet/disconnect", { method: "POST", body: JSON.stringify({}) }); } catch (error) { console.warn("Backend wallet disconnect failed:", error); }
    } catch (error) {
      alert(error?.message || "Unable to disconnect the wallet.");
    } finally {
      connectedWallet = null;
      tonConnectUI = null;
      if (currentSection === "wallet") await showWallet();
    }
  };

  window.connectTonWallet = async function () {
    try {
      if (typeof tonConnectUI !== "undefined" && tonConnectUI && !tonConnectUI.connected) tonConnectUI = null;
      if (!initTonConnect() || !tonConnectUI) throw new Error("TON Connect could not be initialized. Please try again.");
      if (typeof tonConnectUI.setConnectionNetwork === "function") tonConnectUI.setConnectionNetwork("-3");
      const data = await api("/api/ton-proof/payload", { method: "POST" });
      const payload = typeof data?.payload === "string" ? data.payload.trim() : "";
      if (!payload) throw new Error(data?.message || "The server did not return a TON Proof payload.");
      tonConnectUI.setConnectRequestParameters({ state: "ready", value: { tonProof: payload } });
      await tonConnectUI.openModal();
    } catch (error) {
      console.error("TON wallet reconnect error:", error);
      alert(error?.message || "Unable to start TON wallet connection.");
    }
  };

  const originalShowWallet = window.showWallet;
  function getInitData() { return window.Telegram?.WebApp?.initData || ""; }

  async function manualApi(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: { "Content-Type": "application/json", "X-Telegram-Init-Data": getInitData(), ...(options.headers || {}) }
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { throw new Error(`Invalid server response [HTTP ${response.status}]`); }
    if (!response.ok) throw new Error(data?.message || `Request failed [HTTP ${response.status}]`);
    return data;
  }

  function escapeHtml(value) {
    return String(value || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }

  async function renderManualWalletControls() {
    const card = document.querySelector(".withdrawal-card");
    const walletBox = document.querySelector(".ton-wallet-box");
    if (!card || !walletBox) return;

    document.getElementById("manual-wallet-box")?.remove();
    document.getElementById("manual-withdraw-amount-box")?.remove();

    let data;
    try { data = await manualApi("/api/wallet", { method: "GET" }); }
    catch (error) { console.error("Manual wallet status error:", error); return; }

    const wallet = data.wallet || {};
    const address = String(wallet.address || "");
    const saved = Boolean(address && wallet.verified && wallet.chain === "-3");

    const section = document.createElement("div");
    section.id = "manual-wallet-box";
    section.className = "ton-wallet-box manual-wallet-box";
    section.innerHTML = `
      <div class="ton-wallet-head"><div><strong>Testnet withdrawal address</strong><small>${saved ? "● Saved for Testnet withdrawals" : "○ Enter manually"}</small></div><span class="ton-wallet-icon">TESTNET</span></div>
      <p class="wallet-help">Paste the recipient's TON Testnet address. It must begin with <b>kQ</b> or <b>0Q</b>.</p>
      <input id="manual-wallet-address" class="manual-wallet-input" type="text" inputmode="text" autocomplete="off" spellcheck="false" maxlength="256" placeholder="kQ... or 0Q..." value="${escapeHtml(address)}" />
      <div class="manual-wallet-actions"><button class="wallet-secondary-button" id="manual-wallet-save">${saved ? "Update address" : "Save address"}</button>${saved ? `<button class="wallet-secondary-button" id="manual-wallet-clear">Remove</button>` : ""}</div>
      ${saved ? `<div class="wallet-address">${escapeHtml(address.slice(0, 10) + "…" + address.slice(-10))}</div>` : ""}
    `;
    walletBox.insertAdjacentElement("afterend", section);

    document.getElementById("manual-wallet-save")?.addEventListener("click", async () => {
      const value = String(document.getElementById("manual-wallet-address")?.value || "").trim();
      if (!value) return alert("Enter a Testnet TON address first.");
      const button = document.getElementById("manual-wallet-save");
      if (button) { button.disabled = true; button.textContent = "Saving..."; }
      try {
        await manualApi("/api/wallet/disconnect", { method: "POST", body: JSON.stringify({ manualAddress: value }) });
        alert("Testnet withdrawal address saved successfully.");
        await window.showWallet();
      } catch (error) {
        alert(error.message || "Unable to save the withdrawal address.");
        if (button) { button.disabled = false; button.textContent = saved ? "Update address" : "Save address"; }
      }
    });

    document.getElementById("manual-wallet-clear")?.addEventListener("click", async () => {
      try { await manualApi("/api/wallet/disconnect", { method: "POST", body: JSON.stringify({}) }); await window.showWallet(); }
      catch (error) { alert(error.message || "Unable to remove the withdrawal address."); }
    });

    const amountBox = document.createElement("div");
    amountBox.id = "manual-withdraw-amount-box";
    amountBox.className = "withdrawal-exchange-box manual-withdraw-amount-box";
    amountBox.innerHTML = `
      <div class="withdrawal-exchange-row"><span>Amount to withdraw</span><strong>BUX</strong></div>
      <input id="manual-withdraw-amount" class="manual-wallet-input" type="number" min="1" step="1" inputmode="numeric" placeholder="Enter BUX amount" />
      <div class="manual-amount-presets"><button type="button" data-percent="25">25%</button><button type="button" data-percent="50">50%</button><button type="button" data-percent="75">75%</button><button type="button" data-percent="100">Max</button></div>
      ${saved ? `<button id="manual-withdraw-button" class="withdraw-button" type="button" style="width:100%;margin-top:12px">Withdraw selected BUX</button>` : `<small style="display:block;margin-top:10px;opacity:.75">Save a Testnet address above to enable withdrawal.</small>`}
    `;
    walletBox.insertAdjacentElement("beforebegin", amountBox);

    let userData = null;
    try { userData = await manualApi("/api/user", { method: "GET" }); } catch (error) { console.error("Manual withdrawal balance error:", error); }
    const balance = Math.max(0, Math.floor(Number(userData?.user?.bux || 0)));
    amountBox.querySelectorAll("[data-percent]").forEach(button => button.addEventListener("click", () => {
      const input = document.getElementById("manual-withdraw-amount");
      if (input) input.value = String(Math.floor(balance * Number(button.dataset.percent) / 100));
    }));
    document.getElementById("manual-withdraw-button")?.addEventListener("click", () => window.withdraw());
    document.querySelectorAll(".withdraw-button").forEach(button => { if (button.id !== "manual-withdraw-button") button.textContent = "Withdraw selected BUX"; });
  }

  window.showWallet = async function () {
    await originalShowWallet.apply(this, arguments);
    await renderManualWalletControls();
  };

  window.withdraw = async function () {
    const walletData = await manualApi("/api/wallet", { method: "GET" });
    const wallet = walletData.wallet || {};
    const withdrawal = walletData.withdrawal || {};
    if (!wallet.address || !wallet.verified || wallet.chain !== "-3") return alert("Save a Testnet TON withdrawal address first.");

    const amountBux = Math.floor(Number(document.getElementById("manual-withdraw-amount")?.value));
    const minimumBux = Math.max(1, Number(withdrawal.minimumBux) || 2000);
    const feeBux = Math.max(0, Number(withdrawal.feeBux) || 0);
    const buxPerTon = Math.max(1, Number(withdrawal.buxPerTon) || 10000);
    if (!Number.isSafeInteger(amountBux) || amountBux <= 0) return alert("Enter a valid BUX amount.");
    if (amountBux < minimumBux) return alert(`Minimum withdrawal is ${minimumBux.toLocaleString()} BUX.`);
    const userData = await manualApi("/api/user", { method: "GET" });
    const balance = Number(userData?.user?.bux || 0);
    if (amountBux > balance) return alert(`Insufficient BUX. Available: ${balance.toLocaleString()} BUX.`);
    if (feeBux >= amountBux) return alert("The withdrawal fee is too high for this amount.");

    const netBux = amountBux - feeBux;
    const tonAmount = amountBux / buxPerTon;
    const netTon = netBux / buxPerTon;
    if (!confirm(`Request withdrawal of ${tonAmount.toFixed(4)} TON?\n\nAmount: ${amountBux.toLocaleString()} BUX\nFee: ${feeBux.toLocaleString()} BUX\nYou will receive: ${netTon.toFixed(4)} TON`)) return;

    const button = document.getElementById("manual-withdraw-button");
    if (button) button.disabled = true;
    try {
      const result = await manualApi("/api/withdrawals", { method: "POST", body: JSON.stringify({ amountBux }) });
      alert(`Withdrawal #${result.withdrawal.id} created successfully.\nStatus: Pending`);
      await window.showWallet();
    } catch (error) {
      alert(error.message || "Unable to create withdrawal.");
      if (button) button.disabled = false;
    }
  };
})();
