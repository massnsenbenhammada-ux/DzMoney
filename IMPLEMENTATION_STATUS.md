# DzMoney — Implementation Status

> **Authoritative baseline:** `main` after the merged Phase 4 implementation milestones through PR #207, with later merged changes reconciled separately. This document is maintained through the normal branch → PR → CI → review → merge workflow. Open Issues/PRs are not proof of missing implementation; status is determined from merged code, tests, CI evidence, and governing documents.

## Current state

- **Current phase:** Phase 12 — Admin Panel is **implemented / operational for the validated current contract** after the merged Phase 12 administrative slices through PR #278, exact-head CI success, and successful Railway deployment from merge commit `f35ab969e4e8f981080a192b2116f8edc379ac62`.
- **Reward Pool:** **REMOVED FROM PRODUCT SCOPE.** Historical Reward Pool PRs/commits remain Git history only. No Reward Pool runtime, roadmap phase, or replacement phase is authorized.
- **Phase 2 code scope:** 🟢 **CLOSED / COMPLETE** for the currently defined and implemented contracts.
- **External provider dependencies:** 🟡 **PENDING_PROVIDER** for Special/Partner integrations and any future provider-specific evidence not yet supplied.
- **Phase 3:** 🟢 **CLOSED / COMPLETE** for the accepted Referral contract.
- **Phase 4:** 🟢 **CLOSED** for the locked Squad implementation currently authorized. The later Admin Panel owns the App-Ban warning/review/enforcement control surface.
- **Phase 5:** 🟢 **CLOSED / COMPLETE** for the locked Gaming contract.
- **Phase 6:** ⏸️ **DEFERRED**. Packages remain unopened; no package purchasing UI/backend activation is authorized.
- **Phase 7:** 🟢 Existing conversion-flow implementation is present in `main`; full later-phase contract status remains governed by its own validation evidence.
- **Phase 8:** 🟡 Audited implementation milestone exists; production acceptance remains separately gated.
- **Phase 9:** 🟡 Not complete as a full product phase.
- **Phase 10:** 🟢 Backend Promo Code implementation is merged; its Admin operational surface is now covered by the Phase 12 Admin Panel lineage.
- **Phase 11:** 🟢 **CLOSED / COMPLETE for the current UI contract.**
- **Phase 12:** 🟢 **IMPLEMENTED / OPERATIONAL for the currently validated Admin contract.**
- **Latest validated Phase 12 merge:** PR #278, merge commit `f35ab969e4e8f981080a192b2116f8edc379ac62`.
- **Latest successful Phase 12 Railway deployment:** `b4febab1-3212-4b42-9f37-0e99a57df4a1`, commit `f35ab969e4e8f981080a192b2116f8edc379ac62`.
- **Phase 12 remaining limitation:** no new product-control gap was found in the audited Dashboard, Telegram Admin entry, Economy, Users, Referral, Squad, Gaming, Promo, TON settings, Account Enforcement, or Creator Task/Campaign review surfaces. Manual visual acceptance inside a Telegram client remains a presentation check, not an unimplemented backend control boundary.

## Phase 12 — Admin Panel

🟢 **IMPLEMENTED / OPERATIONAL for the current validated contract.**

Validated administrative surfaces:
- Dashboard foundation and rankings;
- Telegram Admin entry;
- Economy controls using canonical `admin_settings`;
- Users search/profile and canonical Economy/Ledger balance adjustments;
- Referral controls using the existing referral settings source;
- Squad controls and challenge administration;
- Gaming Admin controls;
- Promo Admin controls;
- explicit account suspend/ban/activate enforcement using the existing membership states and Admin audit/idempotency primitives;
- Creator Task/Campaign administration with protected listing and explicit `approve` / `reject` review actions;
- existing TON/Deposit Admin configuration and blockchain evidence boundaries audited and retained without creating a second Wallet or TON control plane.

Creator Task/Campaign review specifically reuses the canonical `activity_tasks` + `task-service.js` lifecycle and existing Economy/Ledger refund/tax behavior. No new task engine, verification/reward service, campaign accounting table, pricing source, or lifecycle state was introduced.

Evidence:
- PR #278 merged after exact-head CI passed: Test Governance, Security/CodeQL, Phase 10 Promo Codes, and Phase 2 boundaries/full `test:all` all succeeded for the exact validated head.
- The first exact-head full-suite attempt failed only because the new contract test asserted `approve`/`reject` literals in the HTTP route instead of the service boundary. The test was corrected; the subsequent exact-head Phase 2/full-suite run passed.
- Railway deployment `b4febab1-3212-4b42-9f37-0e99a57df4a1` completed successfully. Build completed, the container started, and `DzMoney migrations: OK` was emitted. No deployment crash was observed.
- No new runtime failure was introduced by the Admin Task/Campaign slice. External HTTP log entries were not present in the available Railway window, so no claim of manual browser/Telegram visual acceptance is made.

## Phase 13 — Ledger/Security hardening

🟡 Baseline controls exist and the repository dependency/CodeQL baseline is active; final hardening remains a later-phase concern.

## Phase 14 — Testing/Release

🟡 Not complete.

## Issue / PR interpretation

- Open Issues are not automatically unimplemented features.
- Work already present in merged `main` must be reconciled rather than reimplemented.
- Issue #134 remains the Phase 2 evidence/provider gate for future external-provider integrations; it is not a request to create placeholder verifiers.
- Historical Reward Pool PRs/commits are evidence of prior work and revert history only; they are not current product scope.

## Next authorized work

1. Keep Phase 11 closed unless a proven regression, accessibility defect, security issue, or explicit contract change appears.
2. **Phase 6 Packages remains explicitly deferred.**
3. Phase 9 Withdrawal remains incomplete as a product phase; do not treat its incompleteness as a reason to create a second Wallet/TON subsystem inside Phase 12.
4. Phase 12 Admin Panel is operational for the current validated control contract; future Admin changes require the same Constitution 54 pre-change audit.
5. Before every change, run the Constitution 54 pre-change audit: Code → Git history → PRs → CI → Commits → Tracing → Tests → Documentation → Issues → Runtime failure history.
6. Reuse the existing Task, Verification, Advertisement, Activity and Economy/Ledger boundaries.
7. Do not resurrect Reward Pool runtime code, roadmap scope, configuration, tables or services.
8. Do not implement speculative provider integrations or automatic App-Ban behavior.
9. Finalize future economic behavior only through versioned configuration changes supported by repeatable simulation where the governing contract requires it.

## Update Rule

After every validated milestone, update this file with:
1. What was implemented.
2. What was actually tested.
3. Commit/reference used.
4. Remaining limitations.

Never mark unvalidated work as completed.

## 2026-09-07 Phase 12 Reconciliation Addendum

This addendum supersedes the earlier baseline statement that Phase 12 was "Not started". That statement predated the already-merged Phase 12 implementation lineage.

Validated current Phase 12 state is the merged PR #278 lineage described above. The historical PR sequence remains evidence of the individual administrative slices; the current source of truth is the merged `main` state plus the exact-head CI and Railway evidence recorded here.
