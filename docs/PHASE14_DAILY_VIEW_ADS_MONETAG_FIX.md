# Phase 14 — Daily View Ads Monetag-only correction

## Finding

Daily View Ads calls Monetag directly in the client, while the server-side task advertisement allocator used the generic task provider rotation. The task registry can therefore persist a provider identity that does not match the client-side Monetag execution path.

## Correction

`view_ads` now persists `advertisementProvider: monetag` and the canonical task advertisement service uses the existing explicit-provider event boundary when a task declares a pinned provider. Other task/squad advertisement flows retain their existing rotation behavior.

## Verification

The existing `test:daily-view-ads` contract now asserts the persisted Monetag-only configuration and the pinned-provider boundary. The existing Phase 14 1-to-20 journey remains responsible for reward, idempotency, concurrency, Economy/Ledger and target invariants.

The real Monetag postback path remains the authoritative runtime verification path. `MONETAG_POSTBACK_SECRET` is stored as a GitHub repository secret for the Phase 14 CI integration work.
