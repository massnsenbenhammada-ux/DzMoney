# ADR-0019 — Squad Contract and Membership Model

**Status:** Accepted — Business Contract Locked; amended 2026-09-11  
**Date:** 2026-08-31

## Context

Earlier Squad material described a hierarchical ten-level model and a daily activation rule requiring both a member target and 50% activity. That design is obsolete. The current Squad contract must remain the only business source of truth before and during Phase 4 runtime work.

## Original Decision — Historical Record

The following decision was accepted on 2026-08-31 and is retained as historical context. Where it conflicts with the 2026-09-11 Contract Amendment below, the amendment is authoritative.

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

## 2026-09-11 Contract Amendment — Organic Formation, Classification Tiers and Pending Matching

This amendment formally supersedes only the conflicting portions of the historical decision above. Unchanged rules remain authoritative. The amendment is made because the previous automatic ten-user provisioning model conflicts with the intended paid-membership lifecycle and prevents a clean organic Squad model.

### A. Formation and membership entry paths

1. **No automatic provisioning.** A new user has no Squad by default. The former automatic `provisionSquadForUsers()` mechanism and its `/api/me` trigger are obsolete and must be removed from the runtime in the implementation phase.
2. **Referral-based organic formation.** The existing Referral relationship is reused as the canonical referral relationship; no second referral system is introduced. A referral-connected tree forms/joins the same Squad organically. The first person who starts the relevant referral tree is the permanent Owner of that referral-formed Squad, subject to the one-Squad invariant and deterministic server-side enforcement.
3. **Owner-direct invitation remains valid.** Existing `squad_invitations` is retained as a third, separate, optional free-formation/join path. It is not replaced by Referral formation. Owner-direct invitation and Referral-based organic formation coexist.
4. **Paid membership is a separate entry path.** Paid membership must not depend on Owner approval.
5. A user belongs to at most one non-cancelled Squad membership at a time.
6. Free membership activation continues to require one qualifying Verified Activity after the free membership is created, unless a later contract amendment explicitly changes that rule.

### B. Ten pricing/classification tiers

Tiers are pricing classifications, not hard membership caps:

| Tier | Current member count | `maxMembers` representation |
| --- | ---: | --- |
| 1 | 2–10 | `10` |
| 2 | 11–20 | `20` |
| 3 | 21–50 | `50` |
| 4 | 51–100 | `100` |
| 5 | 101–200 | `200` |
| 6 | 201–300 | `300` |
| 7 | 301–400 | `400` |
| 8 | 401–500 | `500` |
| 9 | 501–1000 | `1000` |
| 10 | 1000+ | `NULL` |

`NULL maxMembers` is the canonical representation of an unbounded upper range. Tier 10 therefore means `memberCount >= 1000`; it never imposes a ceiling.

Crossing a tier boundary does not require an existing member to repurchase or upgrade. The historical purchased tier of an individual membership remains unchanged.

### C. Live Squad tier versus purchased tier

The system must distinguish:

- **Current Squad Tier:** live classification derived only from current Squad member count.
- **Purchased Tier:** historical commercial tier recorded when the user's paid membership was established.
- **Requested Tier:** tier selected for a new purchase, switch, or upgrade operation.

These concepts must never be conflated.

When a paying member causes a Squad to cross a classification boundary, the existing members receive the higher **Current Squad Tier** classification for Squad-level behavior without any retroactive charge or rewrite of their **Purchased Tier**.

The Squad reward Modifier is based on the Squad's **Current Squad Tier/live classification**, and therefore all eligible members/contributors of that Squad receive the same applicable current-tier Modifier. Historical purchase tier does not determine the live Squad Modifier.

### D. Tier-1 purchase matching

