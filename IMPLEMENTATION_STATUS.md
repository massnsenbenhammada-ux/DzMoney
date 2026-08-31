# DzMoney — Implementation Status

> **Authoritative baseline:** `main` at `d9c47ad3c58ff1dd2ae1a6b7330bfed9d1ae856a` (post-PR #187 documentation reconciliation).
>
> This document is maintained through the normal branch → PR → CI → review → merge workflow. Open Issues/PRs are not proof of missing implementation; status is determined from merged code, tests, CI evidence, and governing documents.

## Current state

- **Current phase:** Phase 2 — Activity / Ads / Tasks.
- **Phase 2 code scope:** 🟢 **CLOSED / COMPLETE** for the currently defined and implemented contracts.
- **External provider dependencies:** 🟡 **PENDING_PROVIDER** for Special/Partner integrations and any future provider-specific evidence not yet supplied.
- **Phase 3:** Referral core is implemented but Phase 3 is not closed; Share with Friends uses the canonical referral link and existing Click Proof verification boundary. Telegram-native attestation that a share actually occurred is not claimed.
- **Latest audited TON/Deposit milestone:** PR #148.
- **Latest Tasks UI/scope milestone:** PR #186.
- **Latest status reconciliation:** PR #188.

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

The **DzMoney implementation scope is closed** for the currently defined contracts. Runtime health, full test suite, migration/security checks, and Economy reconciliation have passed on the post-merge `main` CI gate.

Remaining work is external-provider dependent and therefore tracked as `PENDING_PROVIDER`, not as an unimplemented internal service.

## Phase 3 — Referral

🟡 Core foundation implemented; Phase 3 is not closed.

Implemented:

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

**Issue #99 — Daily system tasks and referral achievements: RESOLVED against merged implementation.** Share with Friends is implemented under the locked Click Proof contract; no Telegram-native share attestation is claimed.

Pending:

- further referral UI/acceptance coverage only where a concrete gap is demonstrated;
- no new trusted verifier for Telegram share itself unless a real provider-attested evidence contract becomes available.

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

- Phase 4 — Squad: not started.
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
3. If a real provider arrives, write contract tests first and integrate it through the existing Verification boundary only.
4. Complete Phase 3 only through concrete acceptance gaps; do not reimplement already-merged referral functionality.
5. Before every change, run the Constitution 54 pre-change audit: Code → Git history → PRs → CI → Commits → Tracing → Tests → Issues → Runtime failure history.
6. Do not begin a later phase until its predecessor's required acceptance gate is satisfied.

## Update Rule

After every validated milestone, update this file with:
1. What was implemented.
2. What was actually tested.
3. Commit/reference used.
4. Remaining limitations.

Never mark unvalidated work as completed.
