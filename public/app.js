const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();
  tg.expand();
}


// ============================
// State
// ============================

let coins = 0;
let bux = 0;

let dailyRemaining = 0;

let currentTasks = [];
let tonConnectUI = null;
let connectedWallet = null;
let withdrawalConfig = { minimumBux: 2000, feeBux: 0, buxPerTon: 10000 };
let withdrawalHistory = [];
let currentSection = "home";


// ============================
// Telegram user
// ============================

function getTelegramUser() {

  if (
    tg &&
    tg.initDataUnsafe &&
    tg.initDataUnsafe.user
  ) {

    return tg.initDataUnsafe.user;

  }

  return {
    id: "demo-user"
  };
}


// ============================
// API
// ============================

async function api(
  url,
  options = {}
) {

  const telegramUser =
    getTelegramUser();


  const config = {

    ...options,

    headers: {

      "Content-Type":
        "application/json",

      ...(tg?.initData
        ? { "X-Telegram-Init-Data": tg.initData }
        : {}),

      ...(options.headers || {})

    }

  };


  const method = String(config.method || "GET").toUpperCase();
  config.method = method;

  if (method === "GET" || method === "HEAD") {
    const separator = url.includes("?") ? "&" : "?";
    url += separator + "telegramUser=" + encodeURIComponent(JSON.stringify(telegramUser));
    if (tg?.initData) {
      url += "&telegramInitData=" + encodeURIComponent(tg.initData);
    }
  } else if (config.body) {

    try {
      const body = JSON.parse(config.body);
      body.telegramUser = telegramUser;
      if (tg?.initData) body.telegramInitData = tg.initData;
      config.body = JSON.stringify(body);
    } catch (error) {
      console.error(error);
    }

  } else {
    config.body = JSON.stringify({ telegramUser });
  }


  const response =
    await fetch(
      url,
      config
    );


  const data =
    await response.json();


  if (!response.ok) {

    throw new Error(
      data.message ||
      "Something went wrong"
    );

  }


  return data;

}


// ============================
// Helpers
// ============================

function formatNumber(value) {

  return Number(value)
    .toLocaleString();

}


function formatTime(seconds) {

  const hours =
    Math.floor(
      seconds / 3600
    );

  const minutes =
    Math.floor(
      (seconds % 3600) / 60
    );

  const secs =
    seconds % 60;


  return [
    hours,
    minutes,
    secs
  ]
    .map(
      value =>
        String(value)
          .padStart(2, "0")
    )
    .join(":");

}


// ============================
// Balance
// ============================

function updateBalance() {

  const coinsElement = document.getElementById("coins");
  const buxElement = document.getElementById("bux");
  const tonElement = document.getElementById("ton");

  if (coinsElement) {
    coinsElement.textContent = formatNumber(coins);
  }

  if (buxElement) {
    buxElement.textContent = formatNumber(bux);
  }

  if (tonElement) {
    tonElement.textContent =
      (bux / Math.max(1, Number(withdrawalConfig.buxPerTon) || 10000)).toFixed(4);
  }

}


// ============================
// Load user
// ============================

async function loadUser() {

  try {

    const user =
      getTelegramUser();

    const response =
      await fetch(
        "/api/user?telegramUser=" +
        encodeURIComponent(
          JSON.stringify(user)
        )
      );


    const data =
      await response.json();


    if (
      data.success &&
      data.user
    ) {

      coins =
        data.user.coins;

      bux =
        data.user.bux;


      if (
        data.user.dailyClaimAt
      ) {

        const elapsed =
          Math.floor(
            (
              Date.now() -
              data.user.dailyClaimAt
            ) / 1000
          );

        dailyRemaining =
          Math.max(
            0,
            86400 - elapsed
          );

      }

    }


    updateBalance();
    updateDaily();

  } catch (error) {

    console.error(
      "User load error:",
      error
    );

  }

}


// ============================
// Daily reward
// ============================

const dailyButton =
  document.getElementById(
    "daily-button"
  );

const dailyText =
  document.getElementById(
    "daily-text"
  );


function updateDaily() {

  if (
    !dailyButton ||
    !dailyText
  ) {
    return;
  }


  if (
    dailyRemaining > 0
  ) {

    dailyButton.disabled =
      true;

    dailyButton.textContent =
      formatTime(
        dailyRemaining
      );


    dailyText.textContent =
      "Next reward available in " +
      formatTime(
        dailyRemaining
      );

  } else {

    dailyButton.disabled =
      false;

    dailyButton.textContent =
      "Claim";

    dailyText.textContent =
      "Your daily reward is ready!";

  }

}