1. A Tier-1 purchase is a purchase intent for the Tier-1 price/classification, not an immediate financial mutation when no eligible Squad exists.
2. If an eligible Squad exists, the backend matches the purchaser to the eligible Squad with the fewest current members, using deterministic tie-breaking and the existing transaction/locking discipline.
3. If no eligible Squad exists, the Tier-1 purchase intent enters `pending` with **no DZP charge** and no financial Ledger burn.
4. Pending Tier-1 requests are matched automatically when an eligible Squad becomes available. When two or more pending requests form a new system-matched Squad, the request created first becomes the Owner of that newly matched Squad.
5. Payment is settled only when the pending request is actually matched. Financial mutation and membership mutation must remain atomic and idempotent through the existing Economy/Ledger boundary.
6. Pending status must be visible to the user as a processing state. The user must not need to poll manually when the request is settled; the implementation must reuse the app's existing notification mechanism where available.

### E. Tier-2 through Tier-10 purchase interest

1. If no qualifying Squad is currently available for Tier 2 or above, tapping the tier creates a persistent **interest request** with `pending` state and no charge.
2. The interest request is automatically matched when an eligible Squad becomes available.
3. The user is notified through the app's existing notification mechanism when the request can be/has been settled.
4. The exact financial settlement transaction remains deferred until an actual match.
5. The implementation must not create a second notification subsystem merely for Squad interest requests.

### F. No hard tier ceiling

A Squad may exceed the upper boundary of its current classification because a new member joins. For example, a 10-member Tier-1 Squad may accept an additional member and become an 11-member Tier-2 Squad. The same principle applies at every boundary, including Tier 9 → Tier 10.

### G. Switch and Upgrade decision gate

The existing same-tier Switch and paid Upgrade mechanisms are **not removed by this amendment**. They survive as explicit paid membership lifecycle operations but require semantic adaptation during the Phase 6 design/implementation gate:

- **Switch — survives with modification.** The user's historical Purchased Tier remains the commercial reference for same-tier switching. Target selection must use the new live classification model rather than treating `maxMembers` as a hard capacity. The existing DZX tax, atomicity, status preservation and idempotency principles remain unless a later approved amendment changes them.
- **Upgrade — survives with modification.** An explicit user-paid Upgrade remains distinct from automatic/free Squad promotion. Paying to upgrade a user's Purchased Tier must never be triggered automatically merely because the Squad's live classification increases. The existing Economy/Ledger atomicity and replacement-membership semantics remain candidates for reuse, but target availability and the meaning of a higher Purchased Tier must be reconciled with the new classification model before Phase 6 implementation.

### H. Changelog

**2026-09-11 — Contract Amendment:** Replaced automatic ten-user Squad provisioning with no-default-Squad membership and three coexisting free/paid entry paths: Referral-based organic formation, optional Owner-direct invitation, and paid membership matching. Replaced the previous fixed six-tier/hard-range purchase interpretation with ten pricing/classification tiers, including unbounded Tier 10. Added persistent pending matching for Tier 1 and persistent interest requests for Tier 2+, with deferred charging and existing notification reuse. Clarified the distinction between live Squad tier and historical Purchased Tier and locked the rule that Squad modifiers follow the current live Squad classification. Switch and Upgrade remain pending the Phase 6 semantic gate rather than being silently removed.

## Obsolete decisions

The following historical decisions are superseded where they conflict with the 2026-09-11 amendment: automatic ten-user provisioning; `/api/me` as a Squad-formation trigger; treating the old tier ranges as hard purchase-capacity ranges; and treating system-created ten-user batches as the default Squad formation mechanism.

Do not implement the old hierarchical ten-level model, AND activation rule, Risk-as-member-state, separate Squad economic/reward/verification systems, cross-cycle Challenge accounting, DZP modification, Owner payment from membership purchase, direct Squad selection, user-created Squads, self-assigned ownership, or automatic App Ban from Squad/activity logic.

## Consequences

Phase 4 runtime must evolve toward organic/referral formation plus optional Owner-direct invitation and paid matching without creating duplicate Economy, Ledger, Verification, Reward or Activity systems. The existing Referral relationship remains the canonical referral relationship. Pending paid/interest state must not be treated as a financial transaction until a real Squad match is available. Tier classification must be derived from live member count, while historical purchase data remains immutable. Existing Squad-level daily accounting and Modifier infrastructure must consume the live Squad classification rather than an individual's historical Purchased Tier.
