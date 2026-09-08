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
- Added server configuration for AdsGram Test Reward Block `44442`; the provider remains disabled unless `ADSGRAM_ENABLED=true` and the server-side reward token is configured.
- Registered AdsGram only for the existing `task` advertisement context.
- Added strict task provider rotation: `monetag → adsgram → monetag → adsgram`.
- Added an application-owned Reward URL token boundary at `/api/ads/adsgram/reward` and bound callback resolution to Telegram user ID + Block ID + the single pending AdsGram event.
- Added authenticated `/api/daily-tasks/advertisement/client-complete` for the client half of the dual-confirmation protocol.
- Added provider state in the existing `activity_ad_events.metadata`: `client_completed` and `provider_confirmed`.
- AdsGram events become `verified` only after both confirmations are present; the existing `finalizeTaskAdvertisement()` then performs the existing Economy/Ledger reward exactly once.
- Added a per-user PostgreSQL advisory lock and pending-event invariant so a delayed AdsGram callback cannot be reassigned to a later AdsGram event.
- Added a provider-aware client boundary that preserves the Monetag lane and runs AdsGram through the real AdsGram SDK when the server-selected provider is AdsGram.
- No new Economy, Ledger, Task, Verification or reward store was introduced. No database migration was required.

### Tests
- Added `test:adsgram-provider` for Block ID validation, trusted verification contract and strict rotation.
- Added `test:adsgram-correlation` for client/provider dual-confirmation and route/source-of-truth contracts.
- Added an opt-in real provider-rotation Playwright acceptance test covering 20 alternating real Monetag/AdsGram attempts; it is not part of deterministic CI.
- Deterministic tests do not claim real AdsGram reachability or provider revenue evidence.

### Acceptance boundary
- AdsGram Test Platform configuration still requires its Reward URL to point at the deployed callback and include the application-owned reward token.
- No AdsGram production verification claim is made because the documented AdsGram callback is not cryptographically signed per impression.
- Phase 14 remains **OPEN** until the required real provider acceptance evidence is obtained; synthetic tests cannot close the gate.
- No Railway deployment was triggered by this feature branch.
