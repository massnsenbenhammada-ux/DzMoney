# DzMoney — Implementation Status

> **Authoritative baseline:** `main` after the merged Phase 4 implementation milestones through PR #355, with later merged changes reconciled separately. This document is maintained through the normal branch → PR → CI → review → merge workflow. Open Issues/PRs are not proof of missing implementation; status is determined from merged code, tests, CI evidence, and governing documents.

## Current state

- **Current phase:** Project Phase 4 — Hierarchical Squad System is **IN PROGRESS**. The currently validated Squad internal Phase 4 slice is complete, but the Squad contract continues through internal Phases 5–10.
- **Reward Pool:** **REMOVED FROM PRODUCT SCOPE.** Historical Reward Pool PRs/commits remain Git history only. No Reward Pool runtime, roadmap phase, or replacement phase is authorized.
- **Phase 2 code scope:** 🟢 **CLOSED / COMPLETE** for the currently defined and implemented contracts.
- **External provider dependencies:** 🟡 **PENDING_PROVIDER** for Special/Partner integrations and any future provider-specific evidence not yet supplied.
- **Phase 3:** 🟢 **CLOSED / COMPLETE** for the accepted Referral contract.
- **Project Phase 4 — Squad:** 🟡 **IN PROGRESS**. Squad internal Phase 4 is closed; internal Phases 5–10 remain independently gated inside Project Phase 4.
- **Project Phase 5 — Gaming:** 🟢 **CLOSED / COMPLETE** for its separately validated product contract. Its status does not authorize skipping the remaining Squad internal gates within Project Phase 4.
- **Phase 6:** ⏸️ **DEFERRED**. Packages remain unopened; no package purchasing UI/backend activation is authorized.
- **Phase 7:** 🟢 Existing conversion-flow implementation is present in `main`; full later-phase contract status remains governed by its own validation evidence.
- **Phase 8:** 🟡 Audited implementation milestone exists; production acceptance remains separately gated.
- **Phase 9:** 🟡 Not complete as a full product phase.
- **Phase 10:** 🟢 Backend Promo Code implementation is merged; Admin operational UI is now covered by the later Admin Panel lineage.
- **Phase 11:** 🟢 **CLOSED / COMPLETE for the current UI contract.** PR #263 is merged at commit `6bbef07517992041ce894a90a3b1ed0e919ef3b8`.
- **Phase 12:** 🟢 **IMPLEMENTED / OPERATIONAL for the currently validated administrative contract.** PR #278 is merged at `f35ab969e4e8f981080a192b2116f8edc379ac62`.
- **Phase 13:** 🟢 **CLOSED / COMPLETE for the current ledger-integrity hardening contract.** PR #280 is merged at `24d22c083f2982901ab978ad3483032528c58aee` after exact-head CI validation. Railway deployment `fd21466c-2253-4d52-a6bf-4a8146ff39df` is successful from that merge commit.
- **Latest validated Squad internal Phase 4 implementation:** PR #355, merge commit `a5956497c3fb7cc13225a8b767d0e51de5d71f63`.

## Phase 0 — Specification Lock

🟢 Completed.

Economic and architectural rules remain those defined by the roadmap, architecture rules, ADRs, Constitution 54, and phase-specific contracts.

## Phase 1 — Economy & Currency Core

🟢 Runtime verified and signed off.

## Phase 2 — Activity / Ads / Tasks

🟢 **Code scope closed.** All currently defined Phase 2 contracts that have an implemented evidence source are implemented and validated. External-provider-dependent integrations remain explicitly `PENDING_PROVIDER`.

## Phase 3 — Referral

🟢 **Closed / Complete for the accepted Referral contract.**

## Phase 4 — Squad

🟡 **IN PROGRESS at the Project Phase level.**

Project Phase 4 is the product-level **Hierarchical Squad System** milestone. It contains the internal Squad phase sequence defined by the governing Squad contract. The internal phase numbers must not be conflated with the product-level roadmap phases.

### Squad internal Phase 4 — Paid Purchase + Tier-1 Waiting / Option B

🟢 **CLOSED / COMPLETE.**

PR #355 established and validated the locked Option B scope:
- eligible existing Squad first;
- pending only as fallback;
- T1 may pair the first two pending requests to form exactly one Squad, with earliest request as Owner;
- T2–T10 never pair pending requests and never create a Squad from pending requests;
- pending creation is zero-charge until actual settlement;
- Economy/Ledger reconciliation passed with no negative wallets or ledger mismatches.

Exact-head CI for the validated PR #355 implementation passed the repository's relevant validation workflows.

### Remaining Squad internal gates

The Squad contract continues after internal Phase 4:

- **Internal Phase 5 — Persistent Interest Requests**
- **Internal Phase 6 — Switch and Upgrade Semantic Gate**
- **Internal Phase 7 — Modifier/Economy decision and implementation gate**
- **Internal Phase 8 — Squad UX Contract (Design Only)**
- **Internal Phase 9 — Squad UI Implementation Gate**
- **Internal Phase 10 — Investigation and Validation Gate**

These internal phases remain **NOT CLOSED** until each is independently audited and accepted through implementation, tests, schema/migrations, callers, CI, documentation, and runtime evidence where applicable.

**Phase-boundary rule:** completion of Squad internal Phase 4 does not close Project Phase 4 and does not authorize skipping to Project Phase 5 work.

## Phase 5 — Gaming

🟢 **CLOSED / COMPLETE** for the separately defined product-level Gaming contract. This product-level status is independent of the remaining Squad internal phases inside Project Phase 4.

## Phase 6 — Packages

⏸️ **DEFERRED / NOT STARTED.**

Packages remain unopened by explicit product scope.

## Phase 7 — Buying Points & Conversion UI

🟢 Existing merged conversion-flow code is present in `main`; the presence of that code does not imply every later-phase economic acceptance criterion is complete.

## Phase 8 — Deposit

🟡 Audited implementation milestone exists; production acceptance remains separately gated.

## Phase 9 — Withdrawal

🟡 Not started as a complete product phase.

## Phase 10 — Promo Codes

🟢 Backend Promo Code implementation is merged and validated. Admin operational UI is covered by the later Admin Panel scope.

## Phase 11 — User App UI

🟢 **CLOSED / COMPLETE for the current UI contract.**

## Phase 12 — Admin Panel

🟢 **IMPLEMENTED / OPERATIONAL for the currently validated administrative contract.**

## Phase 13 — Ledger/Security hardening

🟢 **CLOSED / COMPLETE for the current ledger-integrity hardening contract.**

## Phase 14 — Testing/Release

🟡 Not complete.

## Issue / PR interpretation

- Open Issues are not automatically unimplemented features.
- Work already present in merged `main` must be reconciled rather than reimplemented.
- Historical Reward Pool PRs/commits are evidence of prior work and revert history only; they are not current product scope.

## Update Rule

After every validated milestone, update this file with:
1. What was implemented.
2. What was actually tested.
3. Commit/reference used.
4. Remaining limitations.

Never mark unvalidated work as completed.
