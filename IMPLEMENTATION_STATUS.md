# DzMoney — Implementation Status

> **Authoritative baseline:** `main` after the merged Phase 4 implementation milestones through PR #207 and the Phase 5 removal in PR #212.
>
> This document is maintained through the normal branch → PR → CI → review → merge workflow. Open Issues/PRs are not proof of missing implementation; status is determined from merged code, tests, CI evidence, and governing documents.

## Current state

- **Execution order:** Phase 5 Reward Pool and Phase 6 Packages are intentionally skipped; they are not implementation dependencies for the current work.
- **Current implementation target:** Phase 7 — Buying Points & Conversion.
- **Phase 2 code scope:** 🟢 **CLOSED / COMPLETE** for the currently defined and implemented contracts.
- **External provider dependencies:** 🟡 **PENDING_PROVIDER** for Special/Partner integrations and future provider-specific evidence not yet supplied.
- **Phase 3:** 🟢 **CLOSED / COMPLETE** for the accepted Referral contract.
- **Phase 4:** 🟡 **IMPLEMENTATION IN PROGRESS**. Squad remains blocked only at the authorized App-Ban upstream control-surface boundary.
- **Phase 7:** 🟡 **IMPLEMENTED / VALIDATION PENDING MERGE**. Authenticated COIN→DZP and DZX→DZP conversion endpoints reuse the canonical Economy/Ledger transaction boundary; Wallet/Home expose the conversion UI. TON→DZX buying reuses the already implemented Phase 8 deposit flow rather than introducing another payment system.
- **Phase 8:** 🟢 Implementation and automated validation for the audited TON Deposit milestone.
- **Phase 9:** not started.
- **Phase 10:** not started.
- **Phase 11:** existing user UI is implemented incrementally; remaining UI work is reconciled against later backend contracts rather than treated as an independent business system.
- **Phase 12:** not started as a general Admin Panel; existing TON/Squad operational admin boundaries remain scoped to their authorized contracts.

## Phase 7 — Buying Points & Conversion

### Implemented in this milestone

- Authenticated `GET /api/conversion/rates` reads the configured economy conversion rates server-side.
- Authenticated `POST /api/conversion/coin-to-dzp` executes COIN→DZP through the existing Economy/Ledger conversion primitive.
- Authenticated `POST /api/conversion/dzx-to-dzp` executes DZX→DZP through the existing Economy/Ledger conversion primitive.
- Conversion requests require idempotency keys scoped by operation.
- Converted DZP remains attributed to `converted_dzp` and therefore cannot increase earned-activity weight.
- Wallet/Home expose the conversion controls and the required warning about converted/purchased/transferred DZP.
- TON purchases are intentionally not duplicated: the already implemented TON Deposit flow is the canonical TON→DZX path.

### Validation

The focused Phase 7 boundary test is registered in `test:all`. Existing Economy/Ledger tests already exercise both conversion directions and the locked rates.

Phase 7 must not be marked closed until the PR's exact-head CI and post-merge CI pass.

## Phase 5 / Phase 6

- **Phase 5 — Reward Pool:** intentionally skipped; implementation removed in PR #212. Pre-existing roadmap/schema/provider-context definitions remain because they predate the implementation and are part of the baseline.
- **Phase 6 — Packages:** intentionally skipped; no package implementation has been introduced.

## Next authorized work

1. Validate and merge the current Phase 7 conversion milestone.
2. Continue to Phase 9 Withdrawal, reusing the existing Economy/Ledger and TON Deposit boundaries; do not create a second wallet/economic system.
3. Continue to Phase 10 Promo Codes only from the locked roadmap contract and existing verification/advertisement/economy primitives.
4. Reconcile Phase 11 user UI against actual backend capabilities rather than adding frontend-only business logic.
5. Treat Phase 12 Admin Panel as a later operational surface; existing narrow Admin endpoints do not constitute the full panel.
6. Before every change, run Constitution 54: Code → Git history → PRs → CI → Commits → Tracing → Tests → Documentation → Issues → Runtime failure history.
7. Do not implement Phase 5 or Phase 6 unless explicitly re-authorized.
8. Do not create duplicate Economy, Ledger, Activity, Advertisement, Verification or Reward systems.

## Update Rule

After every validated milestone, update this file with:
1. What was implemented.
2. What was actually tested.
3. Commit/reference used.
4. Remaining limitations.

Never mark unvalidated work as completed.
