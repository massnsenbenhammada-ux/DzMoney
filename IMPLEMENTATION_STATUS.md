# DzMoney 2.0 — Implementation Status

## Current state

**Current phase:** Phase 4 — Squad engine foundation implemented on branch `squad-engine`; runtime verification pending.

**Specification:** `PROJECT_ROADMAP.md` is the single source of truth, with Squad-specific transparency rules documented in `docs/SQUAD_DESIGN.md`.

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
- Squad transparency is mandatory: every activity percentage, modifier, Goal contribution and weighted distribution must be explainable from persisted data.

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

🟡 Backend foundation implemented — runtime verification pending.

### Implemented foundation

- 🟢 Migration `007_activity_tasks.sql` adds task definitions, task attempts, advertisement contexts, verification gates and Daily Check-in state.
- 🟢 Verification ad duration is backend-configurable and restricted to 5 or 10 seconds.
- 🟢 Non-ad tasks use the explicit Execute → Verify flow.
- 🟢 Verify creates a dedicated `verification` advertisement event; verification ads are not task/reward-pool ads.
- 🟢 Final task reward is blocked until the verification advertisement is completed.
- 🟢 Final task verification is server-authoritative and can reject the task without rewarding it.
- 🟢 Successful task verification uses the existing atomic economy/ledger primitive and source `task`.
- 🟢 Reward is idempotent and cannot be minted twice by repeated finalization.
- 🟢 Verification ad completion itself creates no economy reward.
- 🟢 Task DZP is recorded through the existing `earned_dzp` bucket, preserving Reward Pool eligibility semantics.
- 🟢 One active/pending attempt per user/task is enforced at the database level.
- 🟢 `npm run test:phase2` exists for the Phase 2 verification invariants.
- 🟡 Verified task finalization now consults the Squad modifier and records the qualifying task event atomically; runtime verification is still required.

### Runtime verification required

- ⬜ `npm run migrate` after migration `007_activity_tasks.sql` is deployed.
- ⬜ `npm run test:phase2`.
- ⬜ Re-run `npm run test:phase1`.
- ⬜ Re-run `npm run test:economy-ledger`.
- ⬜ Re-run `npm run reconcile:economy`.
- ⬜ Verify `/health` and `/health/db` remain HTTP 200.

### Remaining Phase 2 implementation

- ⬜ Real task adapters/verifiers for Daily, Game, Social, Web and Special/Partner tasks.
- ⬜ Real advertisement provider integration and trusted callbacks.
- ⬜ Advertisement task flow (without a second verification ad).
- ⬜ Daily Check-in claim service using the 24-hour backend cooldown and required ad gate.
- ⬜ User-facing API/UI wiring.
- ⬜ Anti-fraud hardening around ad callbacks and task verification.

Phase 2 must not be marked complete until the above runtime and acceptance tests pass.

## Phase 4 — Squad

🟡 Foundation implemented — runtime verification pending.

### Implemented

- 🟢 Migration `008_squad_engine.sql` adds hierarchical Squad membership, activity events, daily bonus snapshots, generic Goals, contribution records and weighted distribution snapshots.
- 🟢 Membership is independent from Referral and a user belongs to at most one Squad.
- 🟢 Hierarchy uses an explicit `parent_user_id` and has no hardcoded member-count cap.
- 🟢 Seven-day inactivity is Admin-configurable; inactive members remain in the hierarchy and are reactivated by their first qualifying activity.
- 🟢 Daily Squad activity is calculated as active-today members divided by currently active Squad members.
- 🟢 Minimum active members, activity threshold and bonus percentage are Admin settings, not hardcoded constants.
- 🟢 Daily eligibility is persisted as an auditable snapshot and applies to the following day.
- 🟢 Squad modifier is applied to verified task rewards without changing the original ledger source.
- 🟢 Generic Goals can target activity types such as tasks, advertisements, member activity or future qualifying events.
- 🟢 Goal contributions are event-backed, idempotent and restricted to the Goal's Squad/window.
- 🟢 Goal rewards are contributor-only and weighted by contribution.
- 🟢 Distribution snapshots store the exact formula and inputs needed to explain each share.
- 🟢 `docs/SQUAD_DESIGN.md` locks the No Black-Box Rewards rule.
- 🟢 `npm run test:squad` was added for hierarchy, inactivity, daily eligibility, modifier and weighted Goal invariants.

### Runtime verification required

- ⬜ `npm run migrate` after `008_squad_engine.sql` is deployed.
- ⬜ `npm run test:squad`.
- ⬜ Re-run `npm run test:phase2` after Squad integration.
- ⬜ Re-run `npm run test:phase1`.
- ⬜ Re-run `npm run test:economy-ledger`.
- ⬜ Re-run `npm run reconcile:economy`.
- ⬜ Verify `/health` and `/health/db`.
- ⬜ Verify task reward with an actually qualified Squad produces the configured modifier while preserving `source = task`.

### Not yet implemented

- ⬜ Real advertisement completion integration into Squad activity events.
- ⬜ Goal funding/posting through the Reward Pool settlement layer.
- ⬜ Smart Telegram notification service and user preferences.
- ⬜ User-facing Squad API/UI and transparent calculation screens.
- ⬜ Admin Squad management UI.

## Later phases

### Phase 3 — Referral
⬜ Not started.

### Phase 5 — Reward Pool
⬜ Not started.

### Phase 6 — Packages
⬜ Not started.

### Phase 7 — Buying Points & Conversion UI
⬜ Not started.

### Phase 8 — Deposit
🟡 Foundation exists ahead of phase order; runtime checklist has passed in the current deployment history.

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

### 2026-08-21 — Squad engine foundation

- Added `008_squad_engine.sql`.
- Added isolated `squad-service.js` and atomic task-to-Squad activity bridge.
- Added seven-day inactivity/reactivation behavior.
- Added next-day daily Squad eligibility and configurable modifier settings.
- Added generic Squad Goals and contributor-weighted distribution snapshots.
- Added `test:squad` and `docs/SQUAD_DESIGN.md`.
- Integrated verified task rewards with the Squad modifier while preserving the original task ledger source.
- Runtime verification is intentionally pending; no PASS claim is made until the deployed database and tests validate the branch.

## Update Rule

After every validated milestone, update this file with:
1. What was implemented.
2. What was actually tested.
3. Commit/reference used.
4. Remaining limitations.

Never mark unvalidated work as completed.
