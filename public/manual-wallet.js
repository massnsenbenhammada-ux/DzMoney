(() => {
  "use strict";

  const originalShowWallet = window.showWallet;
  const originalWithdraw = window.withdraw;

  function getInitData() {
    return window.Telegram?.WebApp?.initData || "";
  }

  async function manualApi(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "X-Telegram-Init-Data": getInitData(),
        ...(options.headers || {})
      }
    });

    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      throw new Error(`Invalid server response [HTTP ${response.status}]`);
    }

    if (!response.ok) {
      throw new Error(data?.message || `Request failed [HTTP ${response.status}]`);
    }
    return data;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function insertManualWalletUI(wallet) {
    const card = document.querySelector(".withdrawal-card");
    const walletBox = document.querySelector(".ton-wallet-box");
    if (!card || !walletBox) return;

    document.getElementById("manual-wallet-box")?.remove();

    const address = wallet?.address || "";
    const saved = Boolean(address && wallet?.verified && wallet?.chain === "-3");

    const section = document.createElement("div");
    section.id = "manual-wallet-box";
    section.className = "ton-wallet-box manual-wallet-box";
    section.innerHTML = `
      <div class="ton-wallet-head">
        <div>
          <strong>Testnet withdrawal address</strong>
          <small>${saved ? "● Saved for Testnet withdrawals" : "○ Enter manually"}</small>
        </div>
        <span class="ton-wallet-icon">TESTNET</span>
      </div>
      <p class="wallet-help">
        Paste the recipient's TON Testnet address. It must be a Testnet-only address beginning with <b>kQ</b> or <b>0Q</b>.
      </p>
      <input
        id="manual-wallet-address"
        class="manual-wallet-input"
        type="text"
        inputmode="text"
        autocomplete="off"
        spellcheck="false"
        maxlength="256"
        placeholder="kQ... or 0Q..."
        value="${escapeHtml(address)}"
      />
      <div class="manual-wallet-actions">
        <button class="wallet-secondary-button" id="manual-wallet-save">
          ${saved ? "Update address" : "Save address"}
        </button>
        ${saved ? `<button class="wallet-secondary-button" id="manual-wallet-clear">Remove</button>` : ""}
      </div>
      ${saved ? `<div class="wallet-address">${escapeHtml(address.slice(0, 10) + "…" + address.slice(-10))}</div>` : ""}
    `;

    walletBox.insertAdjacentElement("afterend", section);

    document.getElementById("manual-wallet-save")?.addEventListener("click", async () => {
      const input = document.getElementById("manual-wallet-address");
      const value = String(input?.value || "").trim();
      if (!value) {
        alert("Enter a Testnet TON address first.");
        return;
      }

      const button = document.getElementById("manual-wallet-save");
      if (button) {
        button.disabled = true;
        button.textContent = "Saving...";
      }

      try {
        await manualApi("/api/wallet/disconnect", {
          method: "POST",
          body: JSON.stringify({ manualAddress: value })
        });
        alert("Testnet withdrawal address saved successfully.");
        await window.showWallet();
      } catch (error) {
        alert(error.message || "Unable to save the withdrawal address.");
        if (button) {
          button.disabled = false;
          button.textContent = saved ? "Update address" : "Save address";
        }
      }
    });

    document.getElementById("manual-wallet-clear")?.addEventListener("click", async () => {
      try {
        await manualApi("/api/wallet/disconnect", {
          method: "POST",
          body: JSON.stringify({})
        });
        await window.showWallet();
      } catch (error) {
        alert(error.message || "Unable to remove the withdrawal address.");
      }
    });
  }

  window.showWallet = async function manualAwareShowWallet(...args) {
    await originalShowWallet(...args);

    try {
      const data = await manualApi("/api/wallet", { method: "GET" });
      insertManualWalletUI(data.wallet || null);

      const input = document.getElementById("manual-withdraw-amount");
      if (input) input.focus = () => {};

      document.querySelectorAll(".withdraw-button").forEach(button => {
        button.textContent = "Withdraw selected BUX";
      });
    } catch (error) {
      console.error("Manual wallet UI error:", error);
    }
  };

  window.withdraw = async function manualAwareWithdraw() {
    const walletData = await manualApi("/api/wallet", { method: "GET" });
    const wallet = walletData.wallet || {};
    const withdrawal = walletData.withdrawal || {};

    if (!wallet.address || !wallet.verified || wallet.chain !== "-3") {
      alert("Save a Testnet TON withdrawal address first.");
      return;
    }

    const input = document.getElementById("manual-withdraw-amount");
    const amountBux = Math.floor(Number(input?.value));
    const minimumBux = Math.max(1, Number(withdrawal.minimumBux) || 2000);
    const feeBux = Math.max(0, Number(withdrawal.feeBux) || 0);
    const buxPerTon = Math.max(1, Number(withdrawal.buxPerTon) || 10000);

    if (!Number.isSafeInteger(amountBux) || amountBux <= 0) {
      alert("Enter a valid BUX amount.");
      return;
    }

    if (amountBux < minimumBux) {
      alert(`Minimum withdrawal is ${minimumBux.toLocaleString()} BUX.`);
      return;
    }

    if (feeBux >= amountBux) {
      alert("The withdrawal fee is too high for this amount.");
      return;
    }

    const userData = await manualApi("/api/user", { method: "GET" });
    const balance = Number(userData?.user?.bux || 0);
    if (amountBux > balance) {
      alert(`Insufficient BUX. Available: ${balance.toLocaleString()} BUX.`);
      return;
    }

    const netBux = amountBux - feeBux;
    const tonAmount = amountBux / buxPerTon;
    const netTon = netBux / buxPerTon;

    const confirmed = confirm(
      `Request withdrawal of ${tonAmount.toFixed(4)} TON?\n\n` +
      `Amount: ${amountBux.toLocaleString()} BUX\n` +
      `Fee: ${feeBux.toLocaleString()} BUX\n` +
      `You will receive: ${netTon.toFixed(4)} TON`
    );
    if (!confirmed) return;

    try {
      const data = await manualApi("/api/withdrawals", {
        method: "POST",
        body: JSON.stringify({ amountBux })
      });

      alert(`Withdrawal #${data.withdrawal.id} created successfully.\nStatus: Pending`);
      await window.showWallet();
    } catch (error) {
      alert(error.message || "Unable to create withdrawal.");
    }
  };

  // Add the amount selector after the existing wallet page is rendered.
  const originalRender = window.showWallet;
  window.showWallet = async function renderManualWithdrawalPage(...args) {
    await originalRender(...args);

    const walletBox = document.querySelector(".ton-wallet-box");
    if (!walletBox || document.getElementById("manual-withdraw-amount")) return;

    const amountBox = document.createElement("div");
    amountBox.className = "withdrawal-exchange-box manual-withdraw-amount-box";
    amountBox.innerHTML = `
      <div class="withdrawal-exchange-row">
        <span>Amount to withdraw</span>
        <strong>BUX</strong>
      </div>
      <input
        id="manual-withdraw-amount"
        class="manual-wallet-input"
        type="number"
        min="1"
        step="1"
        inputmode="numeric"
        placeholder="Enter BUX amount"
      />
      <div class="manual-amount-presets">
        <button type="button" data-percent="25">25%</button>
        <button type="button" data-percent="50">50%</button>
        <button type="button" data-percent="75">75%</button>
        <button type="button" data-percent="100">Max</button>
      </div>
    `;

    walletBox.insertAdjacentElement("beforebegin", amountBox);

    try {
      const userData = await manualApi("/api/user", { method: "GET" });
      const balance = Math.max(0, Math.floor(Number(userData?.user?.bux || 0)));
      amountBox.querySelectorAll("[data-percent]").forEach(button => {
        button.addEventListener("click", () => {
          const percent = Number(button.dataset.percent) / 100;
          const input = document.getElementById("manual-withdraw-amount");
          if (input) input.value = String(Math.floor(balance * percent));
        });
      });
    } catch (error) {
      console.error("Unable to load BUX balance for presets:", error);
    }
  };
})();
