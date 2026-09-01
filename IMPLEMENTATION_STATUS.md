# DzMoney — Implementation Status

> **Authoritative baseline:** `main` after the merged Phase 4 implementation milestones through PR #207.
>
> This document is maintained through the normal branch → PR → CI → review → merge workflow. Open Issues/PRs are not proof of missing implementation; status is determined from merged code, tests, CI evidence, and governing documents.

## Current state

- **Current phase:** Phase 4 — Squad implementation in progress from the locked contract.
- **Phase 2 code scope:** 🟢 **CLOSED / COMPLETE** for the currently defined and implemented contracts.
- **External provider dependencies:** 🟡 **PENDING_PROVIDER** for Special/Partner integrations and any future provider-specific evidence not yet supplied.
- **Phase 3:** 🟢 **CLOSED / COMPLETE** for the accepted Referral contract. Attribution, qualification, activation reward, referral achievements, canonical referral-link/bootstrap, lifetime 20% reward, and the accepted Click Proof Share with Friends contract are implemented and validated. Telegram-native attestation of an actual share is explicitly outside the accepted contract and is not a remaining DzMoney implementation gap.
- **Phase 4:** 🟡 **IMPLEMENTATION IN PROGRESS**. The authoritative Squad contract is `docs/SQUAD_SYSTEM_CONTRACT.md`, with `docs/ADR-0012-SQUAD.md` and `docs/PHASE4_SQUAD.md`.
- **Latest audited TON/Deposit milestone:** PR #148.
- **Latest Tasks UI/scope milestone:** PR #204.
- **Latest Squad contract lock:** PR #190.
- **Latest merged Squad implementation milestone:** PR #207 (canonical Economy rounding correction for Weekly Challenge settlement).

## Phase 0 — Specification Lock

🟢 Completed.

Economic and architectural rules remain those defined by the roadmap, architecture rules, ADRs, Constitution 54, and phase-specific contracts.

## Phase 1 — Economy & Currency Core

🟢 Runtime verified and signed off.

