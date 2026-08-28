# DzMoney — Implementation Status

> **Authoritative baseline:** `main` at `a0cd4c9b6b3cf829428b2475089f41d78ff0aeac` (post-PR #154 monetary precision milestone), subject to the current post-merge repository state.
>
> This document is maintained through the normal branch → PR → CI → review → merge workflow. Open Issues/PRs are not proof of missing implementation; status is determined from merged code, tests, CI evidence, and governing documents.

## Current state

- **Current phase:** Phase 2 — Activity / Ads / Tasks remains open.
- **Phase 3:** Referral core is partially implemented; Share with Friends production reward remains pending trusted completion evidence.
- **Latest audited TON/Deposit milestone:** PR #148.
- **Post-#150 documentation state:** PR #150 restored the repository to the prior documented state because the earlier reconciliation had been written directly to `main`. No direct-to-main documentation change is authorized going forward.

## Phase 0 — Specification Lock

🟢 Completed.

Economic and architectural rules remain those defined by the roadmap, architecture rules, ADRs, Constitution 54, and phase-specific contracts.

## Phase 1 — Economy & Currency Core

🟢 Runtime verified and signed off.

- Internal wallet currencies: COIN, DZX, DZP.
- TON is external settlement/reference, not an internal wallet currency.
- Economy/Ledger remains the single economic source of truth.
- Economy reconciliation exists.
- Activity reward decimal arithmetic now preserves exact fixed-point values through the existing Economy/Ledger boundary (PR #154).

No Phase 1 refactor is authorized unless a new invariant or security defect is proven.

## Phase 2 — Activity / Ads / Tasks

🟡 Partially implemented; not closed.

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
- Exact fixed-point decimal activity reward calculation through the existing Economy/Ledger path, covered by the monetary precision invariant in PR #154.

### Trusted evidence status

🟢 **Proven:** Telegram Channel Membership through the existing `telegram-channel-verifier.js` and Telegram Bot API `getChatMember` using authenticated Telegram identity.

🟢 **Proven as advertisement-provider evidence:** Monetag and OnClickA postback contracts. These are not generic proof of arbitrary task completion.

🟡 **Requires concrete evidence contracts before new verifier implementation:**

- Daily provider-specific completion beyond the existing advertisement-event boundary.
- Game / Mini App completion from an actual trusted backend contract.
- Non-Telegram social actions without an authoritative provider event/API.
- Web completion without a signed S2S webhook or authenticated server-bound single-use token.
- Special/Partner completion without a concrete authenticity/signature/HMAC contract and identity binding.

Generic `SERVER_VERIFIED_CONTRACTS` entries are contracts/placeholders, not evidence that a provider exists or is enabled.

### Phase 2 remaining acceptance

- Broader real task adapters/verifiers only where concrete provider evidence exists.
- Broader anti-fraud and provider/context acceptance hardening.
- Full acceptance of advertisement-task behavior across required providers/contexts.

**Phase 2 remains open until its acceptance criteria are satisfied and verified.**

## Phase 3 — Referral

🟡 Core foundation implemented; Phase 3 is not closed.

Implemented:

- attribution;
- server-side qualification;
- activation reward;
- qualified referral count;
- permanent referral achievement tasks;
- Telegram bootstrap/referral-link foundation;
- lifetime 20% reward from qualifying base COIN/DZX activity through the existing Economy/Ledger boundary.

Pending:

- user-facing Share with Friends production reward flow requiring a trusted completion signal;
- remaining referral UI/acceptance coverage.

## TON Deposit

🟢 Implementation and automated validation for the audited milestone.

The audited milestone includes server-side blockchain evidence validation, transaction normalization, finality handling, trace binding, persisted network handling and the deposit evidence gate.

🟡 Production acceptance remains a separate operational gate and is not inferred from tests alone.

## Issue / PR interpretation

- Open Issues are not automatically unimplemented features.
- Work already present in merged `main` must be reconciled rather than reimplemented.
- PRs #146/#147 are not separate implementation milestones where superseded by PR #148.
- Issue #100's 20% lifetime reward is already implemented; it must not be reimplemented.
- Issue #106's old description must be reconciled against the current referral bootstrap/link implementation before any new work is authorized.
- Issue #134 remains the Phase 2 evidence-contract gate for new provider-specific verifiers.

## Later phases

- Phase 4 — Squad: not started.
- Phase 5 — Reward Pool: not started.
- Phase 6 — Packages: not started.
- Phase 7 — Buying Points & Conversion UI: not started.
- Phase 9 — Withdrawal: not started.
- Phase 10 — Promo Codes: not started.
- Phase 12 — Admin Panel: not started.
- Final release/security hardening remains gated by the roadmap.

## Next authorized work

1. Keep the authoritative baseline synchronized through PR workflow.
2. Complete Phase 2 evidence-contract work (Issue #134) only where a concrete, testable provider/evidence source exists.
3. Write tests before implementation of any newly authorized verifier.
4. Reuse the existing Task, Verification, Advertisement, Referral and Economy/Ledger boundaries.
5. Do not begin the next phase until current phase acceptance criteria are satisfied.

## Update Rule

After every validated milestone, update this file with:
1. What was implemented.
2. What was actually tested.
3. Commit/reference used.
4. Remaining limitations.

Never mark unvalidated work as completed.
