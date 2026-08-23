# DzMoney 2.0 — Implementation Status

## Current state

**Current phase:** Phase 2 — Activity / Ads / Tasks — backend foundation implemented; baseline isolated runtime verification passed; remaining implementation and acceptance work is pending.

**Specification:** `PROJECT_ROADMAP.md` is the single source of truth. `docs/PHASE2_DESIGN_REVIEW.md`, `docs/PHASE2_TASK_VERIFICATION_RULES.md` and `docs/ARCHITECTURE_RULES.md` constrain implementation and change control.

**Repository state:** clean Phase 2 boundary. Premature Phase 4 Squad runtime code/routes and temporary Monetag diagnostic UI have been removed. Phase 12 admin-provider HTTP/configuration code that was not part of the opened phase has also been removed. Migration `008_squad_engine.sql` remains immutable history; `009_cleanup_unreleased_squad.sql` keeps active environments aligned with the Phase 2 schema boundary. The unused duplicate `src/providers/ads/ads-provider.js` abstraction was removed; `src/services/ad-provider-service.js` remains the provider-neutral advertisement boundary.

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

🟡 Backend foundation implemented; baseline isolated runtime verification passed; remaining implementation and acceptance work pending.

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
- 🟢 Daily Check-in HTTP exposes only the claim boundary; advertisement verification and reward finalization are no longer client-callable routes. Trusted Monetag postback remains the reward verification/finalization boundary.
- 🟢 Temporary Monetag diagnostic page and diagnostic code were removed after troubleshooting.
- 🟢 Monetag zone/context are centralized in `src/config/monetag.js` and consumed by both the browser adapter build and server postback validator.
- 🟢 Task Verification now enforces the verification-ad gate before invoking the trusted task verifier; the regression test also asserts that the verifier is not called before `ad_completed`.

### Baseline runtime verification

The existing Phase 2 CI workflow was executed against the current Phase 2 code on PR #37's final head commit `1e2c812f25cdf6e170ee773c64a2eadb76122478` (workflow run #115). The isolated PostgreSQL 16 environment, migrations, runtime health checks and full `npm run test:all` suite all passed. The successful PR was then merged into `main` as commit `4a899616e83daee26e4365fb419f6d6104fb1bb9`. The main deployment status for that commit is also successful.

- 🟢 `npm run migrate` — passed in isolated PostgreSQL 16.
- 🟢 `npm run test:phase2` — passed.
- 🟢 `npm run test:phase1` — passed.
- 🟢 `npm run test:economy-ledger` — passed.
- 🟢 `npm run test:deposit` — passed.
- 🟢 `npm run reconcile:economy` — passed as part of `test:all`.
- 🟢 `/health` and `/health/db` — both passed in the isolated runtime.
- 🟢 `npm run test:frontend` — passed.
- 🟢 Daily Check-in service and HTTP boundary tests — passed.
- 🟢 Task catalog, execution, lifecycle and verification-config tests — passed.
- 🟢 Advertisement provider and Monetag postback/YMID/finalization tests — passed.

### Remaining Phase 2 implementation

- ⬜ Real task adapters/verifiers for Daily, Game, Social, Web and Special/Partner tasks.
- 🟢 Real advertisement provider integration and trusted callbacks — Monetag Rewarded Interstitial integration is merged in `main` via PR #28 and PR #29; the current provider flow is server-authoritative and postback-driven.
- ⬜ Advertisement task flow without a second verification ad.
- 🟢 Daily Check-in claim service using the 24-hour backend cooldown and required ad gate — implemented and connected to Monetag Rewarded Interstitial in PR #29.
- 🟢 User-facing Daily Check-in Monetag wiring — merged in PR #29 and covered by the existing Daily Check-in HTTP boundary test.
- ⬜ Anti-fraud hardening around ad callbacks and task verification.

Phase 2 is **not complete** yet. Baseline runtime verification is now green, but the remaining implementation and acceptance criteria above must be completed and verified before Phase 2 can be closed.

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
⬜ Not started. No admin provider configuration route/service is active in the current Phase 2 boundary.

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

## Architecture audit cleanup — 2026-08-22

- Removed premature Phase 12 admin-provider route, admin authentication boundary, provider configuration service and its tests.
- Removed the temporary Monetag diagnostic page and client-side diagnostic functions.
- Removed client-callable Daily Check-in `/verify` and `/finalize` routes; verification/finalization remain server-side through the trusted postback boundary.
- Repaired the frontend validation script so it checks the current production flow instead of obsolete function names.
- Aligned the Monetag postback ADR/test terminology with Monetag's actual `reward_event_type=valued` contract.
- Centralized the Monetag zone/context to prevent frontend/server configuration drift.
- Removed the unused duplicate `src/providers/ads/ads-provider.js` abstraction; the existing `ad-provider-service.js` remains the single provider-neutral boundary.
- Fixed the existing Daily Check-in HTTP boundary test so its 404 assertions do not assume that Express returns JSON for an unregistered route.

## Change Log

### 2026-08-23 — Task Verification gate ordering

- Merged PR #42 with commit `6debee9373c22cd03744bf72d6308af49053a0e9`.
- Enforced the existing Phase 2 verification contract so `finalizeTaskVerification()` checks the verification advertisement state before invoking the trusted task verifier.
- Added a regression assertion proving that the trusted verifier is not called when the verification advertisement has not been verified.
- PR #42 passed the Phase 2 CI workflow before merge, including isolated PostgreSQL, migrations, runtime health and `npm run test:all`.
- No database migration, service, provider, economy, ledger or duplicate source of truth was introduced.
- Phase 2 remains open; this fix closes only the verification-gate ordering defect.

### 2026-08-22 — Monetag Rewarded Interstitial integration

- Merged PR #28 for server-side Monetag YMID generation, postback verification and finalization.
- Merged PR #29 for the user-facing Daily Check-in Monetag Rewarded Interstitial flow.
- Verified PR #29 with CI on its final head commit before merge.
- Daily Check-in now obtains the server-generated advertisement identifier, invokes the configured Monetag SDK, and leaves reward finalization to the server-side postback flow.
- No new database migration, economy, ledger, reward system or duplicate test source was introduced by the integration.
- Remaining limitation: broader Phase 2 implementation and anti-fraud hardening are still pending.

### 2026-08-22 — Phase 2 baseline runtime verification

- Full isolated Phase 2 workflow passed on PR #37 final head commit `1e2c812f25cdf6e170ee773c64a2eadb76122478` (workflow run #115).
- The verified suite included migrations, isolated PostgreSQL 16, runtime health checks and `npm run test:all`.
- PR #37 was merged into `main` as `4a899616e83daee26e4365fb419f6d6104fb1bb9`.

## Update Rule

After every validated milestone, update this file with:
1. What was implemented.
2. What was actually tested.
3. Commit/reference used.
4. Remaining limitations.

Never mark unvalidated work as completed.
