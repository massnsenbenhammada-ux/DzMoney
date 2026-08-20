# DzMoney 2.0 — Implementation Status

## Current state

**Current phase:** Phase 1 — Economy & Currency Core

**Specification:** `PROJECT_ROADMAP.md` is the single source of truth, subject to the latest confirmed decisions recorded here until the roadmap wording is synchronized.

**Repository:** clean DzMoney 2.0 rebuild. No BUX, no legacy Core business logic, and no TON internal wallet.

## Phase 0 — Specification Lock

🟢 Completed

- Internal currencies: COIN / DZX / DZP only.
- TON is external reference/settlement only; it is not an internal wallet currency.
- Fixed relationship: `1 TON = 10,000 DZX = 10,000,000 COIN`.
- Fixed DZP relationship: `1 DZP = 10 DZX = 10,000 COIN`.
- Direct DZX sources: advertisements, tasks, referral, Reward Pool, deposits, and Promo when Promo rewards DZX.
- Promo may reward COIN or DZX; the configured reward currency must remain explicit in ledger source metadata.
- **Squad is not a direct DZX source. Squad is a reward modifier only:** it increases an underlying qualifying reward by an Admin-defined percentage and must not mint a standalone Squad reward.
- Referral, Squad and Reward Pool are separate systems.
- Purchased/deposited/transferred/converted value must not be reclassified as earned activity for Reward Pool weight.
- Withdrawal economics locked: `2,000,000 COIN + 2,000 DZX = 0.2 TON` external settlement value.

## Phase 1 — Economy & Currency Core

🟡 Implementation substantially complete — final runtime sign-off pending

### Verified in repository

- 🟢 Internal wallet currencies are restricted to `COIN`, `DZX`, `DZP`.
- 🟢 TON is not provisioned as an internal wallet currency.
- 🟢 No BUX references found in the current repository tree/code search.
- 🟢 No legacy `core_*` business tables/services remain in the current repository tree.
- 🟢 Obsolete legacy core test has been removed.
- 🟢 Canonical migration runner is `scripts/migrate.js`.
- 🟢 DZP source buckets exist as earned / converted / purchased.
- 🟢 Economy service contains the authoritative conversion constants and server-side validation.
- 🟢 COIN → DZP and DZX → DZP conversions exist.
- 🟢 TON ↔ DZX helpers are reference conversions only.
- 🟢 Economy movements are idempotent and ledger-backed.
- 🟢 Ledger entries retain currency, source, balance-before and balance-after.
- 🟢 Deposit foundation exists and credits confirmed deposits as DZX with `source = deposit`.
- 🟢 Deposit confirmation uses idempotency and daily quota protection.
- 🟢 `creditActivityReward()` already models Squad as a modifier rather than a standalone source; the modifier rate is supplied externally and recorded in transaction metadata.
- 🟢 `npm run test:phase1` passed in the current deployment after the finalized currency correction.

### Audit findings requiring cleanup/verification

- 🟠 The master roadmap wording currently lists Squad under the DZX source set in one section even though the confirmed economic rule is that Squad is a **modifier only**. This is a documentation inconsistency that must be synchronized before Phase 4 implementation.
- 🟠 The economy service uses the generic `creditActivityReward()` foundation for several future reward sources. This is acceptable as a shared transaction primitive, but each source must remain explicit in `source` metadata and must never be silently reclassified as advertisement/task activity.
- 🟠 Deposit code is already present even though Deposit is a later roadmap phase. It must not be expanded further until the phase order is explicitly reached; its existing foundation will be verified, not duplicated.
- 🟠 Repository documentation remains secondary to the economy audit and should not be mixed into Phase 2 implementation.

### Runtime verification status

- 🟢 New PostgreSQL database was connected successfully.
- 🟢 Clean migrations were applied successfully on the new database.
- 🟢 `npm run test:phase1` passed.
- 🟢 `npm run migrate` has passed on the current deployment.
- ⬜ `npm run test:economy-ledger` final clean run after audit cleanup.
- ⬜ `npm run reconcile:economy` final clean run.
- ⬜ `/health` and `/health/db` verification.
- ⬜ Final Phase 1 sign-off.

## Later phases

### Phase 2 — Activity / Ads / Tasks
⬜ Not started — user must be informed before implementation begins.

### Phase 3 — Referral
⬜ Not started.

### Phase 4 — Squad
⬜ Not started. Squad will be implemented as a reward modifier, not a direct DZX minting source.

### Phase 5 — Reward Pool
⬜ Not started.

### Phase 6 — Packages
⬜ Not started.

### Phase 7 — Buying Points & Conversion UI
⬜ Not started.

### Phase 8 — Deposit
🟡 Foundation exists ahead of phase order; final phase implementation/verification is pending.

### Phase 9 — Withdrawal
⬜ Not started.

### Phase 10 — Promo Codes
⬜ Not started.

### Phase 11 — User UI/UX
⬜ Not started.

### Phase 12 — Admin Panel
⬜ Not started.

### Phase 13 — Ledger / Security / Anti-Fraud hardening
⬜ Not started.

### Phase 14 — Final Testing & Production Release
⬜ Not started.

## Change Log

### 2026-08-20 — Squad rule synchronization audit

- Confirmed from the latest user decision that Squad is a **modifier only**.
- Squad increases an underlying qualifying reward by a configured percentage; it does not constitute an independent DZX mint/source.
- Direct DZX sources are therefore: advertisements, tasks, referral, Reward Pool, deposits, and Promo-DZX.
- Promo remains capable of rewarding either COIN or DZX.
- Updated this status document so implementation tracking no longer treats Squad as a direct DZX source.
- No Ads/Tasks code was implemented during this audit.

### 2026-08-20 — Repository cleanup

- Audited the latest `main` commit `ac69b2f8b856de7e0a81d866cce0cde33d117187` (`docs: unify roadmap with final economy rules`).
- Confirmed no BUX or legacy Core business artifacts remain in the current repository tree.
- Confirmed TON is reference/settlement only and internal wallets are COIN/DZX/DZP.
- Confirmed clean migrations and Phase 1 test history from the current deployment.

## Update Rule

After every validated milestone, update this file with:
1. What was implemented.
2. What was actually tested.
3. Commit/reference used.
4. Remaining limitations.

Never mark unvalidated work as completed.
