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
- 🟢 Ledger immutability rules documented and represented in the schema.

### Validation
- 🟢 Architecture reviewed against the agreed business rules.
- 🟢 Admin-controlled values are represented as database settings rather than frontend constants.
- 🟢 Earned/Purchased DZP accounting is explicitly separated.
- 🟢 Reward Pool and Referral/Squad accounting are architecturally separated.

### Evidence / commits
- `0b56fa2cf2599ee3c114d4fb1bd27db30ef09982` — architecture and module boundaries.
- `341c901f0678b4ae7ec5d12cd633133e5b43310a` — foundation API contracts.
- `d04e5fd5817b8db951ed3e32bd8bba88a1f433cc` — core PostgreSQL schema foundation.

---

## Phase 1 — Core Database & Ledger

**Status:** 🟡 In progress

### Completed
- 🟢 Initial PostgreSQL core schema.
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

### Remaining
- ⬜ Implement server-side transaction service.
- ⬜ Implement atomic wallet mutation service.
- ⬜ Implement reconciliation service.
- ⬜ Implement database migration runner/bootstrapping.
- ⬜ Add automated database tests.
- ⬜ Validate migration against a real PostgreSQL instance.

### Evidence / commits
- `d04e5fd5817b8db951ed3e32bd8bba88a1f433cc` — core schema and ledger foundation.

---

## Phase 2 — Economy & Conversion Engine

**Status:** ⬜ Not started

### Completed
- None.

### Evidence / commits
- None.

---

## Phase 3 — Tasks, Ads & Activity Engine

**Status:** ⬜ Not started

### Completed
- None.

### Evidence / commits
- None.

---

## Phase 4 — Referral System

**Status:** ⬜ Not started

### Completed
- None.

### Evidence / commits
- None.

---

## Phase 5 — Hierarchical Squad Engine

**Status:** ⬜ Not started

### Completed
- None.

### Evidence / commits
- None.

---

## Phase 6 — Packages & Weight Engine

**Status:** ⬜ Not started

### Completed
- None.

### Evidence / commits
- None.

---

## Phase 7 — Reward Pool

**Status:** ⬜ Not started

### Completed
- None.

### Evidence / commits
- None.

---

## Phase 8 — Wallet, Deposit & Withdrawal

**Status:** ⬜ Not started

### Completed
- None.

### Evidence / commits
- None.

---

## Phase 9 — User App UI/UX

**Status:** ⬜ Not started

### Completed
- None.

### Evidence / commits
- None.

---

## Phase 10 — Admin Panel

**Status:** ⬜ Not started

### Completed
- None.

### Evidence / commits
- None.

---

## Phase 11 — Security, Anti-Fraud & Reliability

**Status:** ⬜ Not started

### Completed
- None.

### Evidence / commits
- None.

---

## Phase 12 — Testing, Integration & Production

**Status:** ⬜ Not started

### Completed
- None.

### Evidence / commits
- None.

---

## Change Log

### 2026-08-20
- Created the new implementation roadmap and status tracker.
- Completed Phase 0 architecture documentation.
- Added the first PostgreSQL core schema/ledger foundation.
- Started Phase 1. No database migration has been marked fully validated yet because a real PostgreSQL execution/test environment has not been run through the repository tooling.

## Update Rule

After each completed phase:

1. Mark only the validated work as 🟢.
2. Record the implementation commit(s).
3. Record important tests and validation results.
4. Record any remaining limitations.
5. Move `Current phase` only after the phase passes its exit criteria.
6. Never delete historical completed work; append corrections to the Change Log.
