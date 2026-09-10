# DzMoney Development Log

## 2026-09-08 — Phase 14 Daily View Ads E2E / Load Gates

### Pre-change audit

Inspected the current Phase 14 branch, PR #294, exact-head CI, Daily View client/server flow, canonical `activity_tasks` configuration, `activity_ad_events` provider identity, Monetag `ymid` mapping, postback boundary, existing 1→20 integration journey, security/dependency workflow, and runtime/deployment state before adding release gates.

### Evidence before this change

- Unit, integration, API-contract, and security/dependency gates were already green on the previous exact-head CI.
- Existing `test:daily-view-ads-20-journey` already proves 1→20 reward/idempotency/concurrency/Economy/Ledger invariants against real PostgreSQL/migrations.
- No Playwright dependency or E2E runner existed.
- No dedicated Daily View performance/load gate existed.
- Daily View does not perform a TON payout; TON testnet transaction execution is therefore outside the Daily View reward path and is not fabricated as an acceptance proof.

### Implementation

- Added `@playwright/test` as a dev-only test dependency, pinned to the current stable 1.63 line.
- Added `playwright.config.js` with a real local server and Chromium test target.
- Added `tests/e2e/daily-view-ads.spec.js` covering the real browser UI → authenticated Daily View execution → Monetag provider identity → `ymid` → HTTP postback → canonical reward/progress path. The external Monetag SDK is stubbed only at the browser boundary; this test is not claimed as proof of Monetag network reachability.
- Added `scripts/test-daily-view-ads-load.js` with 50 concurrent canonical advertisement-start operations and a measured p95 threshold.
- Added both gates to the Phase 2 CI workflow, including Chromium installation and the existing repository secrets without exposing them.
- Extended workflow path matching to include `tests/**`.

### Real Monetag acceptance correction

- Added `tests/e2e/daily-view-ads-real-monetag.spec.js` as an explicit opt-in acceptance test.
- The real acceptance gate is now explicitly **20 consecutive real Monetag ads in one isolated Telegram session**, not one real ad followed by synthetic callbacks.
- For every one of the 20 ads the test requires: a fresh server-issued `adEventId`, a unique `externalAdId`/`ymid`, `providerId=monetag`, execution through the real Monetag SDK (`libtl.com/sdk.js` is not stubbed), server-confirmed progress for that exact step, `rewarded=true`, and the exact configured reward of `1000 COIN + 1 DZX + 1 DZP`.
- The test requires the final `20/20 watched` state and exactly 20 successful rewarded finalization responses in the browser evidence stream. It never fabricates a Monetag postback and never sends a manual reward callback.
- Added `test:e2e:daily-view-ads:real-monetag` as a manual/non-deterministic command; it is intentionally excluded from deterministic CI because external ad availability and provider timing are not CI-stable.
- The test does not use the old SDK-load marker as proof; it waits for the actual Monetag handler and real server-confirmed progress instead.

### External-provider evidence

- Current official Monetag documentation confirms that Rewarded Interstitial supports server-side postbacks, `ymid`, `request_var`, `telegram_id`, `reward_event_type`, and real postback confirmation; Monetag explicitly recommends testing the integration inside Telegram and configuring the postback URL on the SDK zone.
- Therefore the repository can now test the real provider path, but a PASS requires an actual Monetag-served ad and an actual Monetag server-side postback reaching the deployed DzMoney endpoint.
- The current Railway production service tracks `main` at commit `4b948b30937929679c6db9215bea379f1bb9645f`; PR #294 is not deployed there yet. No production deployment was triggered by this change.

### Non-goals

- No new Economy, Ledger, Task, Verification, Reward, or Provider system.
- No production provider rotation change.
- No real Monetag network claim from the deterministic browser stub.
- No real TON transaction was created merely to close an unrelated Daily View gate.

## 2026-09-08 — AdsGram Test Reward serialized correlation

### Pre-change audit

- Kept PR #294 as the parent change and stacked AdsGram work on top of its exact head rather than mixing the two feature diffs.
- Rechecked the canonical advertisement registry, `activity_ad_events`, Tasks-page advertisement flow, existing Economy/Ledger finalization, Telegram authentication boundary, and current Daily View client flow.
- Verified from the official AdsGram documentation that Reward URL callbacks expose the Telegram user ID but do not document a per-impression event ID or signed webhook payload.

### Implementation

- Added server configuration for AdsGram Test Reward Block `44442`; the provider remains disabled unless `ADSGRAM_ENABLED=true`.
- Registered AdsGram only for the existing `task` advertisement context.
- Added strict task provider rotation: `monetag → adsgram → monetag → adsgram`.
- Bound the documented Reward URL callback at `/api/ads/adsgram/reward` to Telegram user ID + Block ID + the single pending AdsGram event. No undocumented AdsGram account/API token is required by the callback contract.
- Added authenticated `/api/daily-tasks/advertisement/client-complete` for the client half of the dual-confirmation protocol.
- Added provider state in the existing `activity_ad_events.metadata`: `client_completed` and `provider_confirmed`.
- AdsGram events become `verified` only after both confirmations are present; the existing `finalizeTaskAdvertisement()` then performs the existing Economy/Ledger reward exactly once.
- Added a per-user PostgreSQL advisory lock and pending-event invariant so a delayed AdsGram callback cannot be reassigned to a later AdsGram event.
- Added a provider-aware client boundary that preserves the Monetag lane and runs AdsGram through the real AdsGram SDK when the server-selected provider is AdsGram.
- No new Economy, Ledger, Task, Verification or reward store was introduced. No database migration was required.

### Contract correction before activation

- Official AdsGram Publisher documentation was rechecked before Test Platform activation.
- The documented Reward URL contract requires HTTPS/GET and a `[userId]` placeholder; AdsGram replaces it with the Telegram user ID. The documentation does not specify an `ADSGRAM_REWARD_TOKEN` query parameter for this Publisher callback.
- Removed the unsupported `ADSGRAM_REWARD_TOKEN` configuration and callback requirement before any Railway activation.
- Updated the deterministic contract tests so they reject reintroduction of the undocumented token dependency.
- The AdsGram account/API `token` documented for advertiser conversion tracking is a different contract and is not used as the Mini App Reward URL credential.

### Tests

- `test:adsgram-provider` validates Block ID, trusted verification contract and strict rotation without an unsupported reward-token dependency.
- `test:adsgram-correlation` validates client/provider dual-confirmation and rejects the undocumented Reward URL token dependency.

## 2026-09-10 — PR #343 CI verification

### ODRCA evidence

- PR #343 targets `main` and its current head was verified against the repository workflows and exact commit metadata.
- The current head `af19456707ded8f976d35e98c8c2ee3653322839` is a true empty commit: it has the same tree as its parent `b5d5c1af55975d689129563e56ee56606f996061` and zero file changes.
- The exact current head has zero GitHub Check Runs, while the preceding real revision `e05589b24cc0cec69a1e3efb89f46fffa848592b` has completed successful CI checks.
- The repository workflows remain configured for `pull_request` against `main`; no application-code or ESLint failure was established as the cause of the missing current-head checks.

### Corrective action

- Added this required development-log entry as a real, minimal repository change on the PR branch so CI can be observed against a non-empty revision.
- No workflow trigger expansion, placeholder file, application-code modification, migration, or production action was introduced.

### Confirmation target

- Verify that the new real PR revision receives the expected `pull_request` workflow runs and inspect the resulting jobs/checks on that exact HEAD.
- If a workflow fails after execution, begin a new ODRCA cycle from that concrete failure rather than changing CI speculatively.
