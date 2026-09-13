# Phase 4 — Squad

**Specification status: LOCKED**  
**Project Phase 4 status: IN PROGRESS**  
**Squad internal Phase 4 status: CLOSED**

> **Phase-numbering guard:** **Project Phase 4** is the product-level Hierarchical Squad System milestone. The **Squad internal Phase 4** redesign slice is the paid/pending Option B scope. They must not be conflated. Closing the internal Phase 4 slice does **not** close Project Phase 4.

The authoritative Phase 4 business contract is:

- `docs/SQUAD_SYSTEM_MASTER_CONTRACT.md`
- `docs/ADR-0019-SQUAD.md`

These documents supersede all earlier Squad-specific business rules in legacy roadmap material.

## Phase 4 matching priority and pending scope

The matching order is normative and must not be inverted:

1. **Eligible Squad first:** if any eligible Squad currently exists for the requested tier, the purchaser joins that Squad immediately. This rule applies regardless of the Squad's origin (referral, prior paid membership, invitation, or another valid formation path).
2. **Pending only as fallback:** only when no eligible Squad exists at all does the request enter the persistent pending path.
3. **T1 only uses pending-to-pending pairing:** the next same-tier pending T1 request pairs with the earliest pending T1 request to form exactly one new Squad; the earliest request becomes Owner.
4. **T2–T10 use persistent interest requests only:** T2–T10 pending requests never pair with each other and never create a new Squad from pending requests. Each request remains independent and waits for an existing eligible Squad to become available through a valid formation/growth path.
5. An existing pending request never takes priority over a currently eligible Squad.
6. Pending creation is zero-charge and creates no Ledger burn; DZP is charged only at actual settlement.

This ordering is intentionally explicit so that future reviews do not interpret pending interest as higher priority than an already available eligible Squad.

## Validated implementation and acceptance evidence

Validated implementation slices relevant to Project Phase 4 include:

- System-created Squad persistence.
- Free membership invitation/activation.
- Paid membership purchase/activation.
- Persistent zero-charge pending purchase state.
- Deterministic T1 pending-pair Squad formation.
- T2–T10 persistent interest-request fallback.
- Daily Squad State.
- Daily DZP Contribution + Modifier.
- Weekly Challenge accounting/settlement with the canonical Economy rounding rule.

The final paid/pending Option B scope was implemented in PR #355 and merged to `main` as merge commit `a5956497c3fb7cc13225a8b767d0e51de5d71f63`.

The merged implementation includes behavioral coverage for affordability, zero-charge pending state, T1 first/second settlement and deterministic ownership, eligible-Squad-first matching, deterministic smallest-Squad selection, idempotency/concurrency, T2–T10 persistent interest behavior, rollback safety, refresh/reopen behavior, and economy/ledger reconciliation. The final exact-head CI for merge commit `a5956497c3fb7cc13225a8b767d0e51de5d71f63` passed the repository's relevant validation workflows, including full test suite, migrations, Gaming/OnClickA/GigaPub/TON boundaries, Playwright coverage, runtime health, lint/complexity, security/dependency audit, and Phase 10 checks.

Economy/Ledger reconciliation at the validated implementation head reported zero negative wallets, zero DZP source mismatches, zero ledger mismatches, zero invalid ledger currencies, zero ledger-balance mismatches, and zero ledger-chain mismatches.

This evidence closes **Squad internal Phase 4 — Paid Purchase + Tier-1 Waiting**. It does not close the product-level Project Phase 4 milestone because the Squad contract continues through later internal gates.

## Squad internal phase boundary

Project Phase 4 remains **IN PROGRESS** until the remaining internal Squad gates are independently accepted. The current contract defines the remaining internal sequence as:

- **Internal Phase 5 — Persistent Interest Requests**
- **Internal Phase 6 — Switch and Upgrade Semantic Gate**
- **Internal Phase 7 — Modifier/Economy decision and implementation gate**
- **Internal Phase 8 — Squad UX Contract (Design Only)**
- **Internal Phase 9 — Squad UI Implementation Gate**
- **Internal Phase 10 — Investigation and Validation Gate**

These are internal Squad phases inside **Project Phase 4**. They must not be mapped to the product-level roadmap's Project Phases 5–10.

Current status of the remaining internal phases is **NOT CLOSED by this document**. Their implementation/acceptance state must be established independently through Contract Lineage, implementation, tests, schema/migrations, callers, CI, and runtime evidence before any closure claim is made.

## Weekly Challenge accounting boundary

The Weekly Challenge implementation uses the existing Verified Activity and Economy/Ledger records as its only evidence and economic sources. Each challenge snapshots its scope/reward configuration, spans exactly seven UTC+1 days, keeps independent accounting, supports the locked challenge scopes, and settles idempotently through the existing Economy/Ledger. A member must remain eligible at settlement. Proportional allocation reuses the existing Economy fixed-point half-up rounding rule; no Squad-specific rounding algorithm exists.

The `Verified Squad AdView` scope is supported by the accounting contract, but no new activity producer is introduced here because the current repository has no verified Squad-ad producer. Existing verified activity producers remain the source of truth.

### App Ban boundary

App Ban is **not an automatic Squad action** and is not owned by the Squad subsystem. The system may generate an administrative warning when evidence indicates that a user should be suspended/banned. The **Admin is the enforcement authority**: after reviewing the warning/evidence, an authorized Admin explicitly decides whether to suspend/ban the user. Ignoring a warning performs no membership mutation.

The existing `squad_membership.status` model already represents `suspended` and `cancelled`, and implemented membership/challenge boundaries respect membership eligibility. The authoritative Admin warning/enforcement control surface belongs to the later Admin Panel phase and must be implemented there when that phase is opened; Phase 4 must not invent a duplicate Admin service, route, or enforcement system.

Accordingly, the absence of the later Admin control surface is **not** a Project Phase 4 implementation blocker. Admin enforcement remains a later-phase control-surface dependency owned by the Admin Panel lineage.

## Final Project Phase 4 gate

Project Phase 4 remains **OPEN / IN PROGRESS**. The current evidence proves completion of the **Squad internal Phase 4** paid/pending Option B slice only. It does not authorize closure of the product-level Hierarchical Squad System milestone.

No Economy, Ledger, Verification, TON, API, or database repair is authorized by this boundary correction. Future work must proceed through the remaining Squad internal phases under Constitution 54 and must not jump to Project Phase 5 Gaming merely because the internal Phase 4 slice is complete.

Every future slice remains subject to Constitution 54: code, history, PR, CI, tracing, tests, documentation, issues, runtime/failure-history and final-diff gates before merge.
