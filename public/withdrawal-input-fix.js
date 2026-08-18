// DzMoney withdrawal amount selector
// Lets the user choose the BUX amount instead of forcing the full balance.

function withdrawalNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function renderWithdrawalPreview() {
  const input = document.getElementById("withdraw-amount-bux");
  const tonOut = document.getElementById("withdraw-ton-out");
  const feeOut = document.getElementById("withdraw-fee-out");
  const receiveOut = document.getElementById("withdraw-receive-out");
  const button = document.getElementById("withdraw-submit-button");

  if (!input || !tonOut || !feeOut || !receiveOut) return;

  const buxPerTon = Math.max(1, withdrawalNumber(withdrawalConfig.buxPerTon, 10000));
  const minimum = Math.max(1, Math.floor(withdrawalNumber(withdrawalConfig.minimumBux, 2000)));
  const fee = Math.max(0, Math.floor(withdrawalNumber(withdrawalConfig.feeBux, 0)));
  const amount = Math.max(0, Math.floor(withdrawalNumber(input.value, 0)));
  const net = Math.max(0, amount - fee);

  tonOut.textContent = `${(amount / buxPerTon).toFixed(4)} TON`;
  feeOut.textContent = `${formatNumber(fee)} BUX`;
  receiveOut.textContent = `${(net / buxPerTon).toFixed(4)} TON`;

  if (button) {
    button.disabled = !connectedWallet?.address || !connectedWallet?.verified ||
      amount < minimum || amount > Math.floor(bux) || fee >= amount;
  }
}

function setWithdrawAmount(value) {
  const input = document.getElementById("withdraw-amount-bux");
  if (!input) return;
  input.value = String(Math.max(0, Math.floor(withdrawalNumber(value, 0))));
  renderWithdrawalPreview();
}

