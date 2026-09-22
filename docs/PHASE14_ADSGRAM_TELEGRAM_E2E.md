# Phase 14 — AdsGram Telegram Real E2E Release Gate

## Purpose

This is the release gate for validating the AdsGram provider in a genuine Telegram Mini App environment.

The existing Playwright browser test is **not** a release gate for AdsGram because headless Chromium is not a Telegram launch environment and AdsGram may reject it before the provider flow starts.

The broader moderation-readiness record is maintained in `docs/ADSGRAM_MODERATION_READINESS.md`. That document is the checklist for moderation evidence, production/runtime verification, dashboard configuration, payout proof, reward economics, and UX safety.

## Preconditions

- Phase 14 automated gates are green.
- Do not change Railway configuration solely to make this test pass.
- Use the controlled Telegram test account and the current production deployment.
- Keep the existing provider verification and correlation flow unchanged.
- Production AdsGram must not run in debug mode.

## Manual procedure

1. Open the production DzMoney Mini App from Telegram, not from a normal browser.
2. Authenticate as the controlled test Telegram account.
3. Open **Squad**.
4. Confirm the Squad Ads task is available.
5. Press **WATCH AD**.
6. Confirm the first allocated provider is **Monetag**.
7. Watch the Monetag advertisement to completion.
8. Confirm the UI reaches **Verified.** and the Squad Ads progress updates.
9. Press **WATCH AD** again.
10. Confirm the second allocated provider is **AdsGram**.
11. Confirm AdsGram receives valid Telegram launch/user context and displays the Rewarded advertisement.
12. Watch the AdsGram advertisement to completion.
13. Confirm the client-started and client-complete callbacks occur for the same `adEventId`.
14. Confirm the AdsGram provider callback verifies the same Telegram user and event.
15. Confirm the UI reaches **Verified.** and Squad Ads progress updates exactly once.
16. Refresh/reopen Squad and confirm the completed progress remains persisted.

## Pass criteria

All of the following must be true:

- Monetag → AdsGram rotation is observed for the controlled test user.
- AdsGram opens successfully inside Telegram.
- No fake callback or client-side verification bypass is used.
- `client-started` is recorded before `client-complete`.
- Provider confirmation is bound to the same user and advertisement event.
- The event becomes verified and rewarded exactly once.
- Squad progress is persisted after reload.
- No unrelated Economy/Ledger/Reward source is introduced.

## Failure classification

- AdsGram refusing a normal browser/headless launch: **test-environment limitation**, not evidence of a production integration defect.
- AdsGram failing inside the genuine Telegram Mini App: **production/provider integration failure** and must be investigated before release.
- Wrong provider rotation inside Telegram: **production rotation/state failure** and must be investigated before release.
- Successful ad display but missing correlation/finalization: **production correlation failure** and must be investigated before release.
- Duplicate reward/progress: **production idempotency/economy failure** and must block release.

## Evidence to record

For a passing manual gate, record:

- date/time of test
- controlled Telegram test user
- first `adEventId` and provider
- second `adEventId` and provider
- final Squad Ads progress
- confirmation that the test was performed inside Telegram
- Railway request/log evidence for the two events where available
- production deployment commit evidence where available

Do not record bot tokens, provider secrets, or other credentials in the repository.

## Moderation checklist reference

Before requesting AdsGram moderation, also complete every unresolved item in `docs/ADSGRAM_MODERATION_READINESS.md`, especially:

- public proof of reward payouts;
- exact production-head/runtime verification;
- direct AdsGram dashboard configuration verification;
- production `debug=false` verification;
- reward-economics review;
- clear non-mandatory ad UX for core functionality;
- clear and verifiable Squad Ads placement.

Passing this E2E document alone does **not** close Phase 14 or establish moderation approval.
