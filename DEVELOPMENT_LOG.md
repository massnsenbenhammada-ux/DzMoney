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
- Updated `package.json` startup so the economic migration completes before the existing wallet/withdrawal middleware and `server.js` start.
- Existing BUX columns and current wallet/withdrawal implementation remain untouched for safe incremental migration.
- Important: no automatic BUX→DZX balance conversion has been performed yet. That migration will be a separate audited step after the application-layer DZX integration is ready.

## 2026-08-19 — Transactional Ledger Layer

- Added `services/economy-ledger.js` with transaction-aware DZX credit/debit primitives.
- Ledger writes and balance updates are designed to use the same PostgreSQL client/transaction.
- Supports available, withdrawable, and locked DZX buckets.
- Prevents debits when the selected bucket has insufficient balance.
- This layer is intentionally not wired into the legacy endpoints yet; integration comes after the current wallet/task routes are mapped and tested.

## Implementation Status

- [ ] Phase 1 audit completed
- [x] Economic foundation primitives added
- [x] Economic database foundation added
- [x] Transactional DZX ledger primitives added
- [ ] DZX/DZP application-layer migration completed
- [ ] Deposit rules integrated into server
- [ ] Withdrawal rules integrated into server
- [ ] Referral engine integrated
- [ ] Squad engine integrated
- [ ] Rewards Pool implemented
- [ ] Packages implemented
- [ ] Task engine implemented
- [ ] Anti-fraud implemented
- [ ] Admin controls implemented
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
