# ADR-0012 — Squad Contract and Membership Model

**Status:** Accepted — Business Contract Locked  
**Date:** 2026-08-31

## Context

Earlier Squad material described a hierarchical ten-level model and a daily activation rule requiring both a member target and 50% activity. That design is obsolete. The current Squad contract must remain the only business source of truth before and during Phase 4 runtime work.

## Decision

The complete locked Squad business contract is defined in `docs/SQUAD_SYSTEM_CONTRACT.md`.

Authoritative decisions include:

1. Squad is independent from Referral and Reward Pool and reuses existing Verified Activity, Economy, Ledger, configuration and rounding boundaries.
2. A user belongs to at most one Squad.
3. Free membership uses Owner invitation → user acceptance → one Verified Activity → ACTIVE membership.
4. A user without an eligible Squad may purchase membership by selecting only a member-count/price tier; the backend selects the lowest-current-member-count Squad in that tier.
5. Initial prices are 100 DZP for 1–10, 200 for 11–20, 500 for 21–50, 1,000 for 51–100, 2,000 for 101–200, and 3,000 for 201–300; further tiers are Admin-defined.
6. Paid membership burns the selected-tier DZP through the existing Economy/Ledger path. It never pays the Owner. Payment alone does not activate membership; one Verified Activity is required after purchase.
7. Squad tier is derived from current member count. A member may move the Squad across a tier boundary; there is no artificial global member cap.
8. Squads are created by the system. Users cannot create Squads or self-assign ownership. The system assigns the Squad Owner server-side and idempotently. Owner assignment must be deterministic and must not create another identity source of truth.
9. Members cannot voluntarily leave. App Ban may terminate membership. Cancelled/revoked membership receives no Challenge reward.
10. Member `inactive/active` state is distinct from Squad `ACTIVE/RISK` state.
11. The default daily verified Squad ad target is 10 per new UTC+1 day and is Admin-configurable.
12. Daily Squad activation is Target reached OR at least 50% Active among Eligible Squad Members. The result applies to the following day.
13. Daily target uses that day's eligible-member count and is not retroactively recomputed.
14. Daily accounting counts all members active that day, not only Contributors.
15. `1 DZP earned = 1 DZP Contribution`; contribution is accounting only.
16. Challenge scope distinguishes activity types. Matching activities may contribute to multiple matching Challenges, but the underlying activity reward is never paid twice because of multiple Challenges.
17. Each day produces an independent Modifier for the next day and never compounds old modifiers.
18. Modifier mapping is 1,500 DZP → 15%, 5,000 → 50%, 10,000 → 100%, 15,000 → 100%, maximum 100%.
19. The daily Modifier applies only to members who contributed to activation of that day's Squad condition.
20. The Modifier applies to all qualifying Verified Activity reward currencies except DZP. `1000 COIN + 1 DZX + 1 DZP` at 15% becomes `1150 COIN + 1.15 DZX + 1 DZP`.
21. Weekly Challenge is an achievement system, not Reward Pool. Multiple Challenges may coexist.
22. Each Challenge cycle lasts exactly seven consecutive days, starts at 00:00 UTC+1, ends at 23:59:59 UTC+1 on day 7, and has independent accounting.
23. Challenge configuration is fixed for the current cycle; Admin changes apply to a new cycle.
24. Admin Challenge scopes are ALL TASKS, Type Tasks, Verified Ad, Verified Task, Verified Squad AdView, and All Activity Verified.
25. Challenge rewards use the existing Economy/Ledger and credit users' existing balances.
26. Distribution uses only current-cycle DZP Contribution; historical Challenge points never carry forward.
27. User must remain eligible at settlement to receive Challenge rewards.
28. Existing project rounding is canonical.
29. Membership activation, purchase/burn, daily calculations, Modifier generation and Challenge settlement are server-authoritative and idempotent.
30. App Ban is an administrative enforcement action, not an automatic Squad or activity action. The system may issue an administrative warning when evidence indicates that a user should be suspended/banned. An authorized Admin reviews that warning/evidence and explicitly decides whether to suspend/ban; ignoring the warning performs no membership mutation.
31. The Admin warning/review/enforcement control surface belongs to the later Admin Panel phase. Phase 4 must not invent a duplicate Admin service, route, or enforcement system merely to satisfy the Squad membership dependency.

## Obsolete decisions

Do not implement the old hierarchical ten-level model, AND activation rule, Risk-as-member-state, separate Squad economic/reward/verification systems, cross-cycle Challenge accounting, DZP modification, Owner payment from membership purchase, direct Squad selection, user-created Squads, self-assigned ownership, or automatic App Ban from Squad/activity logic.

## Consequences

Phase 4 runtime reuses existing identity, Verified Activity, Economy, Ledger, configuration, rounding and membership primitives. The existing membership model can represent suspended/cancelled membership, while the later Admin phase owns the warning/review/enforcement control surface. Legacy migration 008 must not be resurrected as runtime design.
