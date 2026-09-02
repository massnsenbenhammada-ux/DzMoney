# DzMoney — Implementation Status

> **Authoritative baseline:** `main` after the merged Phase 4 implementation milestones through PR #207, with later merged changes reconciled separately. This document is maintained through the normal branch → PR → CI → review → merge workflow. Open Issues/PRs are not proof of missing implementation; status is determined from merged code, tests, CI evidence, and governing documents.

## Current state

- **Current phase:** Phase 5 — Gaming is explicitly authorized/opened by product decision; runtime Gaming implementation is **not started**.
- **Reward Pool:** **REMOVED FROM PRODUCT SCOPE.** Historical Reward Pool PRs/commits remain Git history only. No Reward Pool runtime, roadmap phase, or replacement phase is authorized.
- **Phase 2 code scope:** 🟢 **CLOSED / COMPLETE** for the currently defined and implemented contracts.
- **External provider dependencies:** 🟡 **PENDING_PROVIDER** for Special/Partner integrations and any future provider-specific evidence not yet supplied.
- **Phase 3:** 🟢 **CLOSED / COMPLETE** for the accepted Referral contract.
- **Phase 4:** 🟡 **IMPLEMENTATION IN PROGRESS**. The authoritative Squad contract is `docs/SQUAD_SYSTEM_CONTRACT.md`, with `docs/ADR-0012-SQUAD.md` and `docs/PHASE4_SQUAD.md`.
- **Phase 5:** 🟡 **AUTHORIZED / NOT IMPLEMENTED**. The canonical contract is `docs/PHASE5_GAMING.md` and the reconciled `PROJECT_ROADMAP.md`.
- **Latest audited TON/Deposit milestone:** PR #148.
- **Latest Tasks UI/scope milestone:** PR #204.
- **Latest Squad contract lock:** PR #190.
- **Latest merged Squad implementation milestone:** PR #207.
- **Latest merged main conversion-flow change:** PR #215. Its presence does not mean all later-phase product scope is complete; status follows validated phase contracts.

## Phase 0 — Specification Lock

🟢 Completed.

Economic and architectural rules remain those defined by the roadmap, architecture rules, ADRs, Constitution 54, and phase-specific contracts.

## Phase 1 — Economy & Currency Core

🟢 Runtime verified and signed off.

- Internal wallet currencies: COIN, DZX, DZP.
- TON is external settlement/reference, not an internal wallet currency.
- Economy/Ledger remains the single economic source of truth.
- Economy reconciliation exists.
- Activity reward decimal arithmetic preserves exact fixed-point values through the existing Economy/Ledger boundary.

No Phase 1 refactor is authorized unless a new invariant or security defect is proven.

## Phase 2 — Activity / Ads / Tasks

🟢 **Code scope closed.** All currently defined Phase 2 contracts that have an implemented evidence source are implemented and validated. External-provider-dependent integrations remain explicitly `PENDING_PROVIDER`.

The existing Task Catalog → Task Execution → Verification → Reward boundaries remain authoritative. No second Task, Verification, Advertisement, Activity, Economy or Ledger system is authorized.

## Phase 3 — Referral

🟢 **Closed / Complete for the accepted Referral contract.**

Implemented and validated:
- attribution;
- server-side qualification;
- activation reward;
- qualified referral count;
- permanent referral achievement tasks;
- canonical immutable referral codes;
- Telegram Mini App start-parameter bootstrap;
- canonical Telegram referral link;
- lifetime 20% reward from qualifying base COIN/DZX activity through the existing Economy/Ledger boundary;
- Share with Friends using the accepted Click Proof verification boundary.

No concrete internal Phase 3 implementation gap remains.

## Phase 4 — Squad

🟡 **Implementation in progress from the locked contract.**

Authoritative documents:
- `docs/SQUAD_SYSTEM_CONTRACT.md`
- `docs/ADR-0012-SQUAD.md`
- `docs/PHASE4_SQUAD.md`

Implemented and merged slices include system-created Squads, membership invitation/acceptance, paid membership, Daily Squad State, Daily DZP Contribution + Modifier, and Weekly Challenge accounting/settlement with the canonical Economy rounding correction.

Phase 4 is **not closed**. The locked contract requires App Ban to be able to terminate a Squad membership, but the current repository has no authoritative App-Ban/Admin membership-termination boundary. Architecture rules prohibit inventing a later-phase Admin runtime boundary early. This remains a phase-boundary dependency.

## Phase 5 — Gaming

🟡 **AUTHORIZED / NOT IMPLEMENTED.**

The product decision is final for the current roadmap: **Phase 5 is Gaming. Reward Pool is removed from the product scope and is not assigned another phase.**

Canonical contract:
- `docs/PHASE5_GAMING.md`
- `PROJECT_ROADMAP.md` Phase 5 section

The Gaming contract defines Spin, Digging, separate resources, Energy, server-persisted Digging boards, Gaming Ads, Task-issued resources, versioned configuration, audit/idempotency, modern semantic/mobile-first UI, and the required 1,000-user × 30-day economic simulation before final reward weights are locked.

No Gaming runtime route, service, migration or duplicate Economy/Ledger/Reward/Verification system has been introduced by this documentation milestone. Implementation must begin only through a focused TDD vertical slice derived from the Phase 5 contract and existing domain boundaries.

## Later phases

- Phase 6 — Packages: not started.
- Phase 7 — Buying Points & Conversion UI: existing merged conversion-flow code is present in `main`; this does **not** imply the entire later-phase product contract is complete.
- Phase 8 — Deposit: audited implementation milestone exists; production acceptance remains separately gated.
- Phase 9 — Withdrawal: not started as a complete product phase.
- Phase 10 — Promo Codes: not started as a complete product phase.
- Phase 11 — User App UI: partial UI exists through merged milestones; full roadmap phase is not marked complete.
- Phase 12 — Admin Panel: not started as a complete product phase.
- Phase 13 — Ledger/Security hardening: ongoing baseline controls exist; final hardening remains gated.
- Phase 14 — Testing/Release: not complete.

## Issue / PR interpretation

- Open Issues are not automatically unimplemented features.
- Work already present in merged `main` must be reconciled rather than reimplemented.
- Issue #134 remains the Phase 2 evidence/provider gate for future external-provider integrations; it is not a request to create placeholder verifiers.
- Historical Reward Pool PRs/commits are evidence of prior work and revert history only; they are not current product scope.

## Next authorized work

1. Continue Phase 4 only from its locked Squad contract and its concrete authorized gap.
2. In parallel, Phase 5 Gaming may be implemented through a dedicated vertical slice once the implementation branch is opened; do not invent a parallel domain service for an existing primitive.
3. Before every change, run the Constitution 54 pre-change audit: Code → Git history → PRs → CI → Commits → Tracing → Tests → Documentation → Issues → Runtime failure history.
4. Reuse the existing Task, Verification, Advertisement, Activity and Economy/Ledger boundaries.
5. Do not resurrect Reward Pool runtime code, roadmap scope, configuration, tables or services.
6. Do not implement speculative provider integrations or a speculative Admin/App-Ban boundary.
7. Finalize Gaming reward weights only after the required economic simulation.

## Update Rule

After every validated milestone, update this file with:
1. What was implemented.
2. What was actually tested.
3. Commit/reference used.
4. Remaining limitations.

Never mark unvalidated work as completed.