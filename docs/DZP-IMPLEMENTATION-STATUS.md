# DZP implementation status

Implemented now:
- Locked business specification in `docs/DZP-REWARDS-POOL-SPEC.md`.
- Idempotent activity DZP ledger in `dzp_activity_ledger`.
- One-time referral DZP ledger in `referral_dzp_rewards` keyed by referred user.
- Admin-controlled DZP settings table with `referral_dzp_reward` and `default_activity_dzp` defaults at zero.
- Server-side DZP service in `services/dzp-reward-service.js`.

Required integration points before enabling live DZP grants:
- Call `grantActivityDzp()` only after a task completion is finalized server-side.
- Call `grantActivityDzp()` only after an advertisement is confirmed by AdsGram server-side.
- Call `grantReferralDzpOnce()` only when the referred user becomes qualified (first qualifying task/ad), using the Admin-defined referral DZP value.
- Do not call the referral grant on every subsequent referral activity.
- Do not add referral DZP to recurring activity DZP.
- Do not convert DZP to DZX.

Safety:
- Both ledgers are idempotent.
- Defaults are zero until Admin configures values.
- This document deliberately does not define numerical reward values that were not agreed by the project owner.
