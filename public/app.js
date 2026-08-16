const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();
  tg.expand();
}


// ============================
// Demo state
// ============================

let coins = 0;
let bux = 0;

let dailyAvailable = true;
let dailyRemaining = 0;


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
// Daily reward
// ============================

const dailyButton =
  document.getElementById("daily-button");

const dailyText =
  document.getElementById("daily-text");


function updateDaily() {

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


if (dailyButton) {

  dailyButton.addEventListener(
    "click",
    () => {

      if (!dailyAvailable) {
        return;
      }


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
// Temporary pages
// ============================

function showHome() {

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

}


function showTasks() {

  alert(
    "Tasks system is coming next."
  );

}


function showFriends() {

  alert(
    "Friends system is coming next."
  );

}


function showWallet() {

  alert(
    "Wallet system is coming next."
  );

}


// ============================
// Daily countdown
// ============================

setInterval(() => {

  if (dailyRemaining > 0) {

    dailyRemaining--;

    updateDaily();

  }

}, 1000);


// ============================
// Start
// ============================

updateBalance();
updateDaily();