if (dailyButton) {

  dailyButton.addEventListener(
    "click",
    async () => {

      if (
        dailyRemaining > 0
      ) {
        return;
      }


      dailyButton.disabled =
        true;


      try {

        const data =
          await api(
            "/api/daily/claim",
            {
              method: "POST"
            }
          );


        coins =
          data.user.coins;

        bux =
          data.user.bux;


        dailyRemaining =
          86400;


        updateBalance();
        updateDaily();


      } catch (error) {

        alert(
          error.message
        );

        dailyButton.disabled =
          false;

      }

    }
  );

}


// ============================
// Navigation
// ============================

function setActiveNav(
  section
) {

  const items =
    document.querySelectorAll(
      ".nav-item"
    );


  items.forEach(item => {

    item.classList.remove(
      "active"
    );

  });


  const active =
    document.querySelector(
      `.nav-item[data-page="${section}"]`
    );


  if (active) {

    active.classList.add(
      "active"
    );

  }

}


function openSection(
  section
) {

  currentSection = section;

  setActiveNav(
    section
  );


  if (
    section === "home"
  ) {

    showHome();

  }


  if (
    section === "tasks"
  ) {

    showTasks();

  }


  if (
    section === "friends"
  ) {

    showFriends();

  }


  if (
    section === "wallet"
  ) {

    showWallet();

  }

}


// ============================
// Main content
// ============================

function getMain() {

  return document.querySelector(
    "main"
  );

}


// ============================
// Home
// ============================

function showHome() {

  location.reload();

}


// ============================
// Tasks
// ============================

async function showTasks() {

  const main =
    getMain();

  if (!main) return;


  main.innerHTML = `

    <section class="page-header">

      <h1>Tasks</h1>

      <p>
        Complete activities and earn BUX
      </p>

    </section>

    <section
      id="tasks-list"
      class="tasks-list"
    >

      <div class="loading-card">
        Loading tasks...
      </div>

    </section>

  `;


  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });


  try {

    const user =
      getTelegramUser();


    const response =
      await fetch(
        "/api/tasks?telegramUser=" +
        encodeURIComponent(
          JSON.stringify(user)
        )
      );


    const data =
      await response.json();


    currentTasks =
      data.tasks || [];


    renderTasks();


  } catch (error) {

    document.getElementById(
      "tasks-list"
    ).innerHTML = `

      <div class="error-card">

        Unable to load tasks.

        <button
          onclick="showTasks()"
        >
          Retry
        </button>

      </div>

    `;

  }

}


function renderTasks() {

  const container =
    document.getElementById(
      "tasks-list"
    );


  if (!container) return;


  container.innerHTML =
    currentTasks
      .map(task => {

        const buttonText =
          task.completed
            ? "Completed"
            : "Earn";


        return `

          <div
            class="task-card
            ${task.completed
              ? "task-completed"
              : ""}"
          >

            <div
              class="task-icon"
            >
              ${task.icon}
            </div>

            <div
              class="task-info"
            >

              <h3>
                ${task.title}
              </h3>

              <p>
                ${task.description}
              </p>

            </div>

            <button
              class="
                task-button
                ${task.completed
                  ? "completed"
                  : ""}
              "
              ${
                task.completed
                  ? "disabled"
                  : ""
              }
              onclick="
                startTask('${task.id}')
              "
            >
              ${buttonText}
            </button>

          </div>

        `;

      })
      .join("");

}


// ============================
// Start task
// ============================

async function startTask(
  taskId
) {

  const task =
    currentTasks.find(
      item =>
        item.id === taskId
    );


  if (!task) return;

  if (task.completed) return;


  const button =
    document.querySelector(
      `.task-card button[onclick*="'${taskId}'"]`
    );


  if (button) {

    button.disabled =
      true;

  }


  let remaining =
    task.duration;


  if (button) {

    button.textContent =
      formatTime(remaining);

  }


  const timer =
    setInterval(
      async () => {

        remaining--;


        if (button) {

          button.textContent =
            formatTime(
              remaining
            );

        }


        if (
          remaining <= 0
        ) {

          clearInterval(
            timer
          );


          await claimTask(
            taskId,
            button
          );

        }

      },
      1000
    );

}


// ============================
// Claim task
// ============================

async function claimTask(
  taskId,
  button
) {

  try {

    const data =
      await api(
        `/api/tasks/${taskId}/claim`,
        {
          method: "POST"
        }
      );


    coins =
      data.user.coins;

    bux =
      data.user.bux;


    updateBalance();


    if (button) {

      button.textContent =
        "Completed";

      button.classList.add(
        "completed"
      );

    }


    const task =
      currentTasks.find(
        item =>
          item.id === taskId
      );


    if (task) {

      task.completed =
        true;

    }


    alert(
      `+${data.reward} BUX earned!`
    );


  } catch (error) {

    alert(
      error.message
    );


    if (button) {

      button.disabled =
        false;

      button.textContent =
        "Earn";

    }

  }

}


