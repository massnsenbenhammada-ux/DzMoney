"use strict";

const VERIFIERS = Object.freeze({
  daily_checkin: "server_checkin",
  check_updates: "updates_channel",
  share_friends: "share",
  view_ads: "ad_count",
  invite_1: "qualified_referrals",
  invite_10: "qualified_referrals",
  game: "partner_callback",
  social: "telegram_or_partner_verification",
  web: "tracking_or_callback",
  special: "manual_review",
  partner: "partner_callback"
});

function requiredVerifier(task) {
  if (!task) throw new Error("Task is required.");
  const key = task.id || task.type;
  const verifier = VERIFIERS[key] || VERIFIERS[String(task.type || "").toLowerCase()];
  if (!verifier) throw new Error("No verification method configured for this task.");
  return verifier;
}

function assertVerified(task, verification) {
  const expected = requiredVerifier(task);
  if (!verification || verification.verified !== true) throw new Error("Task completion is not verified.");
  if (verification.method && verification.method !== expected) {
    throw new Error("Verification method does not match the task requirement.");
  }
  return true;
}

module.exports = { VERIFIERS, requiredVerifier, assertVerified };