async function showWallet() {
  const main = getMain();
  if (!main) return;

  try {
    await loadUser();
  } catch (error) {
    console.error("Wallet balance refresh error:", error);
  }

  if (!connectedWallet) await loadWallet();

  try {
    const historyData = await api("/api/withdrawals", { method: "GET" });
    withdrawalHistory = Array.isArray(historyData.withdrawals)
      ? historyData.withdrawals.slice(0, 10)
      : [];
  } catch (error) {
    console.error("Withdrawal history load error:", error);
    withdrawalHistory = [];
  }

  const walletConnected = Boolean(connectedWallet?.address && connectedWallet?.verified);
  const address = connectedWallet?.address || "";
  const buxPerTon = Math.max(1, withdrawalNumber(withdrawalConfig.buxPerTon, 10000));
  const minimumBux = Math.max(1, Math.floor(withdrawalNumber(withdrawalConfig.minimumBux, 2000)));
  const availableTon = bux / buxPerTon;
  const minimumTon = minimumBux / buxPerTon;
  const maxAmountBux = Math.floor(bux);
  const maxTon = maxAmountBux / buxPerTon;
  const fee = Math.max(0, Math.floor(withdrawalNumber(withdrawalConfig.feeBux, 0)));

  main.innerHTML = `
    <section class="page-header">
      <h1>Wallet</h1>
      <p>Exchange your BUX for TON and manage withdrawals</p>
    </section>

    <section class="wallet-card withdrawal-card">
      <div class="wallet-top">
        <span>Withdrawal</span>
        <span class="online-dot">● Online</span>
      </div>

      <div class="withdrawal-stats">
        <div class="withdrawal-stat">
          <span class="withdrawal-stat-icon">🪙</span>
          <small>COINS</small>
          <strong>${formatNumber(coins)}</strong>
        </div>
        <div class="withdrawal-stat">
          <span class="withdrawal-stat-icon">💰</span>
          <small>BUX</small>
          <strong>${formatNumber(bux)}</strong>
        </div>
        <div class="withdrawal-stat ton-stat">
          <span class="withdrawal-stat-icon">💎</span>
          <small>TON AVAILABLE</small>
          <strong>${availableTon.toFixed(4)}</strong>
        </div>
      </div>

      <div class="withdrawal-rate-box">
        <div>
          <span>Minimum withdrawal</span>
          <strong>${formatNumber(minimumBux)} BUX</strong>
        </div>
        <div>
          <span>Rate</span>
          <strong>${formatNumber(buxPerTon)} BUX = 1 TON</strong>
        </div>
      </div>

      <div class="withdrawal-exchange-box">
        <div class="withdrawal-exchange-row">
          <span>Your available balance</span>
          <strong>${formatNumber(bux)} BUX</strong>
        </div>
        <div class="withdrawal-exchange-row muted-row">
          <span>Maximum withdrawal</span>
          <strong>${maxTon.toFixed(4)} TON</strong>
        </div>
        <div class="withdrawal-exchange-row muted-row">
          <span>Current fee</span>
          <strong>${formatNumber(fee)} BUX</strong>
        </div>
      </div>

      ${walletConnected ? `
        <div class="ton-wallet-box connected">
          <div class="ton-wallet-head">
            <div>
              <strong>TON Wallet</strong>
              <small>● Connected</small>
            </div>
            <span class="ton-wallet-icon">TON</span>
          </div>
          <div class="wallet-address">${shortWalletAddress(address)}</div>
          <button class="wallet-secondary-button" onclick="disconnectTonWallet()">Disconnect Wallet</button>
        </div>

        <div style="margin-top:18px;padding:16px;border:1px solid rgba(255,255,255,.08);border-radius:16px;background:rgba(255,255,255,.03)">
          <div style="font-weight:700;margin-bottom:10px">Amount to withdraw</div>
          <div style="display:flex;align-items:center;gap:10px">
            <input
              id="withdraw-amount-bux"
              type="number"
              inputmode="numeric"
              min="${minimumBux}"
              max="${maxAmountBux}"
              step="1"
              value="${Math.min(maxAmountBux, Math.max(minimumBux, maxAmountBux))}"
              oninput="renderWithdrawalPreview()"
              style="width:100%;box-sizing:border-box;padding:14px 16px;border-radius:12px;border:1px solid rgba(255,255,255,.12);background:rgba(0,0,0,.18);color:inherit;font-size:16px;font-weight:700;outline:none"
            />
            <strong>BUX</strong>
          </div>
          <div style="display:grid;gap:8px;margin-top:12px">
            <div class="withdrawal-exchange-row"><span>TON amount</span><strong id="withdraw-ton-out">0.0000 TON</strong></div>
            <div class="withdrawal-exchange-row"><span>Fee</span><strong id="withdraw-fee-out">${formatNumber(fee)} BUX</strong></div>
            <div class="withdrawal-exchange-row"><span>You will receive</span><strong id="withdraw-receive-out">0.0000 TON</strong></div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
            <button type="button" class="wallet-secondary-button" onclick="setWithdrawAmount(${minimumBux})">Min</button>
            <button type="button" class="wallet-secondary-button" onclick="setWithdrawAmount(${Math.floor(maxAmountBux / 2)})">50%</button>
            <button type="button" class="wallet-secondary-button" onclick="setWithdrawAmount(${maxAmountBux})">Max</button>
          </div>
          <button id="withdraw-submit-button" class="withdraw-button" onclick="withdraw()" style="width:100%;margin-top:12px">
            Withdraw
          </button>
          <small style="display:block;margin-top:9px;opacity:.7">Minimum: ${formatNumber(minimumBux)} BUX · You can choose any whole BUX amount up to your balance.</small>
        </div>
      ` : `
        <div class="ton-wallet-box">
          <div class="ton-wallet-head">
            <div>
              <strong>TON Wallet</strong>
              <small>○ Not connected</small>
            </div>
            <span class="ton-wallet-icon">TON</span>
          </div>
          <p class="wallet-help">Connect and verify your TON wallet before requesting a withdrawal.</p>
          <button class="connect-wallet-button" onclick="connectTonWallet()">🔗 Connect TON Wallet</button>
        </div>
      `}

      <div class="withdrawal-history-section">
        <div class="withdrawal-history-head">
          <div>
            <h2>Recent withdrawals</h2>
            <p>Last 10 withdrawal requests</p>
          </div>
          <span class="history-count">${withdrawalHistory.length}/10</span>
        </div>

        ${withdrawalHistory.length ? `
          <div class="withdrawal-history-list">
            ${withdrawalHistory.map(w => {
              const status = withdrawalStatusMeta(w.status);
              const amountTon = Number(w.amountTon || 0);
              const netTon = amountTon || (Number(w.netBux || 0) / buxPerTon);
              return `
                <div class="withdrawal-history-item">
                  <div class="withdrawal-history-main">
                    <div class="withdrawal-history-id">#${Number(w.id)}</div>
                    <div>
                      <strong>${netTon.toFixed(4)} TON</strong>
                      <small>${formatNumber(w.amountBux)} BUX${Number(w.feeBux || 0) > 0 ? ` · Fee ${formatNumber(w.feeBux)} BUX` : ""}</small>
                    </div>
                  </div>
                  <div class="withdrawal-history-side">
                    <span class="withdrawal-status ${status.className}">${status.label}</span>
                    <small>${formatWithdrawalDate(w.createdAt)}</small>
                  </div>
                </div>
              `;
            }).join("")}
          </div>
        ` : `
          <div class="withdrawal-empty">
            <div>💸</div>
            <strong>No withdrawals yet</strong>
            <span>Your latest 10 withdrawals will appear here.</span>
          </div>
        `}
      </div>
    </section>
  `;

  window.scrollTo({ top: 0, behavior: "smooth" });
  initTonConnect();

  if (walletConnected) renderWithdrawalPreview();
}

