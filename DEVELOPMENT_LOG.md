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
- Updated the Daily Activity UI so Daily Check-in performs the secure claim flow, Check for Update opens the configured updates channel, and Share with Friends opens Telegram's share flow.
- Invite and ad-network tasks remain verification-gated and are not falsely credited until their trusted verification integrations are implemented.

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
- [ ] DZX/DZP application-layer migration completed
- [ ] Deposit rules integrated into production server flow
- [ ] Withdrawal rules integrated into production server flow
- [ ] Referral engine integrated
- [ ] Squad engine integrated
- [ ] Rewards Pool implemented
- [ ] Packages implemented
- [~] Task completion API integrated — Daily Check-in implemented; external-verification tasks pending their trusted adapters
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
