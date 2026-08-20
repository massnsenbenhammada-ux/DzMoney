# DzMoney 2.0 — Implementation Status

> This file records what has actually been implemented in the new repository. It must be updated after every completed roadmap phase. Planned work must not be marked as complete.

## Status Legend

- ⬜ Not started
- 🟡 In progress
- 🟢 Completed and validated
- 🔴 Blocked / needs correction

## Current Overall Status

**Current phase:** Phase 1 — Core Database & Ledger

**Overall completion:** Phase 0 completed; Phase 1 in progress

**Repository state:** New rebuild foundation. No legacy code is considered part of the new core unless explicitly ported, reviewed and validated.

---

## Phase 0 — Specification & Architecture

**Status:** 🟢 Completed

### Completed
- 🟢 Core business rules collected and documented.
- 🟢 Economy currencies identified: COIN, DZX, DZP, TON.
- 🟢 Default economic relationships recorded.
- 🟢 Earned DZP vs Purchased DZP separation defined.
- 🟢 Daily Activity DZP and Daily Total Activity defined as separate concepts.
- 🟢 Task category and creation permissions defined.
- 🟢 Referral model defined.
- 🟢 Hierarchical Squad model defined.
- 🟢 Reward Pool activation and daily TON distribution model defined.
- 🟢 Package model defined.
- 🟢 Deposit/withdrawal requirements recorded.
- 🟢 User Home, User Drawer and Packages navigation requirements recorded.
- 🟢 Admin Dashboard requirements recorded.
- 🟢 Anti-fraud, notifications and audit responsibilities assigned to the architecture.
- 🟢 Module/service boundaries documented in `ARCHITECTURE.md`.
- 🟢 Foundation API contracts documented in `docs/API_CONTRACTS.md`.
- 🟢 PostgreSQL foundation schema defined in `migrations/001_core.sql`.
- 🟢 UTC+1 daily-cycle rule documented.
- 🟢 Idempotency strategy documented.
- 🟢 Authorization model documented.

### Validation
- 🟢 Architecture reviewed against the agreed business rules.
- 🟢 Admin-controlled values are represented as database settings rather than frontend constants.
- 🟢 Earned/Purchased DZP accounting is explicitly separated.
- 🟢 Reward Pool and Referral/Squad accounting are architecturally separated.

---

## Phase 1 — Core Database & Ledger

**Status:** 🟡 In progress

### Implemented
- 🟢 PostgreSQL core schema and ledger foundation.
- 🟢 Users and Telegram identity table.
- 🟢 COIN/DZX/DZP/TON wallet accounts.
- 🟢 Earned/Purchased DZP balance fields.
- 🟢 Ledger transaction table with idempotency constraint.
- 🟢 Immutable ledger entry table.
- 🟢 Balance-before/balance-after audit fields.
- 🟢 Admin settings store.
- 🟢 Admin audit log.
- 🟢 Idempotency record store.
- 🟢 Default economy/operational settings seeded as database settings.
- 🟢 Transactional migration runner: `src/db/migration-runner.js`.
- 🟢 PostgreSQL connection/transaction helper: `src/db/pool.js`.
- 🟢 Atomic wallet ledger service: `src/core/ledger-service.js`.
- 🟢 Telegram user provisioning and four-wallet creation: `src/core/user-service.js`.
- 🟢 Wallet provisioning, summary and reconciliation primitives: `src/core/wallet-service.js`.
- 🟢 Core integrity migration: `migrations/002_core_integrity.sql`.
- 🟢 Dedicated core migration/check scripts.
- 🟢 PostgreSQL CI workflow: `.github/workflows/core-db.yml`.

### Remaining before completion
- ⬜ Observe a successful PostgreSQL CI run for the current commit.
- ⬜ Add automated transaction/ledger behavior tests, including duplicate idempotency and insufficient-balance cases.
- ⬜ Review reconciliation math against seeded ledger scenarios.
- ⬜ Confirm production PostgreSQL compatibility and migration repeatability.
- ⬜ Only after the above, mark Phase 1 complete and start Phase 2.

### Evidence / commits
- `914dc4845876c6d2b5b536f5593ef95a452b1020` — migration runner.
- `ea44d1f577ce0db020197eb440f4e32adedb67cb` — PostgreSQL pool/transaction helper.
- `d9be5a41282b8bb801d7211a7533274f944ebbd3` — atomic ledger service.
- `ef2c92cb1d93d24405287d07991e0133badd2d21` — user/wallet provisioning.
- `0a97d907d2b34c59ae96d934a7b86463f13a8564` — database integrity hardening.
- `b4d2a7ae43aafa8f8c804838be567184ca949891` — core migration command.
- `0eb589d0f57b7c15d7874183da45b18d98ddf194` — core database verification.
- `05b1f276b101b1d43dbc9b1d04cf0c93edbdaa4d` — PostgreSQL CI validation workflow.

---

## Phase 2 — Economy & Conversion Engine

**Status:** ⬜ Not started

### Completed
- None.

---

## Phase 3 — Tasks, Ads & Activity Engine

**Status:** ⬜ Not started

---

## Phase 4 — Referral System

**Status:** ⬜ Not started

---

## Phase 5 — Hierarchical Squad Engine

**Status:** ⬜ Not started

---

## Phase 6 — Packages & Weight Engine

**Status:** ⬜ Not started

---

## Phase 7 — Reward Pool

**Status:** ⬜ Not started

---

## Phase 8 — Wallet, Deposit & Withdrawal

**Status:** ⬜ Not started

---

## Phase 9 — User App UI/UX

**Status:** ⬜ Not started

---

## Phase 10 — Admin Panel

**Status:** ⬜ Not started

---

## Phase 11 — Security, Anti-Fraud & Reliability

**Status:** ⬜ Not started

---

## Phase 12 — Testing, Integration & Production

**Status:** ⬜ Not started

---

## Change Log

### 2026-08-20
- Created the new implementation roadmap and status tracker.
- Completed Phase 0 architecture documentation.
- Added PostgreSQL core schema and ledger foundation.
- Implemented migration runner, DB transaction helper, atomic ledger service and wallet/user provisioning.
- Added database integrity hardening and a CI workflow using PostgreSQL 16.
- Phase 1 remains in progress until the CI run and automated transaction tests validate the implementation.

## Update Rule

After each completed phase:

1. Mark only the validated work as 🟢.
2. Record the implementation commit(s).
3. Record important tests and validation results.
4. Record any remaining limitations.
5. Move `Current phase` only after the phase passes its exit criteria.
6. Never delete historical completed work; append corrections to the Change Log.