// ============================
// Friends
// ============================

function showFriends() {

  const main =
    getMain();

  if (!main) return;


  main.innerHTML = `

    <section class="page-header">

      <h1>Friends</h1>

      <p>
        Invite friends and earn rewards
      </p>

    </section>


    <section
      class="friends-card"
    >

      <div class="friends-icon-large">
        👥
      </div>

      <div>

        <h3>
          Referral system
        </h3>

        <p>
          Invite your friends and earn BUX.
          Referral rewards will be activated soon.
        </p>

      </div>

    </section>

  `;


  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

}


async function loadWallet() {
  try {
    const data = await api("/api/wallet", { method: "GET" });
    connectedWallet = data.wallet || null;
    withdrawalConfig = { ...withdrawalConfig, ...(data.withdrawal || {}) };
    return connectedWallet;
  } catch (error) {
    console.error("Wallet load error:", error);
    connectedWallet = null;
    return null;
  }
}

function shortWalletAddress(address) {
  if (!address) return "";
  return address.slice(0, 6) + "…" + address.slice(-6);
}

async function prepareTonProof() {
  const data = await api("/api/ton-proof/payload", { method: "POST" });

  if (!data?.payload) {
    throw new Error("Could not prepare wallet verification.");
  }

  tonConnectUI.setConnectRequestParameters({
    state: "ready",
    value: { tonProof: data.payload }
  });
}

function initTonConnect() {
  if (tonConnectUI || !window.TON_CONNECT_UI?.TonConnectUI) return;

  tonConnectUI = new TON_CONNECT_UI.TonConnectUI({
    manifestUrl: `${window.location.origin}/tonconnect-manifest.json`
  });

  tonConnectUI.onStatusChange(async (wallet) => {
    if (!wallet?.account?.address) {
      connectedWallet = null;
      if (currentSection === "wallet" && typeof getMain === "function") showWallet();
      return;
    }

    const tonProof = wallet.connectItems?.tonProof;

    // A restored TON Connect session may not contain a fresh proof.
    // If the server already verified this exact address, keep the session.
    if (!tonProof || !("proof" in tonProof)) {
      try {
        const saved = await loadWallet();
        if (
          saved?.verified &&
          saved?.address === wallet.account.address
        ) {
          connectedWallet = saved;
          if (currentSection === "wallet") showWallet();
          return;
        }
      } catch {}

      try { await tonConnectUI.disconnect(); } catch {}
      alert("This wallet did not provide TON ownership proof. Please reconnect with a wallet that supports TON Proof.");
      return;
    }

    try {
      const data = await api("/api/ton-proof/verify", {
        method: "POST",
        body: JSON.stringify({
          address: wallet.account.address,
          network: wallet.account.chain || "-239",
          walletStateInit: wallet.account.walletStateInit,
          publicKey: wallet.account.publicKey || "",
          proof: tonProof.proof
        })
      });

      connectedWallet = data.wallet;
      if (currentSection === "wallet") showWallet();
    } catch (error) {
      try { await tonConnectUI.disconnect(); } catch {}
      connectedWallet = null;
      alert(error.message || "TON wallet verification failed.");
      if (currentSection === "wallet") showWallet();
    }
  });
}

async function connectTonWallet() {
  initTonConnect();

  if (!tonConnectUI) {
    alert("TON Connect could not be loaded. Please try again.");
    return;
  }

  try {
    tonConnectUI.setConnectRequestParameters({ state: "loading" });
    await prepareTonProof();
    await tonConnectUI.openModal();
  } catch (error) {
    tonConnectUI.setConnectRequestParameters(null);
    alert(error.message || "Unable to start TON wallet connection.");
  }
}

async function disconnectTonWallet() {
  try {
    if (tonConnectUI) await tonConnectUI.disconnect();
    await api("/api/wallet/disconnect", { method: "POST" });
    connectedWallet = null;
    if (currentSection === "wallet") showWallet();
  } catch (error) {
    alert(error.message);
  }
}

// ============================
// Wallet
// ============================

