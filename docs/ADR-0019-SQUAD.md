# ADR-0019 — Squad Contract and Membership Model

**Status:** Accepted — Historical Contract Reference; superseded for the redesigned Squad model by `docs/SQUAD_SYSTEM_MASTER_CONTRACT.md`  
**Date:** 2026-08-31

## Authority

For the redesigned Squad model, the current business/design source of truth is `docs/SQUAD_SYSTEM_MASTER_CONTRACT.md`.

This ADR is retained as historical contract lineage. It must not be used to reintroduce rules that conflict with the master contract.

The implemented runtime, database schema, and tests remain authoritative for behavior that has already been implemented; they do not silently redefine the locked future-phase business contract.

## Phase 4 clarification — Tier-1 matching priority

For the redesigned paid-membership flow, the priority is explicit and must be read in this order:

1. **Eligible-Squad-first is always the first decision.** For the requested tier, if **any eligible Squad currently exists**, the purchaser is matched to that Squad immediately, regardless of how that Squad was originally formed (referral, prior paid membership, invitation, or another valid formation path). The backend chooses the eligible Squad with the fewest current live members, using deterministic tie-breaking and the existing transaction/locking discipline.
2. **Pending is fallback-only.** Only when **no eligible Squad exists at all** for the requested tier may the purchase enter the persistent pending path.
3. **T1 is the only tier that uses pending-to-pending pairing.** For T1, the earliest pending request can pair with the next affordable pending T1 request to form exactly one new Squad; the earliest request becomes Owner.
4. **T2–T10 never pair pending requests with each other and never create a new Squad from pending requests.** For T2–T10, each pending request remains an independent zero-charge interest request until an existing eligible Squad becomes available through a valid formation/growth path.
5. The existence of an older pending request must **never override an eligible Squad that is currently available**. A later purchaser must join that eligible Squad rather than enter any pending pairing path.
6. Pending creation is zero-charge and creates no Ledger burn. Settlement charges DZP only when an actual eligible match or the T1 pending-pair formation is available.

This clarification is normative for Phase 4 review and is intended to remove ambiguity between **current eligible availability** and **pending interest**. It does not authorize a second matching system or a new notification/economic source of truth.

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
