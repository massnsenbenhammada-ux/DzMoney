# DzMoney — Implementation Status

> **Authoritative baseline:** `main` after the merged Phase 4 implementation milestones through PR #207, with later merged changes reconciled separately. This document is maintained through the normal branch → PR → CI → review → merge workflow. Open Issues/PRs are not proof of missing implementation; status is determined from merged code, tests, CI evidence, and governing documents.

## Current state

- **Current phase:** Phase 11 — User App UI is **closed / complete for the currently implemented UI contract** after PR #263 merge, CI validation, successful Railway deployment, and post-deployment HTTP/runtime verification.
- **Reward Pool:** **REMOVED FROM PRODUCT SCOPE.** Historical Reward Pool PRs/commits remain Git history only. No Reward Pool runtime, roadmap phase, or replacement phase is authorized.
- **Phase 2 code scope:** 🟢 **CLOSED / COMPLETE** for the currently defined and implemented contracts.
- **External provider dependencies:** 🟡 **PENDING_PROVIDER** for Special/Partner integrations and any future provider-specific evidence not yet supplied.
- **Phase 3:** 🟢 **CLOSED / COMPLETE** for the accepted Referral contract.
- **Phase 4:** 🟢 **CLOSED** for the locked Squad implementation currently authorized. The later Admin Panel owns the App-Ban warning/review/enforcement control surface.
- **Phase 5:** 🟢 **CLOSED / COMPLETE** for the locked Gaming contract. Exact-head CI passed, the final diff was reviewed, and production runtime verification passed without upstream errors on the deployed application commit. The later CI-only security fix does not alter runtime code.
- **Phase 6:** ⏸️ **DEFERRED**. Packages remain unopened; no package purchasing UI/backend activation is authorized.
- **Phase 7:** 🟢 Existing conversion-flow implementation is present in `main`; full later-phase contract status remains governed by its own validation evidence.
- **Phase 8:** 🟡 Audited implementation milestone exists; production acceptance remains separately gated.
- **Phase 9:** 🟡 Not complete as a full product phase.
- **Phase 10:** 🟢 Backend Promo Code implementation is merged; Admin operational UI remains owned by the later Admin Panel scope.
- **Phase 11:** 🟢 **CLOSED / COMPLETE for the current UI contract.** PR #263 is merged at commit `6bbef07517992041ce894a90a3b1ed0e919ef3b8`.
- **Phase 12:** 🔵 Not started; next active product target after Phase 11, subject to its own Constitution 54 pre-change audit.
- **Latest audited TON/Deposit milestone:** PR #148.
- **Latest Tasks UI/scope milestone:** PR #204.
- **Latest Squad contract lock:** PR #190.
- **Latest merged Squad implementation milestone:** PR #207.
- **Latest merged main conversion-flow change:** PR #215. Its presence does not mean all later-phase product scope is complete; status follows validated phase contracts.
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

## Phase 6 — Packages

⏸️ **DEFERRED / NOT STARTED.**

Packages remain unopened by explicit product scope. No package purchasing UI, package pricing, package activation, or package backend behavior is authorized until the phase is deliberately reopened and audited.

## Phase 7 — Buying Points & Conversion UI

🟢 Existing merged conversion-flow code is present in `main`; the presence of that code does not imply every later-phase economic acceptance criterion is complete.

## Phase 8 — Deposit

🟡 Audited implementation milestone exists; production acceptance remains separately gated.

## Phase 9 — Withdrawal

🟡 Not started as a complete product phase.

## Phase 10 — Promo Codes

🟢 Backend Promo Code implementation is merged and validated. Admin operational UI remains part of the later Admin Panel scope.

## Phase 11 — User App UI

🟢 **CLOSED / COMPLETE for the currently defined UI contract.**

Implemented in PR #263 (`feat(ui): complete Phase 11 user app surfaces), merged into `main` at commit `6bbef07517992041ce894a90a3b1ed0e919ef3b8`.

Validated scope:
- Home Squad/Gaming status surfaces and Daily Activity;
- package placeholder only, with Packages still deferred;
- Coming Soon surface without speculative backend behavior;
- independent RTL right-side User Drawer;
- existing `.profile-sheet` implementation preserved rather than rewritten;
- conversion semantics warning that converted/purchased/transferred DZP is not earned activity;
- Squad hierarchy / daily activity / next-day activation / anti-manipulation explanation;
- existing Gaming order preserved as Game → Gaming Ads → Tasks;
- non-ad task action copy aligned to Execute → Verify without changing the existing execution/verification flow;
- Phase 11 static UI contract tests integrated into the frontend test command.

Architecture validation:
- no new Economy, Ledger, Task, Verification, Advertisement, Squad, Gaming, Promo, or backend source of truth;
- no package purchasing behavior activated;
- no unrelated backend business-rule changes;
- no silent product/navigation decision on the existing five-item Bottom Nav conflict; the current Home / Tasks / Squad / Friends / Wallet navigation remains unchanged.

CI/deployment evidence:
- PR #263 merged with the existing repository CI gates passing.
- Railway deployment `b15be93d-5757-48a2-aa6b-6645f930bd86` completed successfully from the merged `main` lineage.
- Post-deployment logs show `DzMoney migrations: OK` and `DzMoney 2.0 listening on 8080`.
- Production served `/`, `/health`, `/api/me`, `/api/squad`, `/api/gaming`, and all Phase 11 frontend assets successfully with HTTP 200/304 responses and no proxy upstream errors.
- The two observed Monetag postback HTTP 404 responses were correlated with postback requests whose advertisement event was not found; the application logs show the postback boundary was reached and received provider payloads. This is the route's intentional `Advertisement event not found` response, not a deployment/startup failure.
- The existing Railway build warning about the absent `package-lock.json` and npm's `--omit=dev` wording are non-blocking hygiene warnings; the deployment itself completed successfully and npm reported zero package vulnerabilities during install.

Remaining limitation:
- The visual UI has been runtime-served and HTTP-validated, but pixel-level/manual Telegram-client visual acceptance is not replaced by these server-side checks. Any later visual correction must remain within the existing Phase 11 contract and undergo the same pre-change audit.

## Phase 12 — Admin Panel

🔵 **Not started.**

Phase 12 owns the administrative control surface, including the Squad App-Ban warning/review/enforcement workflow. No automatic ban boundary is authorized. Any implementation must first pass the Constitution 54 pre-change audit and reuse existing backend sources of truth.

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

1. Phase 11 User App UI is closed for its current contract; do not reopen or redesign it without a proven regression, accessibility defect, security issue, or explicit contract change.
2. **Phase 6 Packages remains explicitly deferred.** Do not open package purchasing behavior merely because it appears earlier in the historical implementation order.
3. The next active product target is **Phase 12 — Admin Panel**, subject to its own Constitution 54 pre-change audit and reconciliation of any already-merged administrative code.
4. Before every change, run the Constitution 54 pre-change audit: Code → Git history → PRs → CI → Commits → Tracing → Tests → Documentation → Issues → Runtime failure history.
5. Reuse the existing Task, Verification, Advertisement, Activity and Economy/Ledger boundaries.
6. Do not resurrect Reward Pool runtime code, roadmap scope, configuration, tables or services.
7. Do not implement speculative provider integrations or automatic App-Ban behavior.
8. Finalize future economic behavior only through versioned configuration changes supported by repeatable simulation where the governing contract requires it.

## Update Rule

After every validated milestone, update this file with:
1. What was implemented.
2. What was actually tested.
3. Commit/reference used.
4. Remaining limitations.

Never mark unvalidated work as completed.