async function showWallet() {

  try {
    await loadUser();
  } catch (error) {
    console.error("Wallet balance refresh error:", error);
  }

  if (!connectedWallet) {
    await loadWallet();
  }

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
  const buxPerTon = Math.max(1, Number(withdrawalConfig.buxPerTon) || 10000);
  const minimumBux = Math.max(1, Number(withdrawalConfig.minimumBux) || 2000);
  const availableTon = bux / buxPerTon;
  const minimumTon = minimumBux / buxPerTon;
  const maxAmountBux = Math.floor(bux / 1000) * 1000;
  const maxTon = maxAmountBux / buxPerTon;

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
          <small>TON</small>
          <strong>${availableTon.toFixed(4)}</strong>
        </div>
      </div>

      <div class="withdrawal-rate-box">
        <div>
          <span>Minimum withdrawal</span>
          <strong>${minimumTon.toFixed(4)} TON</strong>
        </div>
        <div>
          <span>Rate</span>
          <strong>${formatNumber(buxPerTon)} BUX = 1 TON</strong>
        </div>
      </div>

      <div class="withdrawal-exchange-box">
        <div class="withdrawal-exchange-row">
          <span>Available BUX</span>
          <strong>${formatNumber(bux)}</strong>
        </div>
        <div class="withdrawal-exchange-row">
          <span>TON you can withdraw</span>
          <strong>${maxTon.toFixed(4)} TON</strong>
        </div>
        <div class="withdrawal-exchange-row muted-row">
          <span>Withdrawal fee</span>
          <strong>${formatNumber(withdrawalConfig.feeBux)} BUX</strong>
        </div>
      </div>

      <div class="ton-wallet-box ${walletConnected ? "connected" : ""}">
        <div class="ton-wallet-head">
          <div>
            <strong>TON Wallet</strong>
            <small>${walletConnected ? "● Connected" : "○ Not connected"}</small>
          </div>
          <span class="ton-wallet-icon">TON</span>
        </div>

        ${walletConnected ? `
          <div class="wallet-address">${shortWalletAddress(address)}</div>
          <button class="wallet-secondary-button" onclick="disconnectTonWallet()">Disconnect Wallet</button>
          <button class="withdraw-button" onclick="withdraw()" ${bux < minimumBux ? "disabled" : ""}>
            Withdraw ${maxTon.toFixed(4)} TON
          </button>
        ` : `
          <p class="wallet-help">Connect and verify your TON wallet before requesting a withdrawal.</p>
          <button class="connect-wallet-button" onclick="connectTonWallet()">🔗 Connect TON Wallet</button>
        `}
      </div>

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
              const netTon = amountTon || ((Number(w.netBux || 0)) / buxPerTon);
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
}

function withdrawalStatusMeta(status) {
  const value = String(status || "pending").toLowerCase();
  if (value === "approved") return { label: "Approve", className: "status-approved" };
  if (value === "paid") return { label: "Paid", className: "status-paid" };
  if (value === "rejected" || value === "cancelled") return { label: "Cancel", className: "status-cancelled" };
  return { label: "Pending", className: "status-pending" };
}

function formatWithdrawalDate(timestamp) {
  const date = new Date(Number(timestamp) || 0);
  if (!Number.isFinite(date.getTime()) || date.getTime() <= 0) return "-";
  return date.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

async function withdraw() {

  if (!connectedWallet?.address || !connectedWallet?.verified) {
    alert("Connect and verify your TON wallet first.");
    return;
  }

  if (bux < withdrawalConfig.minimumBux) {
    alert(`Minimum withdrawal is ${formatNumber(withdrawalConfig.minimumBux)} BUX.`);
    return;
  }

  const amountBux = Math.floor(bux / 1000) * 1000;
  if (amountBux < withdrawalConfig.minimumBux) {
    alert(`Minimum withdrawal is ${formatNumber(withdrawalConfig.minimumBux)} BUX.`);
    return;
  }

  const feeBux = Number(withdrawalConfig.feeBux) || 0;
  const netBux = amountBux - feeBux;
  if (feeBux >= amountBux) {
    alert("The withdrawal fee is too high for this withdrawal amount. Please contact the administrator.");
    return;
  }

  const tonAmount = amountBux / withdrawalConfig.buxPerTon;
  const netTonAmount = netBux / withdrawalConfig.buxPerTon;
  if (!confirm(`Request withdrawal of ${tonAmount.toFixed(4)} TON?\n\nFee: ${formatNumber(feeBux)} BUX\nYou will receive: ${netTonAmount.toFixed(4)} TON`)) return;

  try {
    const data = await api("/api/withdrawals", {
      method: "POST",
      body: JSON.stringify({
        amountBux
      })
    });

    bux -= amountBux;
    updateBalance();
    alert(`Withdrawal #${data.withdrawal.id} created and is pending admin review.`);
    if (currentSection === "wallet") showWallet();
  } catch (error) {
    alert(error.message);
  }
}

// ============================
// Countdown
// ============================

setInterval(() => {

  if (
    dailyRemaining > 0
  ) {

    dailyRemaining--;

    updateDaily();

  }

}, 1000);


// ============================
// Start
// ============================

updateBalance();

updateDaily();

loadUser();
initTonConnect();
