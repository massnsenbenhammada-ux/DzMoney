# DzMoney 2.0 — Implementation Status

## Current state

**Current phase:** Phase 2 — Activity / Ads / Tasks — backend foundation implemented; runtime verification pending.

**Specification:** `PROJECT_ROADMAP.md` is the single source of truth. `docs/PHASE2_DESIGN_REVIEW.md`, `docs/PHASE2_TASK_VERIFICATION_RULES.md` and `docs/ARCHITECTURE_RULES.md` constrain implementation and change control.

**Repository state:** clean Phase 2 boundary. Premature Phase 4 Squad runtime code and routes have been removed. Migration `008_squad_engine.sql` is preserved as immutable migration history; `009_cleanup_unreleased_squad.sql` removes that unreleased schema safely so existing and fresh environments converge to the same Phase 2 boundary.

## Phase 0 — Specification Lock

🟢 Completed

- Internal currencies: COIN / DZX / DZP only.
- TON is external reference/settlement only; it is not an internal wallet currency.
- Fixed relationship: `1 TON = 10,000 DZX = 10,000,000 COIN`.
- Fixed DZP relationship: `1 DZP = 10 DZX = 10,000 COIN`.
- Direct DZX sources: advertisements, tasks, referral, Reward Pool, deposits, and Promo when Promo rewards DZX.
- Promo may reward COIN or DZX; the configured reward currency remains explicit in ledger source metadata.
- Squad is not a direct DZX source. It is a future reward modifier only.
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
- 🟢 `creditActivityReward()` models Squad as a future modifier rather than a standalone source; the modifier rate is supplied externally and recorded in transaction metadata.

### Final runtime verification

- 🟢 `npm run migrate`
- 🟢 `npm run test:phase1`
- 🟢 `npm run test:economy-ledger`
- 🟢 `npm run reconcile:economy`
- 🟢 `/health` → HTTP 200
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
- 🟢 `npm run test:phase2` exists for Phase 2 verification invariants.

### Runtime verification required

- ⬜ `npm run migrate` after the cleanup migration is deployed.
- ⬜ `npm run test:phase2`.
- ⬜ Re-run `npm run test:phase1`.
- ⬜ Re-run `npm run test:economy-ledger`.
- ⬜ Re-run `npm run test:deposit`.
- ⬜ Re-run `npm run reconcile:economy`.
- ⬜ Verify `/health` and `/health/db` remain HTTP 200.

### Remaining Phase 2 implementation

- ⬜ Real task adapters/verifiers for Daily, Game, Social, Web and Special/Partner tasks.
- 🟢 Real advertisement provider integration and trusted callbacks — Monetag Rewarded Interstitial integration is merged in `main` via PR #28 and PR #29; the current provider flow is server-authoritative and postback-driven.
- ⬜ Advertisement task flow without a second verification ad.
- 🟢 Daily Check-in claim service using the 24-hour backend cooldown and required ad gate — implemented and connected to Monetag Rewarded Interstitial in PR #29.
- 🟢 User-facing Daily Check-in Monetag wiring — merged in PR #29 and covered by the existing Daily Check-in HTTP boundary test.
- ⬜ Anti-fraud hardening around ad callbacks and task verification.

Phase 2 must not be marked complete until the runtime and acceptance tests pass.

## UI Foundation — Initial Mini App Shell

🟡 Foundation only; not a Phase 11 sign-off.

- 🟢 Telegram Mini App shell exists under `public/`.
- 🟢 Responsive dark DzMoney visual system and navigation are present.
- 🟢 Home, Tasks, Friends and Wallet foundations are present.
- 🟢 Unimplemented Squad runtime/UI coupling was removed from the Phase 2 shell.
- 🟢 Telegram WebApp SDK is initialized on the client.
- 🟢 `/health` is consumed by the client for server connectivity status.
- 🟢 Authenticated `/api/me` bootstrap verifies Telegram `initData`, upserts the user, ensures COIN/DZX/DZP wallets and returns live balances.
- 🟢 Daily Check-in user-facing Monetag integration is present; other Task, advertisement, referral and withdrawal actions remain explicit placeholders until their corresponding backend services/providers are completed and verified.
- ⬜ Full Phase 11 UI/UX implementation and acceptance testing.

## Later phases

### Phase 3 — Referral
⬜ Not started.

### Phase 4 — Squad
⬜ Not started. No Squad runtime service, route or active schema remains after architecture stabilization. Squad will be implemented as a reward modifier, not a direct DZX minting source.

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
⬜ Not started. Initial UI foundation exists; full UI/UX remains pending.

### Phase 12 — Admin Panel
⬜ Not started.

### Phase 13 — Ledger / Security / Anti-Fraud hardening
⬜ Not started.

### Phase 14 — Final Testing & Production Release
⬜ Not started.

## Architecture stabilization — 2026-08-21

- Removed premature Squad HTTP routes, services, activity bridge and test suite.
- Removed unfinished Squad API calls and Squad navigation from the initial UI shell.
- Preserved migration history by leaving `008_squad_engine.sql` immutable.
- Added `009_cleanup_unreleased_squad.sql` so environments converge to the clean Phase 2 schema boundary.
- Registered frontend validation in `package.json` and added a single `test:all` verification command.
- Added `docs/ARCHITECTURE_RULES.md` defining phase isolation, layer boundaries, migration discipline, economy invariants, testing gates and no-fake-integration rules.
- Tightened the JSON body limit to 64 KB in the HTTP layer.

## Change Log

### 2026-08-22 — Monetag Rewarded Interstitial integration

- Merged PR #28 for server-side Monetag YMID generation, postback verification and finalization.
- Merged PR #29 for the user-facing Daily Check-in Monetag Rewarded Interstitial flow.
- Verified PR #29 with CI on its final head commit before merge.
- Daily Check-in now obtains the server-generated advertisement identifier, invokes the configured Monetag SDK, and leaves reward finalization to the server-side postback flow.
- No new database migration, economy, ledger, reward system or duplicate test source was introduced by the integration.
- Remaining limitation: broader Phase 2 runtime/acceptance verification and anti-fraud hardening are still pending.

### 2026-08-21 — Architecture stabilization

- Reconciled the implementation state with the roadmap.
- Removed the accidental Phase 4 runtime implementation before it could become a second architecture track.
- Kept Squad as specification only until Phase 4 is formally opened.
- Removed client-side coupling to unimplemented Squad endpoints.
- Made future UI actions explicitly non-final instead of simulating backend behavior.

### 2026-08-21 — Initial Mini App UI + authenticated bootstrap

- Added the first DzMoney Mini App frontend under `public/`.
- Added authenticated `/api/me` bootstrap using the existing Telegram `initData` verification middleware.
- Connected the frontend to `/health` and `/api/me`.

### 2026-08-20 — Phase 2 backend foundation

- Added the Phase 2 task/attempt/ad-verification schema.
- Added the task Execute → Verify service flow.
- Added the 5/10-second verification-ad gate.
- Kept verification rewards inside the existing atomic economy transaction primitive.
- Added `test:phase2` acceptance/invariant coverage.
- Did not implement real ad-provider integration or final user-facing Ads/Tasks behavior.

## Update Rule

After every validated milestone, update this file with:
1. What was implemented.
2. What was actually tested.
3. Commit/reference used.
4. Remaining limitations.

Never mark unvalidated work as completed.
