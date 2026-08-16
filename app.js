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

      ...(options.headers || {})

    }

  };


  if (config.body) {

    try {

      const body =
        JSON.parse(config.body);

      body.telegramUser =
        telegramUser;

      config.body =
        JSON.stringify(body);

    } catch (error) {

      console.error(error);

    }

  } else {

    config.body =
      JSON.stringify({
        telegramUser
      });

    config.method =
      options.method || "POST";

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

  const coinsElement =
    document.getElementById(
      "coins"
    );

  const buxElement =
    document.getElementById(
      "bux"
    );

  const tonElement =
    document.getElementById(
      "ton"
    );


  if (coinsElement) {

    coinsElement.textContent =
      formatNumber(coins);

  }


  if (buxElement) {

    buxElement.textContent =
      formatNumber(bux);

  }


  if (tonElement) {

    tonElement.textContent =
      (bux / 10000)
        .toFixed(4);

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


// ============================
// Wallet
// ============================

function showWallet() {

  const main =
    getMain();

  if (!main) return;


  main.innerHTML = `

    <section class="page-header">

      <h1>Wallet</h1>

      <p>
        Manage your BUX and withdrawals
      </p>

    </section>


    <section
      class="wallet-card"
    >

      <div
        class="wallet-top"
      >

        <span>
          Available BUX
        </span>

        <span
          class="online-dot"
        >
          ● Online
        </span>

      </div>


      <div
        class="wallet-balance"
      >

        💰

        <strong>
          ${formatNumber(bux)}
        </strong>

      </div>


      <p>
        Minimum withdrawal:
        <b>2,000 BUX</b>
      </p>

      <button
        class="withdraw-button"
        onclick="withdraw()"
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


function withdraw() {

  if (
    bux < 2000
  ) {

    alert(
      "Minimum withdrawal is 2,000 BUX."
    );

    return;

  }


  alert(
    "Withdrawal system will be activated in the next stage."
  );

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
