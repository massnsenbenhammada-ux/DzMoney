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

### Non-goals
- No new Economy, Ledger, Task, Verification, Reward, or Provider system.
- No production provider rotation change.
- No real Monetag network claim from the browser stub.
- No real TON transaction was created merely to close an unrelated Daily View gate.
