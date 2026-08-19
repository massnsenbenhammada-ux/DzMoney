"use strict";

const DAILY_TASKS = Object.freeze([
  { id: "daily_checkin", type: "daily", title: "Daily Check-in", rewardCoins: 1000, rewardDZX: 1, cadence: "24h" },
  { id: "check_updates", type: "daily", title: "Check for Update", rewardCoins: 1000, rewardDZX: 1, verification: "updates_channel" },
  { id: "share_friends", type: "daily", title: "Share with Friends", rewardCoins: 1000, rewardDZX: 1, verification: "share" },
  { id: "view_ads", type: "daily", title: "View Ads", rewardCoins: 1000, rewardDZX: 1, verification: "ad_count", countSetting: "daily_ad_task_count" },
  { id: "invite_1", type: "daily", title: "Invite 1 Friend", rewardCoins: 10000, rewardDZX: 10, verification: "qualified_referrals", requiredCount: 1, referralLifetimeBonus: true },
  { id: "invite_10", type: "daily", title: "Invite 10 Friends", rewardCoins: 100000, rewardDZX: 100, verification: "qualified_referrals", requiredCount: 10, referralLifetimeBonus: true }
]);

const TASK_TYPES = Object.freeze(["daily", "game", "social", "web", "special", "partner"]);

function getDailyTasks() { return DAILY_TASKS.map(task => ({ ...task })); }
function isTaskType(value) { return TASK_TYPES.includes(String(value || "").toLowerCase()); }

module.exports = { DAILY_TASKS, TASK_TYPES, getDailyTasks, isTaskType };
