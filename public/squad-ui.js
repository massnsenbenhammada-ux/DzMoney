/* DzMoney Squad UI foundation.
   Frontend-only: no balance, referral, task or wallet logic is changed here.
   The real Squad data/API will be connected in a later backend step. */

(function () {
  "use strict";

  function openSquadInfo() {
    const existing = document.getElementById("squad-info-modal");
    if (existing) {
      existing.classList.remove("hidden");
      return;
    }

    const modal = document.createElement("div");
    modal.id = "squad-info-modal";
    modal.className = "squad-modal";
    modal.innerHTML = `
      <div class="squad-modal-card" role="dialog" aria-modal="true" aria-labelledby="squad-modal-title">
        <button class="squad-modal-close" type="button" aria-label="Close">✕</button>
        <div class="squad-modal-icon">💎</div>
        <h2 id="squad-modal-title">DzMoney Squad</h2>
        <p class="squad-modal-lead">Build one open community tree together.</p>
        <div class="squad-rule">
          <span>🏆 Squad goal</span>
          <strong>Configured by admin</strong>
        </div>
        <div class="squad-rule">
          <span>✨ Completion bonus</span>
          <strong>Configured by admin</strong>
        </div>
        <p class="squad-modal-note">Squad membership and Squad bonuses are separate from Referral earnings.</p>
        <button class="squad-primary" type="button" id="squad-modal-ok">Got it</button>
      </div>
    `;

    document.body.appendChild(modal);

    const close = () => modal.classList.add("hidden");
    modal.querySelector(".squad-modal-close").addEventListener("click", close);
    modal.querySelector("#squad-modal-ok").addEventListener("click", close);
    modal.addEventListener("click", event => {
      if (event.target === modal) close();
    });
  }

  window.openSquadInfo = openSquadInfo;
})();
