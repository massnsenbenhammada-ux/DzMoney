# DzMoney 2.0 — Implementation Status

## Current state

**Current phase:** Phase 1 — Core Foundation

**Specification:** `PROJECT_ROADMAP.md` is now the latest agreed DzMoney 2.0 specification.

**Repository:** clean rebuild on the new PostgreSQL database. Legacy BUX/core compatibility architecture is not part of the new system.

## Phase 0 — Specification Lock

🟢 Completed

- Final currency model agreed: COIN / DZX / DZP / TON.
- Final referral model agreed: one level, lifetime 20% from base activity only, separate from Squad.
- Final hierarchical Squad model agreed: 10 Admin-defined levels and next-day activation after both member-count and 50% activity conditions.
- Final Reward Pool model agreed: daily TON pool, 10 Reward Pool-page ads required, DZP-based weight, package multiplier, purchased DZP excluded from weight.
- Package model agreed: one active package, six durations.
- User-created task model agreed: Game/Social/Web available; Partner/Special requires Admin contact.
- Deposit, purchase and withdrawal direction agreed.
- Home/user drawer/UI structure agreed.
- Admin operational-control requirements agreed.

## Phase 1 — Core Foundation

🟡 In progress

### Implemented

- 🟢 Clean Node/Express runtime.
- 🟢 PostgreSQL connection/transaction helper.
- 🟢 Clean migration runner.
- 🟢 Core user/wallet/ledger schema foundation.
- 🟢 Wallet provisioning service foundation.
- 🟢 Atomic ledger transaction service foundation.
- 🟢 Idempotency foundation.
- 🟢 `/health` runtime endpoint.
- 🟢 `/health/db` database diagnostic endpoint.
- 🟢 Core smoke-test foundation.

### Remaining

- ⬜ Complete automated ledger tests.
- ⬜ Add reconciliation checks.
- ⬜ Validate all migrations against the new production PostgreSQL.
- ⬜ Validate wallet and ledger concurrency behavior.
- ⬜ Final Phase 1 sign-off.

## Phase 2 — Economy & Conversion

⬜ Not started

## Phase 3 — Activity / Ads / Tasks

⬜ Not started

## Phase 4 — Referral

⬜ Not started

## Phase 5 — Squad

⬜ Not started

## Phase 6 — Packages & Weight

⬜ Not started

## Phase 7 — Reward Pool

⬜ Not started

## Phase 8 — User-Created Tasks & Commercial Engine

⬜ Not started

## Phase 9 — Deposit / Purchase / Withdrawal

⬜ Not started

## Phase 10 — User UI/UX

⬜ Not started

## Phase 11 — Admin Panel

⬜ Not started

## Phase 12 — Security / Testing / Production

⬜ Not started

## Change Log

### 2026-08-20
- Replaced the old roadmap with the latest agreed DzMoney 2.0 specification.
- Explicitly removed legacy BUX/core architecture from the project specification.
- Added the final agreed currency, conversion, referral, Squad, Reward Pool, package, task, user-created-task, deposit, purchase, withdrawal, UI and Admin requirements.
- Clarified that unresolved business rules must not be invented during implementation.
- Phase 1 remains in progress; no later phase is marked complete without implementation and testing.

## Update Rule

After every validated milestone, update this file with:
1. What was implemented.
2. What was tested.
3. The commit/reference used.
4. Remaining limitations.

Never mark unvalidated work as completed.
