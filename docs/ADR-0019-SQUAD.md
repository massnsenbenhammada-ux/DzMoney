# ADR-0019 — Squad Contract and Membership Model

**Status:** Accepted — Historical Contract Reference; superseded for the redesigned Squad model by `docs/SQUAD_SYSTEM_MASTER_CONTRACT.md`  
**Date:** 2026-08-31

## Authority

For the redesigned Squad model, the current business/design source of truth is `docs/SQUAD_SYSTEM_MASTER_CONTRACT.md`.

This ADR is retained as historical contract lineage. It must not be used to reintroduce rules that conflict with the master contract.

The implemented runtime, database schema, and tests remain authoritative for behavior that has already been implemented; they do not silently redefine the locked future-phase business contract.

## Historical Context

Earlier Squad material described a hierarchical ten-level model and a daily activation rule requiring both a member target and 50% activity. That design was later superseded by the reconciled Squad redesign documented in the master contract.

The historical rules below are preserved for traceability only. They are not current authority where they conflict with the master contract.

## Historical Decision Record

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
18. The historical modifier mapping was 1,500 DZP → 15%, 5,000 → 50%, 10,000 → 100%, 15,000 → 100%, maximum 100%. This historical rule is superseded by the redesigned contract.
19. The historical daily Modifier applied only to members who contributed to activation of that day's Squad condition.
20. The historical Modifier applied to qualifying Verified Activity reward currencies except DZP. This historical behavior is superseded where the master contract defines the redesigned economic model.
21. Weekly Challenge was an achievement system, not Reward Pool.
22. Challenge cycles were independently accounted in UTC+1.
23. Challenge configuration was fixed for the current cycle; Admin changes applied to a new cycle.
24. Historical Admin Challenge scopes included ALL TASKS, Type Tasks, Verified Ad, Verified Task, Verified Squad AdView, and All Activity Verified.
25. Challenge rewards used the existing Economy/Ledger and credited users' existing balances.
26. Distribution used current-cycle DZP Contribution; historical Challenge points did not carry forward.
27. User eligibility was checked at settlement.
28. Existing project rounding was canonical.
29. Membership activation, purchase/burn, daily calculations, Modifier generation and Challenge settlement were server-authoritative and idempotent.
30. App Ban was an administrative enforcement action rather than an automatic Squad/activity action.
31. The Admin warning/review/enforcement control surface belonged to the later Admin Panel phase.

## Obsolete Decisions

Do not implement the historical hierarchical model, historical AND activation semantics, Risk-as-member-state, separate Squad economic/reward/verification systems, cross-cycle Challenge accounting, DZP modification, Owner payment from membership purchase, direct Squad selection, user-created Squads, self-assigned ownership, or automatic App Ban from Squad/activity logic. For the redesigned model, consult `docs/SQUAD_SYSTEM_MASTER_CONTRACT.md`.

## Consequences

Phase-gated Squad redesign work must follow the master contract and its explicit phase order. No later phase may be started until the current phase acceptance criteria and contract lineage are verified.

Any apparent contradiction between this historical ADR and the master contract must be resolved in favor of the master contract for the redesigned Squad model, while preserving this ADR as historical lineage.
