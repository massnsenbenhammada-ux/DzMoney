# ADR-0012 — Squad Contract and Membership Model

**Status:** Accepted — Business Contract Locked  
**Date:** 2026-08-31

## Context

Earlier Squad material in the roadmap described a hierarchical ten-level model and a daily activation rule requiring both a member target and 50% activity. That design is obsolete. Squad has not been implemented in the current codebase, so the new contract must be recorded before Phase 4 implementation begins.

## Decision

The complete locked Squad business contract is defined in `docs/SQUAD_SYSTEM_CONTRACT.md`.

The following decisions are authoritative:

1. Squad is independent from Referral and Reward Pool and reuses existing Verified Activity, Economy and Ledger boundaries.
2. Squads are created by the system. Users cannot create Squads or self-assign as Owners. The system assigns the Squad Owner; the concrete selection algorithm is an implementation detail and must remain server-authoritative and idempotent.
3. A user belongs to at most one Squad.
4. Free membership is possible through an Owner invitation. The user must accept the invitation and then perform one Verified Activity before membership becomes Active.
5. A user without an eligible Squad may purchase membership. The user chooses only a member-count/price tier; the backend chooses the eligible Squad with the lowest current member count in that tier.
6. Initial prices are 100 DZP for 1–10 members, 200 DZP for 11–20, 500 DZP for 21–50, 1,000 DZP for 51–100, 2,000 DZP for 101–200, and 3,000 DZP for 201–300. Further tiers are Admin-defined.
7. Paid membership burns the selected-tier DZP through the existing Economy/Ledger path. It never pays the Squad Owner. Payment alone does not activate membership; one Verified Activity is required after purchase.
8. Squad tier is derived from current member count. A Squad may cross a tier boundary when a member is added; there is no artificial global member cap.
9. A member cannot voluntarily leave a Squad. App Ban is the exception that can terminate membership. A cancelled/revoked membership receives no Challenge reward.
10. Member activity state (`inactive`/`active`) is distinct from Squad state (`ACTIVE`/`RISK`). `RISK` is never a member state.
11. The default daily verified-ad target is 10 at each new UTC+1 day and is Admin-configurable.
12. Daily Squad activation is **Target reached OR at least 50% Active among Eligible Squad Members**. The result determines the Squad state for the following day.
13. Daily target is based on that day's eligible-member count and is not retroactively recomputed from later membership changes.
14. Daily accounting counts all members who were active during that day, not only Contributors.
15. `1 DZP earned = 1 DZP Contribution`. Contribution is accounting only and never mints additional DZP.
16. Challenge scope determines which Verified Activity types contribute. An activity may contribute to multiple matching Challenges, but its underlying reward is never paid twice because of multiple Challenges.
17. Each day produces an independent Squad Modifier for the next day. It never compounds with old modifiers.
18. Modifier mapping is 1,500 DZP → 15%, 5,000 → 50%, 10,000 → 100%, 15,000 → 100%, with a 100% maximum.
19. The daily Modifier is applied only to members who contributed to the activation of that day's Squad condition.
20. The Modifier applies to all qualifying Verified Activity reward currencies except DZP. With a base reward of 1,000 COIN + 1 DZX + 1 DZP and a 15% Modifier, the result is 1,150 COIN + 1.15 DZX + 1 DZP.
21. Squad remains modifier metadata and never becomes a new economic source or a separate Referral earning stream.
22. Weekly Challenge is an achievement system, not Reward Pool. Multiple Challenges may exist simultaneously.
23. Each Challenge cycle lasts exactly 7 consecutive days, starts at 00:00 UTC+1, ends at 23:59:59 UTC+1 on day 7, and has independent accounting starting from zero.
24. Challenge configuration is fixed for the current cycle. Admin changes apply to a new cycle.
25. Admin may choose Challenge scope from ALL TASKS, Type Tasks, Verified Ad, Verified Task, Verified Squad AdView, or All Activity Verified.
26. Challenge rewards are Admin-defined and credited through the existing Economy/Ledger path. They do not create a second reward or wallet system.
27. Challenge reward distribution uses only DZP Contribution earned during the current Challenge cycle, weighted by contribution. Historical Challenge points are never carried into a new cycle.
28. A user must remain eligible at settlement to receive a Challenge reward.
29. Existing project rounding rules are canonical; Squad does not introduce a separate rounding algorithm.
30. Membership activation, purchase/burn, daily calculations, Modifier generation and Challenge settlement are server-authoritative and idempotent.

## Obsolete decisions

The following must not be implemented:

- the old hierarchical ten-level Squad bonus model;
- requiring both daily target and 50% activity;
- treating Risk as a member status;
- a separate Squad Economy, Ledger, Reward or Verification service;
- carrying Challenge contribution across cycles;
- applying the Squad Modifier to DZP;
- paying paid-membership DZP to the Squad Owner;
- letting the user choose a specific Squad rather than a price/member-count tier;
- allowing users to create Squads or self-assign as Owners.

## Consequences

Phase 4 implementation must start with focused TDD and the minimum persistence required by this contract. The implementation must reuse existing identity, Verified Activity, Economy, Ledger, configuration and rounding primitives wherever they already provide the required behavior. No legacy Squad migration is to be resurrected.
