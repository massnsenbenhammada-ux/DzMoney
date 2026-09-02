# ADR-0015 — Gaming subsystem boundary

**Status:** Accepted for implementation planning  
**Date:** 2026-09-02

## Context

DzMoney will add two games, Spin and Digging, with resource progression driven by qualifying activity and verified gaming advertisements. Gaming can issue COIN, DZX and DZP, so it must not bypass the canonical Economy/Ledger and Advertisement boundaries.

The product decision also requires server-authoritative outcomes, persistent Digging boards, separate per-game ad progress, daily UTC+1 Energy, configuration versioning and economy simulation before final reward weights are locked.

## Decision

1. Gaming is a distinct product subsystem containing **Gaming Home**, **Spin** and **Digging**.
2. Spin and Axe are separate non-currency resources. Digging Energy is a third, daily-limited resource.
3. Gaming reuses the existing Economy/Ledger for all currency mutations and does not introduce a second ledger or reward engine.
4. Gaming reuses the existing Advertisement event/provider infrastructure. New explicit contexts are `gaming_spin_ad` and `gaming_digging_ad`; they must never satisfy another advertisement context.
5. Spin outcomes are decided server-side. The client animation only renders the persisted result.
6. A Digging board is generated once server-side and persisted. Tile reveal returns the stored tile result and never performs a replacement random roll.
7. Configuration changes create new versions. Historical Spin results and Digging boards retain the version that created them.
8. Sensitive Gaming mutations require authentication, idempotency, transactional locking and auditable Economy/Ledger mutation where applicable.
9. Daily Gaming boundaries use UTC+1. Digging Energy resets to 3 each calendar day.
10. Final rewards, weights, Jackpot parameters, ad-bonus weights, Axe thresholds and daily ad limits remain simulation-gated and are not hard-coded as production economics.
11. Gaming UI uses native modern HTML/CSS capabilities first and does not introduce a UI framework solely for Gaming.

## Consequences

Gaming remains auditable and isolated without duplicating core DzMoney domains. The simulation becomes a reproducible economic safety gate before production rewards are enabled. Product decisions that remain unresolved are explicit rather than inferred from examples.
