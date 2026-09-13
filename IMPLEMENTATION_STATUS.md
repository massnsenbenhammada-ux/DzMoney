# DzMoney — Implementation Status

> **Authoritative baseline:** `main` after the merged Phase 4 implementation milestones through PR #207, with later merged changes reconciled separately. This document is maintained through the normal branch → PR → CI → review → merge workflow. Open Issues/PRs are not proof of missing implementation; status is determined from merged code, tests, CI evidence, and governing documents.

## Current state

- **Current phase:** Phase 13 — Ledger/Security hardening is **implemented / validated for the current ledger-integrity contract** after PR #280, exact-head CI validation, and successful Railway deployment.
- **Reward Pool:** **REMOVED FROM PRODUCT SCOPE.** Historical Reward Pool PRs/commits remain Git history only. No Reward Pool runtime, roadmap phase, or replacement phase is authorized.
- **Phase 2 code scope:** 🟢 **CLOSED / COMPLETE** for the currently defined and implemented contracts.
- **External provider dependencies:** 🟡 **PENDING_PROVIDER** for Special/Partner integrations and any future provider-specific evidence not yet supplied.
- **Phase 3:** 🟢 **CLOSED / COMPLETE** for the accepted Referral contract.
- **Phase 4:** 🟡 **IN PROGRESS** at the Project Phase level. Squad internal Phase 4 — Paid Purchase + Tier-1 Waiting / Option B is closed; internal Squad Phases 5–10 remain independently gated inside Project Phase 4.
- **Phase 5:** 🟢 **CLOSED / COMPLETE** for the locked Gaming contract.
- **Phase 6:** ⏸️ **DEFERRED**. Packages remain unopened; no package purchasing UI/backend activation is authorized.
- **Phase 7:** 🟢 Existing conversion-flow implementation is present in `main`; full later-phase contract status remains governed by its own validation evidence.
- **Phase 8:** 🟡 Audited implementation milestone exists; production acceptance remains separately gated.
- **Phase 9:** 🟡 Not complete as a full product phase.
- **Phase 10:** 🟢 Backend Promo Code implementation is merged; Admin operational UI is now covered by the later Admin Panel lineage.
- **Phase 11:** 🟢 **CLOSED / COMPLETE for the current UI contract.** PR #263 is merged at commit `6bbef07517992041ce894a90a3b1ed0e919ef3b8`.
- **Phase 12:** 🟢 **IMPLEMENTED / OPERATIONAL for the currently validated administrative contract.** PR #278 is merged at `f35ab969e4e8f981080a192b2116f8edc379ac62`.
- **Phase 13:** 🟢 **CLOSED / COMPLETE for the current ledger-integrity hardening contract.** PR #280 is merged at `24d22c083f2982901ab978ad3483032528c58aee` after exact-head CI validation.

## Phase 0 — Specification Lock

🟢 Completed.

## Phase 1 — Economy & Currency Core

🟢 Runtime verified and signed off.

## Phase 2 — Activity / Ads / Tasks

🟢 **Code scope closed.** All currently defined Phase 2 contracts that have an implemented evidence source are implemented and validated. External-provider-dependent integrations remain explicitly `PENDING_PROVIDER`.

## Phase 3 — Referral

🟢 **Closed / Complete for the accepted Referral contract.**

## Phase 4 — Squad

🟡 **IN PROGRESS at the Project Phase level.**

Project Phase 4 is the product-level **Hierarchical Squad System** milestone. The locked Squad redesign also contains internal Squad Phases 0–10. These internal phase numbers must not be conflated with the product-level roadmap phases.

### Squad internal Phase 4 — Paid Purchase + Tier-1 Waiting / Option B

🟢 **CLOSED / COMPLETE.**

PR #355 established and validated the locked Option B scope. Its exact-head CI and Economy/Ledger reconciliation passed.

### Remaining Squad internal gates

- **Internal Phase 5 — Persistent Interest Requests**
- **Internal Phase 6 — Switch and Upgrade Semantic Gate**
- **Internal Phase 7 — Modifier/Economy decision and implementation gate**
- **Internal Phase 8 — Squad UX Contract (Design Only)**
- **Internal Phase 9 — Squad UI Implementation Gate**
- **Internal Phase 10 — Investigation and Validation Gate**

These internal phases remain **NOT CLOSED** until independently audited and accepted. Completion of Squad internal Phase 4 does not close Project Phase 4 and does not authorize skipping to Project Phase 5 work.

## Phase 5 — Gaming

🟢 **CLOSED / COMPLETE** for the separately defined product-level Gaming contract. This status is independent of the remaining Squad internal phases inside Project Phase 4.

## Phase 6 — Packages

⏸️ **DEFERRED / NOT STARTED.**

## Phase 7 — Buying Points & Conversion UI

🟢 Existing merged conversion-flow code is present in `main`; full later-phase acceptance remains governed by its own evidence.

## Phase 8 — Deposit

🟡 Audited implementation milestone exists; production acceptance remains separately gated.

## Phase 9 — Withdrawal

🟡 Not started as a complete product phase.

## Phase 10 — Promo Codes

🟢 Backend Promo Code implementation is merged and validated.

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

## Next authorized work

1. Project Phase 4 — Squad remains open until its remaining internal Squad gates are independently accepted.
2. Squad internal Phase 5 is the next authorized Squad slice; do not jump to Project Phase 5 Gaming merely because internal Phase 4 is complete.
3. Phase 6 Packages remains explicitly deferred.
4. Before every change, run the Constitution 54 pre-change audit.
5. Reuse the existing Task, Verification, Advertisement, Activity and Economy/Ledger boundaries.
6. Do not resurrect Reward Pool runtime code, roadmap scope, configuration, tables or services.
7. Never mark unvalidated work as completed.
