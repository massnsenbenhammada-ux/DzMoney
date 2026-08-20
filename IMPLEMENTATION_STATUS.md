# DzMoney 2.0 — Implementation Status

## Current state

**Current phase:** Phase 2 — Activity / Ads / Tasks — design review complete, implementation not started.

**Specification:** `PROJECT_ROADMAP.md` is the single source of truth, with the latest confirmed decisions synchronized here and in `docs/PHASE2_DESIGN_REVIEW.md`.

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

🟢 Runtime verified and signed off.

### Verified

- 🟢 Internal wallet currencies are restricted to `COIN`, `DZX`, `DZP`.
- 🟢 TON is not provisioned as an internal wallet currency.
- 🟢 No BUX references found in the current repository tree/code search.
- 🟢 No legacy `core_*` business tables/services remain in the current repository tree.
- 🟢 Canonical migration runner is `scripts/migrate.js`.
- 🟢 DZP source buckets exist as earned / converted / purchased.
- 🟢 Economy service contains authoritative conversion constants and server-side validation.
- 🟢 COIN → DZP and DZX → DZP conversions exist.
- 🟢 TON ↔ DZX helpers are reference conversions only.
- 🟢 Economy movements are idempotent and ledger-backed.
- 🟢 Ledger entries retain currency, source, balance-before and balance-after.
- 🟢 Deposit foundation exists and credits confirmed deposits as DZX with `source = deposit`.
- 🟢 `creditActivityReward()` models Squad as a modifier rather than a standalone source; the modifier rate is supplied externally and recorded in transaction metadata.

### Final runtime verification

- 🟢 `npm run migrate`
- 🟢 `npm run test:phase1`
- 🟢 `npm run test:economy-ledger`
- 🟢 `npm run reconcile:economy`
- 🟢 `/health` → HTTP 200, `{"ok":true,"service":"DzMoney","version":"2.0.0"}`
- 🟢 `/health/db` → HTTP 200, database connected

### Phase 1 sign-off

**Phase 1 is CLOSED / VERIFIED.** No further Phase 1 refactoring should be performed unless a new failing invariant or security issue is discovered.

## Phase 2 — Activity / Ads / Tasks

🟡 Design review complete — implementation not started.

Design authority:
- `docs/PHASE2_TASK_VERIFICATION_RULES.md`
- `docs/PHASE2_DESIGN_REVIEW.md`

Locked design points:

- Standard qualifying activity default: `1,000 COIN + 1 DZX + 1 DZP`.
- Advertisement completion is server-authoritative and idempotent.
- Daily Check-in is advertisement-gated and server-side cooldown enforced.
- Every non-advertisement task has `Execute` and `Verify`.
- Verify requires a short 5-second or 10-second advertisement gate.
- Verification ad completion alone never grants a reward.
- Final task verification is server-authoritative.
- Successful task verification grants the configured reward exactly once.
- Task ads, Reward Pool ads, Daily Check-in ads and verification ads have explicit contexts and must not be mixed.
- Only earned activity DZP from qualifying activity contributes to Reward Pool activity weight.
- Squad remains a modifier, not an independent DZX mint/source.
- Referral, Squad, Reward Pool and Promo remain isolated from the task verification mechanism.
- Phase 2 implementation must not begin until the complete design is approved.

## Later phases

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

### 2026-08-20 — Phase 1 runtime sign-off and Phase 2 design review

- Confirmed `test:phase1` PASS.
- Confirmed `test:economy-ledger` PASS.
- Confirmed `reconcile:economy` PASS with zero negative wallets, source mismatches and ledger mismatches.
- Confirmed `/health` and `/health/db` return HTTP 200.
- Closed Phase 1 as verified.
- Completed the Phase 2 design review without implementing Ads or Tasks.
- Locked the Execute → Verify → short verification ad → server verification → reward flow for all non-ad tasks.
- Locked Daily Check-in as advertisement-gated with backend cooldown enforcement.
- Locked explicit ad contexts and idempotency boundaries.
- Added `docs/PHASE2_DESIGN_REVIEW.md` and linked it as a design authority.

### 2026-08-20 — Squad rule synchronization audit

- Confirmed from the latest user decision that Squad is a **modifier only**.
- Squad increases an underlying qualifying reward by a configured percentage; it does not constitute an independent DZX mint/source.
- Direct DZX sources are therefore: advertisements, tasks, referral, Reward Pool, deposits, and Promo-DZX.
- Promo remains capable of rewarding either COIN or DZX.
- No Ads/Tasks code was implemented during this audit.

## Update Rule

After every validated milestone, update this file with:
1. What was implemented.
2. What was actually tested.
3. Commit/reference used.
4. Remaining limitations.

Never mark unvalidated work as completed.
