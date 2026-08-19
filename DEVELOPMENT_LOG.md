# DzMoney — Development Log

This file records implementation milestones and important architectural decisions. Update it after each significant development step.

## 2026-08-19 — Roadmap Baseline

- Added `PROJECT_ROADMAP.md` as the authoritative product/economic specification.
- Agreed to preserve the existing application and avoid destructive rewrites.
- Development must proceed incrementally and safely.

## 2026-08-19 — Phase 1 Economic Foundation Started

- Added `services/economy.js` with isolated economic primitives so the existing Express/wallet/task implementation is not replaced.
- Added `tests/economy.test.js` covering the agreed initial economic rules.
- Initial constants represented in the new module:
  - 1 TON = 10,000 DZX.
  - Minimum deposit = 1 TON.
  - Minimum withdrawal = 0.2 TON.
  - Minimum withdrawal Coins requirement = 2,000,000 Coins.
  - Referral = 20% of base activity reward only.
  - Squad daily activity threshold = 50%.
  - Squad bonus ceiling = 100%.
- Implemented pure functions for TON/DZX conversion, referral calculation, daily Squad activation, Squad bonus resolution, activity reward calculation, economic-budget validation, and withdrawal requirements.
- No existing `server.js`, wallet code, withdrawal code, or frontend code was deleted or rewritten in this step.

## 2026-08-19 — Phase 1 Database Foundation

- Added `scripts/migrate-economy.js` as a non-destructive startup migration.
- Added new `users` columns for `dzx`, `dzp`, `deposited_dzx`, `withdrawable_dzx`, and `locked_dzx` without removing legacy BUX fields.
- DZX storage was upgraded to `NUMERIC(30,9)` so valid fractional rewards such as 0.2 DZX can be represented exactly.
- Added `economy_ledger` for auditable DZX/DZP/Coins entries.
- Added `economy_settings` for Admin-controlled economic parameters.
- Added isolated referral qualification fields.
- Added initial hierarchical Squad tables: `squads`, `squad_members`, and `squad_daily_activity`.
- Added package catalog and `user_packages` tables for future revenue-based Rewards Pool weights.
- Seeded initial economic settings: 10,000 DZX/Ton, 1 TON minimum deposit, 0.2 TON minimum withdrawal, 2,000,000 Coins withdrawal requirement, 20% referral, 50% Squad activity threshold, 100% Squad bonus ceiling.
- Updated startup so the economic migration completes before the existing wallet/withdrawal middleware and `server.js` start.
- Existing BUX columns and current wallet/withdrawal implementation remain untouched for safe incremental migration.
- No automatic BUX→DZX balance conversion has been performed.

## 2026-08-19 — Transactional Ledger Layer

- Added `services/economy-ledger.js` with transaction-aware DZX credit/debit primitives.
- Ledger writes and balance updates are designed to use the same PostgreSQL client/transaction.
- Supports available, withdrawable, and locked DZX buckets.
- Prevents debits when the selected bucket has insufficient balance.
- This layer is intentionally not wired into legacy endpoints yet.

## 2026-08-19 — Non-destructive Application Bridge

- Added `economy-integration.js` as a preloaded Express bridge.
- Added `GET /api/economy/status` for health verification of the new economic layer.
- Added authenticated `GET /api/economy/me` to expose Coins, DZX, DZP, deposited/withdrawable/locked DZX buckets, and economic settings without changing legacy wallet/task responses.
- Existing BUX wallet, task rewards, withdrawal endpoints, and frontend responses remain untouched.

## 2026-08-19 — Safe TON Deposit Layer

- Added `services/dzx-deposit.js` as the transactional DZX crediting primitive.
- Added idempotency protection using `network + external transaction id`, preventing duplicate DZX credit from the same verified TON transaction.
- A verified deposit credits `deposited_dzx` and records the matching ledger entry in the same PostgreSQL transaction.
- The module deliberately does not accept unverified client-supplied transactions.

## 2026-08-19 — Conservative TON Verification Gate

- Added `services/ton-deposit-verifier.js`.
- The verifier accepts only a normalized candidate supplied by a trusted TON RPC/indexer adapter.
- It validates network, transaction id, recipient deposit address, sender address format when supplied, minimum deposit amount, successful transaction state, confirmation count, and transaction timestamp / processing window.
- The verifier does not credit DZX itself.

## 2026-08-19 — TON Adapter and Deposit Orchestration

- Added `services/ton-center-adapter.js` as a read-only TON Center API v3 adapter.
- Added `services/ton-deposit-service.js` to orchestrate: duplicate check → blockchain lookup → verification gate → transactional DZX credit.
- The adapter does not credit balances and does not trust client-supplied amounts.
- TON Center API credentials remain server-side; no API key or wallet address is hardcoded.
- Added `tests/ton-center-adapter.test.js` and `tests/ton-deposit-service.test.js` guards.
- No public deposit endpoint or automatic production scanner has been enabled yet.

## 2026-08-19 — Task Catalog Foundation

- Added `services/task-catalog.js` with the canonical six Daily Tasks and agreed rewards.
- Added `services/task-verification.js` with server-side verification methods for Daily, Game, Social, Web, Special, and Partner tasks.
- Added `scripts/migrate-task-catalog.js` creating persistent `tasks` and `task_completions` tables.
- Added `scripts/seed-task-catalog.js` to safely upsert the canonical Daily Tasks without duplicating them.
- Updated startup to run task migrations/seeding before the existing server starts.
- Existing legacy task routes remain untouched to avoid double rewards during migration.
- `View Ads` stores an Admin setting key (`daily_ad_task_count`) rather than hardcoding the required ad count.

