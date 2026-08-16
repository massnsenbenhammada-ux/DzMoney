const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();
  tg.expand();
}


// ============================
// DzMoney State
// ============================

let coins = 0;
let bux = 0;

let dailyAvailable = true;
let dailyRemaining = 0;


// ============================
// Save original Home
// ============================

const mainElement = document.querySelector("main");

const homeHTML = mainElement
  ? mainElement.innerHTML
  : "";


// ============================
// Helpers
// ============================

function formatNumber(value) {
  return Number(value).toLocaleString();
}


function updateBalance() {

  const coinsElement =
    document.getElementById("coins");

  const buxElement =
    document.getElementById("bux");

  const tonElement =
    document.getElementById("ton");


  if (coinsElement) {

    coinsElement.textContent =
      formatNumber(coins);

  }


  if (buxElement) {

    buxElement.textContent =
      formatNumber(bux);

  }


  if (tonElement) {

    const ton =
      bux / 10000;

    tonElement.textContent =
      ton.toFixed(4);

  }
}


// ============================
// Daily Reward
// ============================

function formatTime(seconds) {

  const hours =
    Math.floor(seconds / 3600);

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
        String(value).padStart(2, "0")
    )
    .join(":");
}


function updateDaily() {

  const dailyButton =
    document.getElementById("daily-button");

  const dailyText =
    document.getElementById("daily-text");


  if (!dailyButton || !dailyText) {
    return;
  }


  if (dailyRemaining > 0) {

    dailyButton.disabled = true;

    dailyButton.textContent =
      formatTime(dailyRemaining);

    dailyText.textContent =
      "Next reward available in " +
      formatTime(dailyRemaining);

  } else {

    dailyButton.disabled = false;

    dailyButton.textContent =
      "Claim";

    dailyText.textContent =
      "Your daily reward is ready!";

  }
}


function bindDailyReward() {

  const dailyButton =
    document.getElementById("daily-button");


  if (!dailyButton) {
    return;
  }


  dailyButton.addEventListener(
    "click",
    () => {

      if (!dailyAvailable) {
        return;
      }


      // Daily reward
      coins += 1000;
      bux += 1;


      dailyAvailable = false;

      dailyRemaining =
        24 * 60 * 60;


      updateBalance();
      updateDaily();

    }
  );
}


// ============================
// Navigation
// ============================

function openSection(section) {

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


  if (section === "home") {
    showHome();
  }


  if (section === "tasks") {
    showTasks();
  }


  if (section === "friends") {
    showFriends();
  }


  if (section === "wallet") {
    showWallet();
  }
}


// ============================
// HOME
// ============================

function showHome() {

  if (!mainElement) {
    return;
  }


  mainElement.innerHTML =
    homeHTML;


  bindDailyReward();

  updateBalance();
  updateDaily();


  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

}


// ============================
// TASKS
// ============================

function showTasks() {

  if (!mainElement) {
    return;
  }


  mainElement.innerHTML = `

    <section class="tasks-page">

      <div class="section-heading">

        <h2>
          Tasks
        </h2>

        <p>
          Complete activities and earn BUX
        </p>

      </div>


      <div class="task-list">


        <!-- TASK 1 -->

        <div class="task-card">

          <div class="task-icon">
            📺
          </div>

          <div class="task-info">

            <h3>
              Watch a video
            </h3>

            <p>
              Watch the video and earn 10 BUX
            </p>

          </div>

          <button
            class="task-button"
            onclick="startTask(this, 10, 100)"
          >
            Earn
          </button>

        </div>


        <!-- TASK 2 -->

        <div class="task-card">

          <div class="task-icon">
            🌐
          </div>

          <div class="task-info">

            <h3>
              Visit a website
            </h3>

            <p>
              Visit the website and earn 25 BUX
            </p>

          </div>

          <button
            class="task-button"
            onclick="startTask(this, 25, 250)"
          >
            Earn
          </button>

        </div>


        <!-- TASK 3 -->

        <div class="task-card">

          <div class="task-icon">
            ⭐
          </div>

          <div class="task-info">

            <h3>
              Daily activity
            </h3>

            <p>
              Complete today's activity and earn 50 BUX
            </p>

          </div>

          <button
            class="task-button"
            onclick="startTask(this, 50, 500)"
          >
            Earn
          </button>

        </div>


        <!-- TASK 4 -->

        <div class="task-card">

          <div class="task-icon">
            🎁
          </div>

          <div class="task-info">

            <h3>
              Special task
            </h3>

            <p>
              Complete the special task and earn 100 BUX
            </p>

          </div>

          <button
            class="task-button"
            onclick="startTask(this, 100, 1000)"
          >
            Earn
          </button>

        </div>


      </div>

    </section>

  `;


  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

}


