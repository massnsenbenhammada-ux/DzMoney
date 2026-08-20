# DzMoney 2.0 — Implementation Status

## Current state

**Current phase:** Phase 1 — Economy & Currency Core

**Specification:** `PROJECT_ROADMAP.md` is the single source of truth.

**Repository:** clean DzMoney 2.0 rebuild. No BUX, no legacy Core business logic, and no TON internal wallet.

## Phase 0 — Specification Lock

🟢 Completed

- Final currency model locked: COIN / DZX / DZP with TON as external reference/settlement only.
- Fixed relationship locked: `1 TON = 10,000 DZX = 10,000,000 COIN`.
- DZP relationship locked: `1 DZP = 10,000 COIN = 10 DZX`.
- DZX sources locked: advertisements, tasks, referral, Reward Pool and deposits.
- Referral, Squad and Reward Pool are separate systems.
- Package model locked: one active package, six durations.
- User-created tasks: Game/Social/Web available; Partner/Special requires Admin contact.
- Deposit and withdrawal direction locked.
- User UI and Admin operational requirements locked.

## Phase 1 — Economy & Currency Core

🟡 In progress — implementation complete, runtime verification pending

### Implemented in repository

- 🟢 Clean internal wallet currencies: COIN, DZX, DZP only.
- 🟢 TON removed from internal wallet provisioning.
- 🟢 Clean economy migrations for the new database.
- 🟢 Finalized DZP conversion migration: `1 DZP = 10 DZX = 10,000 COIN`.
- 🟢 Removed obsolete legacy core test.
- 🟢 Replaced legacy migration runner with `scripts/migrate.js`.
- 🟢 DZX source separation represented in ledger entries.
- 🟢 DZP source buckets: earned / converted / purchased.
- 🟢 Authoritative economy service with server-side constants and conversions.
- 🟢 COIN → DZP conversion.
- 🟢 DZX → DZP conversion.
- 🟢 TON ↔ DZX reference helpers; TON is not stored internally.
- 🟢 Activity reward posting foundation with idempotency.
- 🟢 Ledger entries record currency, source, before balance and after balance.
- 🟢 Economy integrity constraints and indexes.
- 🟢 Economy reconciliation script: `npm run reconcile:economy`.
- 🟢 Phase 1 invariant test: `npm run test:phase1`.
- 🟢 Database-backed Economy + Ledger integration test added: `npm run test:economy-ledger`.

### Runtime verification

- 🟢 New PostgreSQL database connected successfully.
- 🟢 `npm run migrate` previously applied the clean economy migrations successfully.
- 🟢 `npm run test:phase1` passed after the finalized currency correction.
- ⬜ Run `npm run migrate` again so the new `003_economy_rates.sql` correction is applied to the current database.
- ⬜ Run `npm run test:economy-ledger`.
- ⬜ Run `npm run reconcile:economy`.
- ⬜ Verify `/health` and `/health/db`.
- ⬜ Final Phase 1 sign-off.

## Later phases

### Phase 2 — Activity / Ads / Tasks
⬜ Not started — **requires user review and explicit approval before implementation**

### Phase 3 — Referral
⬜ Not started

### Phase 4 — Squad
⬜ Not started

### Phase 5 — Reward Pool
⬜ Not started

### Phase 6 — Packages
⬜ Not started

### Phase 7 — Buying Points & Conversion UI
⬜ Not started

### Phase 8 — Deposit
⬜ Not started

### Phase 9 — Withdrawal
⬜ Not started

### Phase 10 — Promo Codes
⬜ Not started

### Phase 11 — User UI/UX
⬜ Not started

### Phase 12 — Admin Panel
⬜ Not started

### Phase 13 — Ledger / Security / Anti-Fraud hardening
⬜ Not started

### Phase 14 — Final Testing & Production Release
⬜ Not started

## Change Log

### 2026-08-20
- Confirmed the latest economy specification: Reward Pool distributes DZX; TON is external reference/settlement only.
- Finalized DZP relationship at `1 DZP = 10 DZX = 10,000 COIN`.
- Added migration `003_economy_rates.sql` to correct the database setting on already-initialized deployments.
- Added database-backed Economy + Ledger integration tests.
- Removed obsolete `scripts/test-core.js` that referenced the old Core/TON wallet system.
- Phase 1 remains pending final runtime integration verification; no Phase 2 Ads/Tasks implementation has started.

## Update Rule

After every validated milestone, update this file with:
1. What was implemented.
2. What was actually tested.
3. Commit/reference used.
4. Remaining limitations.

Never mark unvalidated work as completed.