async function withdraw() {
  if (!connectedWallet?.address || !connectedWallet?.verified) {
    alert("Connect and verify your TON wallet first.");
    return;
  }

  const input = document.getElementById("withdraw-amount-bux");
  const amountBux = Math.floor(withdrawalNumber(input?.value, 0));
  const minimum = Math.max(1, Math.floor(withdrawalNumber(withdrawalConfig.minimumBux, 2000)));
  const feeBux = Math.max(0, Math.floor(withdrawalNumber(withdrawalConfig.feeBux, 0)));
  const buxPerTon = Math.max(1, withdrawalNumber(withdrawalConfig.buxPerTon, 10000));

  if (!Number.isSafeInteger(amountBux) || amountBux < minimum) {
    alert(`Minimum withdrawal is ${formatNumber(minimum)} BUX.`);
    return;
  }

  if (amountBux > Math.floor(bux)) {
    alert(`You cannot withdraw more than your available balance of ${formatNumber(bux)} BUX.`);
    return;
  }

  if (!Number.isSafeInteger(feeBux) || feeBux < 0 || feeBux >= amountBux) {
    alert("The withdrawal fee is too high for this withdrawal amount. Please contact the administrator.");
    return;
  }

  const netBux = amountBux - feeBux;
  const tonAmount = amountBux / buxPerTon;
  const netTonAmount = netBux / buxPerTon;

  if (!confirm(`Request withdrawal of ${tonAmount.toFixed(4)} TON?\n\nAmount: ${formatNumber(amountBux)} BUX\nFee: ${formatNumber(feeBux)} BUX\nYou will receive: ${netTonAmount.toFixed(4)} TON`)) return;

  const button = document.getElementById("withdraw-submit-button");
  if (button) button.disabled = true;

  try {
    const data = await api("/api/withdrawals", {
      method: "POST",
      body: JSON.stringify({ amountBux })
    });

    bux = Number(data?.user?.bux ?? (bux - amountBux));
    updateBalance();
    alert(`Withdrawal #${data.withdrawal.id} created successfully.\nStatus: Pending`);
    await showWallet();
  } catch (error) {
    alert(error.message);
    renderWithdrawalPreview();
  }
}
