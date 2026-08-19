/* DzMoney Squad UI. Keeps Squad UI isolated from wallet, tasks and referral earning logic. */
(function () {
  "use strict";

  const state = { members: null, target: null, bonus: null };

  function formatNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n.toLocaleString() : "—";
  }

  function setHome(data) {
    const members = Number(data?.members);
    const target = Number(data?.target);
    const bonus = Number(data?.bonusPercent);
    const count = document.getElementById("home-squad-count");
    const targetEl = document.getElementById("home-squad-target");
    const progress = document.getElementById("home-squad-progress");
    const status = document.getElementById("home-squad-status");
    const bonusEl = document.getElementById("home-squad-bonus");
    if (count) count.textContent = Number.isFinite(members) ? formatNumber(members) : "—";
    if (targetEl) targetEl.textContent = Number.isFinite(target) && target > 0 ? formatNumber(target) : "—";
    if (progress) {
      const pct = Number.isFinite(members) && Number.isFinite(target) && target > 0
        ? Math.min(100, Math.max(0, members / target * 100)) : 0;
      progress.style.width = pct + "%";
    }
    if (status) status.textContent = data?.completed ? "🏆 Squad completed" : "Your Squad";
    if (bonusEl) bonusEl.textContent = Number.isFinite(bonus) ? `+${bonus}% task bonus` : "Bonus configured by admin";
  }

  async function loadSquad() {
    if (typeof window.api !== "function") return;
    try {
      const data = await window.api("/api/squad", { method: "GET" });
      if (data?.success) {
        state.members = data.members;
        state.target = data.target;
        state.bonus = data.bonusPercent;
        setHome(data);
      }
    } catch (error) {
      // The UI remains usable while the backend Squad module is being deployed.
      setHome({});
      console.debug("Squad data unavailable:", error?.message || error);
    }
  }

  function openSquadPage() {
    const main = document.querySelector("main");
    if (!main) return;

    if (typeof window.setActiveNav === "function") window.setActiveNav("home");

    main.innerHTML = `
      <section class="squad-page">
        <div class="squad-page-header">
          <button class="squad-back" type="button" id="squad-back">‹</button>
          <div><h1>DzMoney Squad</h1><p>Build your community together.</p></div>
        </div>

        <section class="squad-hero">
          <div class="squad-hero-icon">👥</div>
          <h2>Your Squad</h2>
          <p>Everyone in your referral tree belongs to the same Squad.</p>
          <div class="squad-big-number" id="squad-members">— <span>members</span></div>
          <div class="squad-page-progress"><span id="squad-page-progress"></span></div>
          <div class="squad-progress-label"><span id="squad-progress-left">Members</span><span id="squad-progress-right">Target —</span></div>
        </section>

        <section class="squad-info-box squad-bonus">
          <div><h3>🏆 Squad reward</h3><p>When the Squad reaches the target, eligible members receive the task bonus configured by the administrator.</p></div>
          <strong id="squad-bonus">—</strong>
        </section>

        <section class="squad-info-box">
          <h3>How does it work?</h3>
          <ul>
            <li>Join DzMoney through an existing member's referral link.</li>
            <li>You automatically become part of that member's Squad.</li>
            <li>If someone you invited brings another friend, that friend joins the same Squad too.</li>
            <li>There are no Squad levels and no fixed limit on how many people can grow the community.</li>
          </ul>
        </section>

        <section class="squad-info-box">
          <h3>🔗 Squad and Referral are separate</h3>
          <p>Your Referral earnings are calculated independently. Squad membership does not replace, reduce or merge with your Referral earnings.</p>
        </section>

        <section class="squad-info-box squad-warning">
          <h3>⚠️ Fair-play warning</h3>
          <p>Do not use fake accounts, bots, self-referrals, purchased accounts or other methods designed to artificially increase a Squad. DzMoney may remove fraudulent members, disable Squad rewards or take action against accounts involved in manipulation.</p>
        </section>
      </section>
    `;

    document.getElementById("squad-back")?.addEventListener("click", () => {
      if (typeof window.openSection === "function") window.openSection("home");
      else location.reload();
    });

    renderPageData();
    loadSquad().then(renderPageData);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderPageData() {
    const members = Number(state.members);
    const target = Number(state.target);
    const bonus = Number(state.bonus);
    const memberEl = document.getElementById("squad-members");
    const progressEl = document.getElementById("squad-page-progress");
    const leftEl = document.getElementById("squad-progress-left");
    const rightEl = document.getElementById("squad-progress-right");
    const bonusEl = document.getElementById("squad-bonus");
    if (memberEl) memberEl.innerHTML = `${Number.isFinite(members) ? formatNumber(members) : "—"} <span>members</span>`;
    if (rightEl) rightEl.textContent = Number.isFinite(target) && target > 0 ? `Target ${formatNumber(target)}` : "Target configured by admin";
    if (leftEl) leftEl.textContent = Number.isFinite(members) ? `${formatNumber(members)} members` : "Loading Squad data...";
    if (progressEl) progressEl.style.width = Number.isFinite(members) && Number.isFinite(target) && target > 0 ? Math.min(100, members / target * 100) + "%" : "0%";
    if (bonusEl) bonusEl.textContent = Number.isFinite(bonus) ? `+${bonus}%` : "—";
  }

  function openSquadInfo() {
    openSquadPage();
  }

  window.openSquadPage = openSquadPage;
  window.openSquadInfo = openSquadInfo;
  window.loadSquad = loadSquad;

  document.addEventListener("DOMContentLoaded", loadSquad);
})();
