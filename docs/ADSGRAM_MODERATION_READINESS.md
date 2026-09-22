# DzMoney — AdsGram Moderation Readiness

**Status:** 🟡 Evidence / moderation gate pending

**Baseline:** PR #301 merged to `main` at `d850141415f573f052fa1e74784fe9e5f1466df9`.

## Purpose

This document records the AdsGram moderation-readiness findings so they can be resumed without re-auditing or inventing a new integration design.

The current conclusion is that the AdsGram integration code is substantially aligned with the provider contract. The remaining work is primarily moderation evidence, real Telegram runtime validation, deployment/configuration verification, and release evidence. No implementation rewrite is authorized unless a concrete failure is proven.

## P0 — Release / moderation gates

### 1. Public proof of reward payouts

AdsGram moderation requires evidence that users actually receive rewards. Before moderation, identify and use an existing canonical public surface for payout proof, such as an existing public channel, leaderboard, or dedicated payout-confirmation surface.

Constraints:
- Do not create a second payout/economy system.
- Do not expose Telegram IDs, wallet secrets, provider secrets, or other private data.
- Record the exact evidence location when available.

### 2. Real Telegram AdsGram E2E

The existing Playwright/browser test is not sufficient to prove AdsGram works in a genuine Telegram Mini App environment. The controlled Telegram test must validate the complete real flow:

`Squad → Squad Ads → WATCH AD → Monetag → AdsGram → provider confirmation → canonical reward → progress persistence`

Required evidence includes:
- AdsGram opens successfully inside Telegram;
- valid Telegram launch/user context is received;
- `client-started` occurs before `client-complete` for the same `adEventId`;
- provider confirmation is bound to the same Telegram user and advertisement event;
- the event is verified and rewarded exactly once;
- Squad progress increments exactly once and persists after reload;
- no client-side verification bypass or fake callback is used.

The detailed manual procedure remains in `docs/PHASE14_ADSGRAM_TELEGRAM_E2E.md`.

### 3. Production exact-head verification

Prove the complete chain:

`main merge SHA → Railway deployment → production runtime → Telegram Mini App`

Do not treat a healthy/active Railway service as proof that the exact audited commit is running. Current connector access has not established this evidence; therefore production exact-head runtime remains pending.

### 4. AdsGram dashboard configuration

Verify directly in the AdsGram publisher dashboard:
- correct Telegram Mini App / bot;
- correct Web App URL or bot ID;
- correct Reward block;
- block ID matches the application configuration;
- Reward URL, when configured, points to the intended production HTTPS endpoint;
- production is not using AdsGram debug mode.

Do not infer dashboard state from repository configuration.

## P1 — Moderation and economic readiness

### 5. Reward economics review

The current advertisement-progress reward is approximately `1000 COIN + 1 DZX + 1 DZP` under the canonical activity reward defaults observed in the current implementation.

Do not change these values merely for moderation. First document their economic valuation and confirm that the reward is not unrealistic/excessive under the product's existing economic model.

### 6. UX moderation safety

The app must preserve basic functionality without forcing ads for core actions. Ads must be presented as a clearly communicated bonus/reward mechanism.

Verify that:
- the user understands that watching the ad produces the bonus;
- ordinary/core actions are not blocked solely because the user declines an ad;
- users are not sent to ads on every click;
- the wording does not imply an ad is mandatory when it is not.

### 7. Clear ad placement

The moderation-verifiable placement is:

`Squad → Squad Ads → WATCH AD → AdsGram Rewarded`

Keep the placement explicit in the UI and release evidence. Do not introduce another ad placement merely for moderation.

### 8. Release evidence / observability

For each successful manual gate, retain non-sensitive evidence:
- test date/time;
- controlled Telegram test account identifier only in the minimum safe form needed for internal evidence;
- first and second `adEventId` values;
- provider for each event;
- final Squad Ads progress;
- confirmation that the test ran inside Telegram;
- relevant Railway request/log evidence where available.

Never commit credentials or provider secrets.

## Current technical assessment

| Area | Status | Decision |
|---|---|---|
| AdsGram provider integration | 🟢 | No rewrite indicated |
| Provider registry / identity | 🟢 | Keep canonical registry |
| AdsGram SDK contract | 🟢 | Keep official SDK flow |
| Server event correlation | 🟢 | Keep current user/event/block correlation |
| Idempotency / canonical Economy reward | 🟢 | Keep existing Economy/Ledger boundary |
| Squad Ads placement | 🟢 | Keep current placement |
| Automated test coverage | 🟢 | Retain current unit/integration/contract/security/load gates |
| Exact merged-head CI evidence | 🟡 | Re-verify at release head |
| Real Telegram E2E | 🔴 pending | Must pass before release/moderation |
| Production exact-head runtime | 🔴 pending | Must be proven |
| AdsGram dashboard configuration | 🟡 pending | Verify directly |
| Public payout proof | 🔴 pending | Required moderation evidence |
| Reward economics evidence | 🟡 pending | Review before moderation |

## Explicit non-actions

The following are intentionally **not** authorized by this audit:

1. Do not rewrite the AdsGram adapter/integration.
2. Do not remove the AdsGram Reward URL merely to simplify testing; it is a supported publisher mechanism.
3. Do not create another Economy, Ledger, Verification, Reward, Activity, or Advertisement system.
4. Do not alter reward values without economic evidence and a concrete product decision.
5. Do not change production code until a real failure or missing contract is proven.
6. Do not close Phase 14 while the release/moderation evidence gates remain unproven.

## Resume order

When work resumes, follow this order:

1. Verify exact current `main` and PR #301 baseline.
2. Verify exact-head GitHub CI evidence.
3. Verify Railway deployment/runtime against the exact head.
4. Verify AdsGram dashboard configuration directly.
5. Execute the genuine Telegram E2E gate.
6. Locate/record public payout proof.
7. Complete reward-economics and UX moderation review.
8. Only if a concrete failure is found, create a narrowly scoped TDD fix on a feature/fix branch and re-run the complete release gates.

## Source-of-truth rule

This document is an evidence/readiness record. It does not replace the canonical Advertisement provider registry, Task Catalog/Execution/Verification/Reward boundaries, or Economy/Ledger. Existing implementation and governing phase documents remain authoritative for runtime behavior.
