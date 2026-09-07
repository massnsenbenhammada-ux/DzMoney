# DzMoney — Implementation Status

> **Authoritative baseline:** `main` after the merged Phase 4 implementation milestones through PR #207, with later merged changes reconciled separately. This document is maintained through the normal branch → PR → CI → review → merge workflow. Open Issues/PRs are not proof of missing implementation; status is determined from merged code, tests, CI evidence, and governing documents.

## Current state

- **Current phase:** Phase 5 — Gaming is **closed / complete** for the currently defined contract after exact-head CI, final diff review, and post-merge runtime verification.
- **Reward Pool:** **REMOVED FROM PRODUCT SCOPE.** Historical Reward Pool PRs/commits remain Git history only. No Reward Pool runtime, roadmap phase, or replacement phase is authorized.
- **Phase 2 code scope:** 🟢 **CLOSED / COMPLETE** for the currently defined and implemented contracts.
- **External provider dependencies:** 🟡 **PENDING_PROVIDER** for Special/Partner integrations and any future provider-specific evidence not yet supplied.
- **Phase 3:** 🟢 **CLOSED / COMPLETE** for the accepted Referral contract.
- **Phase 4:** 🟢 **CLOSED** for the locked Squad implementation currently authorized. The later Admin Panel owns the App-Ban warning/review/enforcement control surface.
- **Phase 5:** 🟢 **CLOSED / COMPLETE** for the locked Gaming contract. Exact-head CI passed, the final diff was reviewed, and production runtime verification passed without upstream errors on the deployed application commit. The later CI-only security fix does not alter runtime code.
- **Phase 7:** 🟢 **CLOSED / COMPLETE** for the currently defined Buying Points & Conversion contract. Merged PRs #213, #214 and #215 provide the authenticated conversion boundary, native conversion UI, live preview, idempotency, explicit success/failure lifecycle, balance refresh and reusable conversion flow. Exact conversion-boundary regression coverage is registered in `test:all`. TON buying reuses the canonical Phase 8 Deposit boundary rather than creating a second payment system.
- **Latest audited TON/Deposit milestone:** PR #148.
- **Latest Tasks UI/scope milestone:** PR #204.
- **Latest Squad contract lock:** PR #190.
- **Latest merged Squad implementation milestone:** PR #207.
- **Latest merged main conversion-flow change:** PR #215.
- **Latest repository governance milestone:** PR #257, adding the dependency audit/CodeQL baseline with the npm-cache CI correction.

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

🟢 **Closed for the locked Squad implementation currently authorized.**

Authoritative documents:
- `docs/SQUAD_SYSTEM_CONTRACT.md`
- `docs/ADR-0012-SQUAD.md`
- `docs/PHASE4_SQUAD.md`

Implemented and merged slices include system-created Squads, membership invitation/acceptance, paid membership, Daily Squad State, Daily DZP Contribution + Modifier, and Weekly Challenge accounting/settlement with the canonical Economy rounding correction.

The remaining App-Ban control surface is intentionally not a Phase 4 runtime boundary. App Ban is an administrative enforcement action: the system may generate a warning with evidence, an authorized Admin reviews it, and the Admin explicitly chooses whether to suspend/ban. No automatic ban is permitted. The later Admin Panel phase owns that control surface, while the existing Squad membership model already represents `suspended` and `cancelled` states and Challenge settlement respects membership eligibility.

## Phase 5 — Gaming

🟢 **CLOSED / COMPLETE.**

The product decision is final for the current roadmap: **Phase 5 is Gaming. Reward Pool is removed from the product scope and is not assigned another phase.**

Canonical contract:
- `docs/PHASE5_GAMING.md`
- `PROJECT_ROADMAP.md` Phase 5 section

Validated implementation:
- persistent Spin and Digging resources;
- server-side Spin rolls and idempotent results;
- persistent server-generated Digging boards;
- UTC+1 Energy reset and three daily reveals;
- independent Gaming ad contexts/progress using the existing Advertisement provider registry;
- Monetag and OnClickA Gaming postback finalization;
- verified Task → Gaming resource issuance inside the existing Task Verification transaction;
- versioned Gaming configuration snapshots;
- existing Economy/Ledger for all economic rewards;
- locking/idempotency for resource and reward mutations;
- native mobile Gaming Home/Spin/Digging UI;
- required 1,000-user × 30-day economic simulation and tuned version-1 Spin weights;
- provider rotation hardening and provider-specific failure diagnostics;
- bounded SDK settlement for GigaPub and OnClickA to prevent indefinite Gaming WATCH AD hangs;
- Gaming hidden-outcome redaction and provider correlation protections.

Simulation result: average 1,023.665 DZX-equivalent Gaming economic cost per user over 30 days, below the 1,200 DZX-equivalent guardrail. The deterministic 1,000-user run observed a 708.3–1,565.7 DZX-equivalent per-user range and jackpot frequency below 1%.

