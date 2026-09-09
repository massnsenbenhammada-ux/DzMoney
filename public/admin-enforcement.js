const enforcementTelegram = window.Telegram?.WebApp;
const enforcementState = document.getElementById("enforcementState");
const enforcementStatus = document.getElementById("enforcementCurrentStatus");
const enforcementMembership = document.getElementById(
  "enforcementMembershipStatus",
);
const enforcementUserId = document.getElementById("enforcementUserId");
const enforcementReason = document.getElementById("enforcementReason");
const enforcementEvidence = document.getElementById("enforcementEvidence");
function setEnforcementState(message, isError = false) {
  enforcementState.textContent = message;
  enforcementState.dataset.state = isError ? "error" : "ok";
}
function authHeaders(json = false) {
  return {
    ...(json ? { "Content-Type": "application/json" } : {}),
    "X-Telegram-Init-Data": enforcementTelegram?.initData || "",
  };
}
function requireUserId() {
  const userId = enforcementUserId.value.trim();
  if (!/^\d+$/.test(userId)) throw new Error("Enter a valid DzMoney user ID.");
  return userId;
}
async function loadEnforcementState() {
  try {
    const userId = requireUserId();
    setEnforcementState("Loading…");
    const response = await fetch(
      `/api/admin/users/enforcement/${encodeURIComponent(userId)}`,
      { headers: authHeaders(), cache: "no-store" },
    );
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error || "Unable to load account status");
    enforcementStatus.textContent = data.accountStatus;
    enforcementMembership.textContent = `Membership: ${data.membershipStatus || "none"}`;
    setEnforcementState("Status loaded.");
  } catch (error) {
    setEnforcementState(
      error.message || "Unable to load account status.",
      true,
    );
  }
}
async function applyEnforcement(action) {
  try {
    const userId = requireUserId();
    const reason = enforcementReason.value.trim();
    if (!reason) throw new Error("Reason is required.");
    const button = document.getElementById(
      `enforcement${action[0].toUpperCase()}${action.slice(1)}`,
    );
    if (button) button.disabled = true;
    setEnforcementState("Applying…");
    const response = await fetch(
      `/api/admin/users/enforcement/${encodeURIComponent(userId)}/status`,
      {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({
          action,
          reason,
          evidence: enforcementEvidence.value.trim(),
          idempotencyKey: crypto.randomUUID(),
        }),
      },
    );
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error || "Unable to update account status");
    enforcementStatus.textContent = data.accountStatus;
    enforcementMembership.textContent = `Membership: ${data.membershipStatus || "none"}`;
    setEnforcementState(
      data.duplicate
        ? "Existing action returned (idempotent)."
        : "Action applied and audited.",
    );
  } catch (error) {
    setEnforcementState(
      error.message || "Unable to update account status.",
      true,
    );
  } finally {
    ["Suspend", "Ban", "Activate"].forEach((name) => {
      const button = document.getElementById(`enforcement${name}`);
      if (button) button.disabled = false;
    });
  }
}
document
  .getElementById("enforcementLoad")
  .addEventListener("click", loadEnforcementState);
document
  .getElementById("enforcementSuspend")
  .addEventListener("click", () => applyEnforcement("suspend"));
document
  .getElementById("enforcementBan")
  .addEventListener("click", () => applyEnforcement("ban"));
document
  .getElementById("enforcementActivate")
  .addEventListener("click", () => applyEnforcement("activate"));