- Internal wallet currencies: COIN, DZX, DZP.
- TON is external settlement/reference, not an internal wallet currency.
- Economy/Ledger remains the single economic source of truth.
- Economy reconciliation exists.
- Activity reward decimal arithmetic preserves exact fixed-point values through the existing Economy/Ledger boundary (PR #154).

No Phase 1 refactor is authorized unless a new invariant or security defect is proven.

## Phase 2 — Activity / Ads / Tasks

🟢 **Code scope closed.** All currently defined Phase 2 contracts that have an implemented evidence source are implemented and validated. External-provider-dependent integrations remain explicitly `PENDING_PROVIDER`; this is an external dependency, not an outstanding DzMoney code defect.

### Implemented and merged

- `activity_tasks`, task attempts, verification gates and Daily Check-in state.
- Non-ad Task Execute → Verify flow.
- Server-authoritative task verification boundary.
- Verification-ad gate before trusted task verification.
- Provider-neutral advertisement registry and trusted provider ingress.
- Tasks-page advertisement direct-ad → reward flow through existing Advertisement/Economy/Ledger boundaries.
- Daily Check-in with backend rolling 24-hour cooldown and advertisement gate.
- Daily `Check for Update` with UTC+1 calendar-day eligibility and Telegram membership verification.
- Daily `View Ads` with UTC+1 calendar-day eligibility and the existing trusted task-ad flow.
- Daily system-task contract for rolling 24-hour versus UTC+1 calendar-day policies and permanent referral achievement thresholds.
- Telegram-channel server verification through the existing Task Verification boundary.
- User Create Tasks runtime UI and authenticated HTTP boundary for Game/Social/Web.
- Creator/Admin target, pricing, review/rejection and Economy/Ledger debit/refund boundaries.
- Provider-neutral trusted-evidence configuration seam; configuration is not provider proof.
- Server-side rejection of provider credentials/secrets in task configuration.
- Existing Monetag and OnClickA advertisement-provider evidence boundaries.
- Exact fixed-point decimal activity reward calculation through the existing Economy/Ledger path.
- TaskCard full-width/centered presentation and regression coverage (PR #186).
- Normal task catalog excludes Creator campaign rows; Creator campaigns remain on their dedicated boundary (PR #186).
- Creator UI scope is restricted to Creator/Tasks mode without changing Daily/Watch/Verification flows (PR #185 predecessor milestone).

### Trusted evidence status

🟢 **Proven:** Telegram Channel Membership through the existing `telegram-channel-verifier.js` and Telegram Bot API `getChatMember` using authenticated Telegram identity.

🟢 **Proven as advertisement-provider evidence:** Monetag and OnClickA postback contracts. These are not generic proof of arbitrary task completion.

🟢 **Share with Friends:** the canonical referral-link/bootstrap and existing Click Proof verification contract are implemented. The system does **not** claim Telegram attestation that a share actually occurred; Click Proof remains the explicitly defined evidence model.

🟢 **Creator contracts currently implemented:** Game (`click_proof` / `url_format_match`), Social (`click_proof` / `bot_api`), and Web (`click_proof`) within the existing verification boundary.

🟡 **PENDING_PROVIDER — no DzMoney code defect:**

- Special/Partner completion requiring a real partner backend/API/HMAC/Webhook evidence source.
- Future Game/Mini App completion requiring a provider-owned trusted backend contract beyond the currently implemented Creator methods.
- Future non-Telegram social completion requiring an authoritative provider event/API.
- Future Web completion requiring a signed S2S webhook or authenticated server-bound single-use token.

Generic `SERVER_VERIFIED_CONTRACTS` entries are contracts/placeholders, not evidence that a provider exists or is enabled.

### Phase 2 acceptance

The **DzMoney implementation scope is closed** for the currently defined contracts. Runtime health, full test suite, migration/security checks, and Economy reconciliation have passed on the validated `main` CI gate.

Remaining work is external-provider dependent and therefore tracked as `PENDING_PROVIDER`, not as an unimplemented internal service.

## Phase 3 — Referral

🟢 **Closed / Complete for the accepted Referral contract.**

Implemented and validated:

- attribution;
- server-side qualification;
- activation reward;
- qualified referral count;
- permanent referral achievement tasks;
- canonical immutable referral codes on `users.referral_code`;
- Telegram Mini App start-parameter bootstrap;
- canonical Telegram referral link exposed by `/api/me`;
- lifetime 20% reward from qualifying base COIN/DZX activity through the existing Economy/Ledger boundary;
- Share with Friends flow using the canonical referral link and existing Click Proof verification boundary.

**Issue #106 — canonical referral-link/bootstrap contract: RESOLVED.** Existing merged PRs #108 and #109 provide the required contract; no new referral service/table/migration is required.

**Issue #99 — Daily system tasks and referral achievements: RESOLVED against merged implementation.** Share with Friends is implemented under the locked Click Proof contract; no Telegram-native share attestation is claimed or required by the accepted contract.

**Acceptance basis:** PRs #94/#95 established attribution and qualification, PR #96 established the activation reward, the merged lifetime reward implementation established the 20% base-activity rule, and PRs #108/#109 established the canonical referral-link/bootstrap contract. PR #187 reconciled the repository status and resolved the remaining stale referral issue. The full post-merge CI gate has passed. No concrete internal Phase 3 implementation gap remains.

## Phase 4 — Squad

🟡 **Implementation in progress from the locked contract.**

The authoritative contract is:

- `docs/SQUAD_SYSTEM_CONTRACT.md`
- `docs/ADR-0012-SQUAD.md`
- `docs/PHASE4_SQUAD.md`

These documents supersede obsolete hierarchical/10-level Squad material.

### Implemented and merged slices

- System-created Squads and deterministic server-side Owner assignment (PR #194).
- Free membership invitation/acceptance/activation boundary (PR #195).
- Paid membership purchase/activation boundary with existing Economy/Ledger burn path (PR #196).
- Daily Squad State (PR #198).
- Daily DZP Contribution + Modifier (PR #200).
- Weekly Challenge accounting and settlement (PR #202), followed by canonical Economy rounding correction and zero-share hardening (PR #207).

### Weekly Challenge acceptance state

The merged implementation contains:

- six locked Challenge scopes;
- seven-day UTC+1 challenge windows;
- immutable configuration snapshots;
- current-cycle DZP Contribution accounting;
- settlement-time membership eligibility;
- proportional deterministic reward distribution using the existing Economy fixed-point half-up rounding rule;
- non-negative allocations and exact configured reward total, including sub-unit rounding cases;
- idempotent reward settlement through the existing Economy/Ledger boundary;
- no second Activity, Verification, Reward, Economy or Ledger system.

PR #207 is merged at `5202bd82578de8e06d60a1335977d20781ae4038`. Its PR CI passed the migrations, security audit, runtime health, full test suite, Weekly Challenge tests, monetary-precision tests, and Economy reconciliation gate. PR #207 specifically removed the Squad-specific largest-remainder approach introduced by PR #206 and restored the locked canonical Economy rounding rule.

### Remaining Phase 4 work

Phase 4 is **not closed**. The locked contract requires App Ban to be able to terminate a Squad membership, but the current repository has no authoritative App-Ban/Admin membership-termination boundary. Because Admin Panel is a later phase and architecture rules prohibit introducing later-phase runtime services/routes/migrations early, this is recorded as a phase-boundary dependency rather than an invented Squad endpoint.

The existing membership model already represents `suspended` and `cancelled` states, and implemented membership/challenge boundaries prevent cancelled/ineligible memberships from receiving Challenge rewards. No separate suspension or ban subsystem is authorized in Phase 4 without an authoritative upstream control surface.

### Phase 4 acceptance gate

Phase 4 remains gated by Constitution 54. The next implementation must be derived from a concrete, currently authorized contract gap; no legacy Squad migration, duplicate economic/activity/reward/verification system, or speculative Admin boundary may be introduced.

## TON Deposit

🟢 Implementation and automated validation for the audited milestone.

The audited milestone includes server-side blockchain evidence validation, transaction normalization, finality handling, trace binding, persisted network handling and the deposit evidence gate.

🟡 Production acceptance remains a separate operational gate and is not inferred from tests alone.

## Issue / PR interpretation

- Open Issues are not automatically unimplemented features.
- Work already present in merged `main` must be reconciled rather than reimplemented.
- PRs #146/#147 are not separate implementation milestones where superseded by PR #148.
- Issue #100's 20% lifetime reward is already implemented; it must not be reimplemented.
- Issue #106 is closed as completed because its required canonical referral-link/bootstrap contract is already present in merged main through PRs #108 and #109.
- Issue #99 is closed against the merged Daily/Referral implementation; its Share contract is Click Proof, not Telegram-native share attestation.
- Issue #134 remains the Phase 2 evidence/provider gate for future external-provider integrations; it is not a request to create placeholder verifiers.

## Later phases

- Phase 5 — Reward Pool: not started.
- Phase 6 — Packages: not started.
- Phase 7 — Buying Points & Conversion UI: not started.
- Phase 9 — Withdrawal: not started.
- Phase 10 — Promo Codes: not started.
- Phase 12 — Admin Panel: not started.
- Final release/security hardening remains gated by the roadmap.

## Next authorized work

1. Keep the Phase 2 implementation baseline stable; do not create new verification services for provider-dependent categories.
2. Treat Special/Partner as `CODE COMPLETE / PENDING_PROVIDER` until a real provider supplies a trusted, testable evidence contract.
3. Continue Phase 4 only from the locked Squad contract and with focused TDD.
4. Reuse the existing Task, Verification, Advertisement, Activity, Economy/Ledger, configuration and rounding boundaries.
5. Before every change, run the Constitution 54 pre-change audit: Code → Git history → PRs → CI → Commits → Tracing → Tests → Issues → Runtime failure history.
6. Do not resurrect legacy Squad migrations or create a second Economy/Ledger/Reward/Verification source.
7. Do not implement the App-Ban membership-termination boundary until an authorized upstream App-Ban/Admin control surface exists.

## Update Rule

After every validated milestone, update this file with:
1. What was implemented.
2. What was actually tested.
3. Commit/reference used.
4. Remaining limitations.

Never mark unvalidated work as completed.