## 2026-08-19 — Daily Activity Implementation Started

- Added `services/daily-task-service.js` with transactional server-side reward processing for `Daily Check-in`.
- Daily Check-in uses the existing `task_completions` and `task_reward_events` records and credits both Coins and DZX in the same PostgreSQL transaction as the ledger entries.
- Duplicate Daily Check-in rewards are blocked for the 24-hour window.
- Added `/api/v2/tasks/:taskId/verify` behind Telegram WebApp authentication; tasks requiring external verification are deliberately rejected rather than being rewarded from frontend claims.
- Added Admin-controlled daily settings: ad count, updates channel URL, and canonical Daily reward values.
- Updated the task API to expose the current Admin-controlled ad count and update-channel metadata.
- Updated the Daily Activity UI so Daily Check-in performs the secure claim flow, Check for Update opens the configured updates channel, and Share with Friends opens the Telegram share flow.
- Invite and ad-network tasks remain verification-gated and are not falsely credited until their trusted verification integrations are implemented.

## 2026-08-19 — AdsGram Real Reward Callback Integration

- Replaced the missing/placeholder `showAdsGramAd` path in `public/task-v2-ui.js` with a real AdsGram SDK integration using the official Rewarded `onReward` event.
- AdsGram SDK is loaded from `https://sad.adsgram.ai/js/sad.min.js` and initialized with the Admin-provided `adsgramBlockId` from the current `view_ads` task metadata.
- The ad progress counter is advanced only after AdsGram fires the real `onReward` callback; a resolved `AdController.show()` promise alone is intentionally not treated as reward proof.
- Added cleanup for `onReward`, `onSkip`, `onError`, and `onBannerNotFound` listeners so callbacks cannot remain attached across ad sessions.
- No fake timeout, synthetic callback, or frontend-only counter increment was introduced.

## 2026-08-19 — AdsGram Server-Side Reward URL Confirmation

- Added `adsgram_ad_views` as a pending/confirmed server-side view record.
- Added `confirmAdsGramReward()` to consume a pending AdsGram view only when AdsGram calls the server-side Reward URL.
- Added `GET /api/adsgram/reward?userid=[userId]`; this endpoint intentionally does not require Telegram WebApp authentication because the request originates from AdsGram.
- Optional `ADSGRAM_REWARD_SECRET` support was added for deployments that want an additional shared-secret gate.
- The visible counter and final reward are based on server-confirmed AdsGram events, not a client callback alone.
- The final reward remains transactional through `task_reward_events`, `users`, and `economy_ledger`.
- Remaining production requirement: configure the Reward URL in the AdsGram dashboard with the deployed DzMoney endpoint and test it with a real approved Reward block.

## 2026-08-19 — AdsGram Callback Race Removed

### What changed
- Added `POST /api/v2/tasks/view_ads/ad-start`.
- The authenticated client now creates the pending AdsGram view **before** `AdController.show()` starts playback.
- `public/task-v2-ui.js` now calls `ad-start`, then opens AdsGram, then waits for the server-side Reward URL confirmation.
- The old `ad-complete` endpoint remains as a compatibility path, but it is not treated as proof of a completed advertisement.

### Why
- AdsGram's server-side Reward URL is independent of the browser's `onReward` event. The previous sequence created the pending row only after `onReward`, leaving a race where AdsGram could call the Reward URL first and receive no pending view.
- Moving pending-view registration before playback removes that race.

### Files/tables affected
- `routes/task-routes.js`
- `public/task-v2-ui.js`
- Existing `adsgram_ad_views` table and `daily-task-service.js` flow are reused.

### Migration/configuration
- No destructive migration.
- No new external configuration beyond the existing AdsGram Reward URL and optional `ADSGRAM_REWARD_SECRET`.

### Tests performed
- Reviewed the complete callback sequence in the current client and server implementation.
- Verified the pending record is created before `AdController.show()` is called.
- Verified the client waits for the confirmed server-side counter rather than incrementing locally.
- Verified the Reward URL remains the only path that changes a pending view to `confirmed` and can trigger the final reward.

### Remaining risks
- The live AdsGram dashboard callback has not yet been exercised against the deployed DzMoney environment, so end-to-end external delivery remains to be tested.
- The Reward URL is an additional provider callback mechanism and should be protected with the configured shared secret where supported by the AdsGram URL configuration.

## Implementation Status

- [ ] Phase 1 audit completed
- [x] Economic foundation primitives added
- [x] Economic database foundation added
- [x] Transactional DZX ledger primitives added
- [x] Non-destructive DZX API bridge added
- [x] DZX deposit crediting primitive added
- [x] TON deposit verification gate added
- [x] TON read adapter and deposit orchestration added
- [x] Task catalog and verification foundation added
- [x] AdsGram real client `onReward` callback connected to the ad progress flow
- [x] AdsGram server-side Reward URL confirmation endpoint added
- [x] AdsGram pending-view race removed by registering before playback
- [ ] DZX/DZP application-layer migration completed
- [ ] Deposit rules integrated into production server flow
- [ ] Withdrawal rules integrated into production server flow
- [ ] Referral engine integrated
- [ ] Squad engine integrated
- [ ] Rewards Pool implemented
- [ ] Packages implemented
- [~] Task completion API integrated — Daily Check-in and AdsGram client + server Reward URL flow implemented; production external callback still requires live AdsGram configuration/test
- [ ] Admin controls implemented
- [ ] Anti-fraud implemented
- [ ] Full test suite completed

## Change Log Rules

For each significant change record:
1. Date
2. What changed
3. Why it changed
4. Files/tables affected
5. Migration/configuration impact
6. Tests performed
7. Remaining risks