Validation evidence:
- Phase 5 implementation and subsequent runtime corrections were merged through the existing PR workflow.
- Exact-head Phase 2 boundary CI passed on the final Gaming implementation lineage, including migrations, Gaming invariants/economic simulation, provider contracts, TON boundaries, isolated runtime health and the full test suite.
- Security CI passed after PR #257 corrected the repository's npm-cache mismatch; CodeQL and dependency audit are green.
- Production deployment on Railway is healthy. The latest successful application deployment is running from `main`; the later PR #257 change is CI-only and correctly did not trigger a runtime redeploy.
- Production runtime logs show successful migration startup and `DzMoney migrations: OK`, followed by HTTP 200/304 responses for `/`, `/health`, `/api/me`, `/api/gaming`, `/api/tasks`, `/api/squad`, `/api/squad/daily-state`, `/api/squad/ads`, `/api/daily-checkin/status`, and the Gaming frontend assets, with no upstream errors in the verified window.

No Gaming implementation gap remains inside the current Phase 5 contract.

## Phase 7 — Buying Points & Conversion UI

🟢 **CLOSED / COMPLETE for the currently defined contract.**

Implemented and merged through PRs #213, #214 and #215:
- authenticated `COIN → DZP` conversion;
- authenticated `DZX → DZP` conversion;
- server-side conversion-rate exposure from `admin_settings`;
- operation-scoped idempotency keys;
- reuse of the existing Economy/Ledger conversion primitives and Wallet identity boundary;
- converted DZP credited as `converted_dzp`, separate from earned activity;
- existing Wallet/Home conversion UI;
- native mobile conversion dialog;
- live whole-DZP conversion preview using exact integer arithmetic;
- explicit success and failure outcome states;
- balance refresh before success display;
- form reset for the next conversion.

The TON buying requirement is satisfied by reuse of the canonical Phase 8 Deposit boundary. Phase 7 does not create a second payment or purchase system.

Validation evidence:
- `scripts/test-phase7-conversion-boundary.js` covers locked rates, allowed conversion directions, native dialog, live preview, integer-unit validation, success/failure states, balance refresh and idempotency.
- `test:phase7-conversion` is registered in `test:all`.
- PR #213 established the canonical Phase 7 API/UI boundary.
- PR #214 completed the conversion UI refinement and preview contract.
- PR #215 completed the success/failure result lifecycle and reusable conversion flow.
- All three Phase 7 PRs were merged into `main`; the final Phase 7 lineage is represented by merge commit `fe8d992535a5c375727316dae90f8659218f48ab`.

No concrete implementation gap remains inside the currently defined Phase 7 contract.

## Later phases

- Phase 6 — Packages: **DEFERRED by product decision; do not open or implement until explicitly authorized.**
- Phase 8 — Deposit: audited implementation milestone exists; production acceptance remains separately gated.
- Phase 9 — Withdrawal: not started as a complete product phase.
- Phase 10 — Promo Codes: not started as a complete product phase.
- Phase 11 — User App UI: partial UI exists through merged milestones; full roadmap phase is not marked complete.
- Phase 12 — Admin Panel: not started as a complete product phase; it will own the App-Ban warning/review/enforcement control surface.
- Phase 13 — Ledger/Security hardening: baseline controls exist and the repository dependency/CodeQL baseline is now active; final hardening remains a later-phase concern.
- Phase 14 — Testing/Release: not complete.

## Issue / PR interpretation

- Open Issues are not automatically unimplemented features.
- Work already present in merged `main` must be reconciled rather than reimplemented.
- Issue #134 remains the Phase 2 evidence/provider gate for future external-provider integrations; it is not a request to create placeholder verifiers.
- Historical Reward Pool PRs/commits are evidence of prior work and revert history only; they are not current product scope.
- Phase 7 is considered complete based on the merged implementation, contract-specific tests, and PR history; no new Phase 7 implementation should be created merely to make the status document say complete.

## Next authorized work

1. Phase 4 Squad implementation is closed; do not invent an early Admin/App-Ban runtime boundary.
2. Phase 5 Gaming is closed for its current contract; do not reopen or refactor it without a proven regression, security defect, or explicit contract change.
3. Phase 7 Buying Points & Conversion UI is closed for its current contract; do not reopen it without a proven regression, security defect, or explicit contract change.
4. Phase 6 Packages remains **DEFERRED** and is not an authorized implementation target until explicitly reopened.
5. Before every future change, run the Constitution 54 pre-change audit: Code → Git history → PRs → CI → Commits → Tracing → Tests → Documentation → Issues → Runtime failure history.
6. Reuse the existing Task, Verification, Advertisement, Activity and Economy/Ledger boundaries.
7. Do not resurrect Reward Pool runtime code, roadmap scope, configuration, tables or services.
8. Do not implement speculative provider integrations or a speculative Admin/App-Ban boundary.
9. Finalize future economic behavior only through versioned configuration changes supported by repeatable simulation where the governing contract requires it.

## Update Rule

After every validated milestone, update this file with:
1. What was implemented.
2. What was actually tested.
3. Commit/reference used.
4. Remaining limitations.

Never mark unvalidated work as completed.
