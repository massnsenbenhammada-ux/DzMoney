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

- Added `services/daily-task-service.js` with transactional server-side reward processing for Daily Tasks.
- Daily Check-in initially used the secure server claim path; this was subsequently changed so the reward requires a real AdsGram Rewarded ad.
- Duplicate Daily Check-in rewards remain blocked by the task's 24-hour cadence.
- Added `/api/v2/tasks/:taskId/verify` behind Telegram WebApp authentication; Daily Check-in is now deliberately rejected by this endpoint because it requires AdsGram verification.
- Added Admin-controlled daily settings: ad count, updates channel URL, and canonical Daily reward values.
- Updated the task API to expose the current Admin-controlled ad count and update-channel metadata.
- Updated the Daily Activity UI so Check for Update opens the configured updates channel and Share with Friends opens the Telegram share flow.

## 2026-08-19 — AdsGram Real Reward Callback Integration

- Replaced the missing/placeholder `showAdsGramAd` path in `public/task-v2-ui.js` with a real AdsGram SDK integration using the official Rewarded `onReward` event.
- AdsGram SDK is loaded from `https://sad.adsgram.ai/js/sad.min.js` and initialized with the configured DzMoney AdsGram UnitID `43650` when no Admin override exists.
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

## 2026-08-19 — AdsGram Callback Race Removed

- Added pending-view registration before AdsGram playback.
- The authenticated client now creates the pending AdsGram view before `AdController.show()` starts playback.
- The old `ad-complete` endpoint remains as a compatibility path, but it is not treated as proof of a completed advertisement.
- This removes the race where AdsGram could call the Reward URL before DzMoney had created the pending record.

## 2026-08-19 — Daily Check-in Converted to Rewarded Ad

### What changed
- **Daily Check-in now requires exactly one real AdsGram Rewarded ad before the daily reward can be credited.**
- Added generic `POST /api/v2/tasks/:taskId/ad-start` for AdsGram tasks, supporting `daily_checkin` and `view_ads`.
- `recordAdCompletion()` now registers a pending AdsGram view for either task without granting a reward.
- `confirmAdsGramReward()` now reads the pending view's `task_id`, so the same AdsGram Reward URL can securely confirm either Daily Check-in or View Ads.
- Daily Check-in is rewarded only after AdsGram's Reward URL confirms the pending view.
- The reward remains transactional: `task_completions` + `task_reward_events` + `users` balances + `economy_ledger` are updated together.
- `Daily Check-in` keeps its existing 24-hour cadence; after successful reward it becomes unavailable until the cooldown expires.
- `services/task-api.js` now exposes the same AdsGram `UnitID 43650` to both Daily Check-in and View Ads.
- `public/task-v2-ui.js` now shows **Watch Ad** for Daily Check-in, registers the pending view before playback, opens AdsGram, and waits for server confirmation before showing the reward.
- The direct `/api/v2/tasks/daily_checkin/verify` path can no longer grant the reward and returns `EXTERNAL_VERIFICATION_REQUIRED`.

### Why
- This matches the agreed economic behavior: Daily Check-in is an advertising-funded reward, not a free daily emission.
- It prevents users from claiming the Daily reward by clicking the button or spoofing a frontend callback.

### Files affected
- `services/daily-task-service.js`
- `services/task-api.js`
- `routes/task-routes.js`
- `public/task-v2-ui.js`
- `DEVELOPMENT_LOG.md`

### Migration/configuration impact
- No destructive database migration is required.
- Existing `adsgram_ad_views` is reused; its `task_id` now distinguishes `daily_checkin` from `view_ads`.
- No new environment variable is required.
- AdsGram UnitID remains `43650` unless an Admin `adsgram_block_id` setting overrides it.

### Tests performed
- Static flow review of the complete Daily Check-in path: Telegram auth → task start → pending ad record → AdsGram playback → `onReward` → AdsGram Reward URL → server confirmation → transactional reward.
- Verified that direct Daily Check-in verification cannot credit the reward anymore.
- Verified that the same Reward URL can distinguish the two ad tasks through the pending record's `task_id`.
- Live end-to-end testing remains blocked until AdsGram UnitID `43650` changes from `Created` to an active/approved serving state.

### Remaining risks
- AdsGram currently reports UnitID `43650` as `Created` / not active, so a real ad cannot yet be used to validate the final callback chain.
- Once AdsGram activates the Unit, the Daily Check-in flow must be live-tested before the AdsGram task phase is marked fully complete.

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
- [x] Daily Check-in changed to AdsGram Rewarded + 24h cooldown
- [ ] DZX/DZP application-layer migration completed
- [ ] Deposit rules integrated into production server flow
- [ ] Withdrawal rules integrated into production server flow
- [ ] Referral engine integrated
- [ ] Squad engine integrated
- [ ] Rewards Pool implemented
- [ ] Packages implemented
- [~] Task completion API integrated — Daily Check-in and View Ads use AdsGram client + server Reward URL flow; live production callback still requires AdsGram activation
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
