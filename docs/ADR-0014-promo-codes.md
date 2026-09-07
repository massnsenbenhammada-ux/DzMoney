# ADR-0014 — Promo Codes use the canonical Economy/Ledger and a dedicated ad context

**Status:** Accepted
**Date:** 2026-09-07

## Context

Phase 10 requires the user flow `Enter code → Claim/Redeem → verified advertisement → reward` while allowing Admin to configure the code, reward currency/amount, limits, expiry, eligibility and ad-gating.

DzMoney already has one canonical Economy/Ledger path and one advertisement event store. Reusing the task-verification pipeline for Promo would incorrectly couple Promo claims to task attempts and could allow a verification event to be interpreted as a task reward.

## Decision

1. Promo campaigns and user redemptions use dedicated `promo_campaigns` and `promo_redemptions` tables.
2. Each redemption snapshots the configured reward currency and amount so later campaign edits cannot rewrite historical economics.
3. Promo advertisements use the existing `activity_ad_events` store with explicit `context = 'promo'`.
4. Existing provider rotation and provider adapters are reused; no second ad system is introduced.
5. Provider callbacks finalize Promo redemptions through `promo-code-service`, not through Task Verification.
6. Rewards are issued only through the existing `creditActivityRewardOnClient` Economy/Ledger path with source `promo`.
7. Promo DZX remains a distinct `promo` source and is not treated as advertisement/task-earned DZX.
8. Idempotency is enforced separately for the redemption request, advertisement event and reward transaction.
9. Default campaign behavior is enabled and advertisement-gated. Explicitly configured non-gated campaigns may credit immediately.
10. Eligibility currently supports an optional Telegram-user allowlist. An empty allowlist means all users are eligible; no additional eligibility engine is introduced until the product contract requires one.

## Security and failure policy

- User authentication remains the existing Telegram authentication boundary.
- Admin campaign management remains behind `adminAuth`.
- Client requests cannot finalize a Promo reward by supplying provider verification payloads; finalization is performed only by trusted provider postback routes.
- Provider verification failure leaves the redemption pending and credits nothing.
- Expired pending redemptions cannot be rewarded.
- Concurrent campaign claims are serialized by the campaign row lock before usage limits are checked.
- Duplicate callbacks or duplicate finalization cannot create a second reward.

## Consequences

Promo remains isolated from Tasks, Referral, Squad and Gaming while still reusing the canonical Economy, Ledger and advertisement infrastructure. The implementation adds only the storage and orchestration required by the Phase 10 contract.