// ============================
// Start Task
// ============================

function startTask(button, reward, coinReward) {

  if (!button || button.disabled) {
    return;
  }


  button.disabled = true;

  button.textContent =
    "Working...";


  // Demo task timer
  setTimeout(() => {

    bux += reward;

    coins += coinReward;


    updateBalance();


    button.textContent =
      "Completed";

    button.classList.add(
      "completed"
    );


  }, 2000);

}


// ============================
// FRIENDS
// ============================

function showFriends() {

  if (!mainElement) {
    return;
  }


  mainElement.innerHTML = `

    <section class="tasks-page">

      <div class="section-heading">

        <h2>
          Friends
        </h2>

        <p>
          Invite friends and earn rewards
        </p>

      </div>


      <div class="info-card">

        <div class="info-icon">
          👥
        </div>

        <div>

          <strong>
            Referral system
          </strong>

          <p>
            Invite your friends and earn BUX.
            Referral rewards will be activated soon.
          </p>

        </div>

      </div>

    </section>

  `;


  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

}


// ============================
// WALLET
// ============================

function showWallet() {

  if (!mainElement) {
    return;
  }


  mainElement.innerHTML = `

    <section class="tasks-page">

      <div class="section-heading">

        <h2>
          Wallet
        </h2>

        <p>
          Manage your BUX and withdrawals
        </p>

      </div>


      <section class="balance-card">

        <div class="balance-top">

          <span>
            Available BUX
          </span>

          <span class="online-dot">
            ● Online
          </span>

        </div>


        <div class="coins">

          <span class="coin-icon">
            💰
          </span>

          <span>
            ${formatNumber(bux)}
          </span>

        </div>


        <div class="balance-label">
          BUX
        </div>


        <div class="balance-divider"></div>


        <div class="mini-balances">

          <div class="mini-balance">

            <span class="mini-icon">
              TON
            </span>

            <div>

              <strong>
                ${(bux / 10000).toFixed(4)}
              </strong>

              <small>
                Estimated TON
              </small>

            </div>

          </div>


          <div class="mini-balance">

            <span class="mini-icon">
              💎
            </span>

            <div>

              <strong>
                ${formatNumber(coins)}
              </strong>

              <small>
                Coins
              </small>

            </div>

          </div>

        </div>

      </section>


      <section class="info-card">

        <div class="info-icon">
          💰
        </div>

        <div>

          <strong>
            Withdrawals
          </strong>

          <p>
            Minimum withdrawal:
            <b>2,000 BUX</b>
            = 0.2 TON
          </p>

        </div>

      </section>


      <button
        class="claim-button"
        style="
          width:100%;
          margin-top:16px;
          padding:15px;
          font-size:13px;
        "
        onclick="requestWithdrawal()"
      >
        Withdraw
      </button>

    </section>

  `;


  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

}


// ============================
// Withdrawal
// ============================

function requestWithdrawal() {

  if (bux < 2000) {

    alert(
      "Minimum withdrawal is 2,000 BUX."
    );

    return;
  }


  alert(
    "Withdrawal system will be connected to the wallet backend next."
  );

}


// ============================
// Daily Countdown
// ============================

setInterval(() => {

  if (dailyRemaining > 0) {

    dailyRemaining--;

    if (dailyRemaining <= 0) {

      dailyRemaining = 0;
      dailyAvailable = true;

    }


    updateDaily();

  }

}, 1000);


// ============================
// Start
// ============================

updateBalance();

bindDailyReward();

updateDaily();
