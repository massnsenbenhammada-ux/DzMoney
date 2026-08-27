# DzMoney — Context Summary

## Authoritative snapshot

- Audited baseline: `main` at `de1280d42f3f2d438665b9708f1ac2ae9c3abc99` (PR #148 milestone).
- PR #150 was merged as `ba3a003b6f674c7091a8981abd8d3ea7508048aa` to revert the earlier unauthorized direct-to-main documentation mutation.
- Documentation changes from this point forward must use branch → PR → CI → review/authorization → merge.
- The repository's existing `IMPLEMENTATION_STATUS.md` was stale relative to the audited baseline; this branch reconciles it without changing runtime behavior.

## Current phase

- Phase 2 — Activity / Ads / Tasks: open.
- Phase 3 — Referral: core implemented, not closed.
- Later phases remain gated by roadmap/phase isolation.

## Validated architecture

- `activity_tasks` remains the task catalog/source of truth.
- Existing Task Execution, Task Verification, Advertisement, Referral and Economy/Ledger boundaries must be reused.
- No second reward store, ledger, economy, verification system or referral counter is allowed.
- Verification must be server-authoritative; frontend flags are not trusted evidence.
- Verification-ad gating remains distinct from task completion evidence.
- Daily Check-in uses rolling 24 hours; applicable Daily system tasks use the documented UTC+1 calendar-day policy.
- Referral achievements are permanent and threshold-based.
- Share with Friends must not reward from frontend-only share/click/dialog signals.

## Phase 2 evidence status

### Proven

- Telegram Channel Membership: existing verifier uses authenticated Telegram identity and Bot API `getChatMember`.
- Monetag and OnClickA: existing provider postback boundaries provide advertisement-provider evidence; these are not generic task-completion evidence.

### Not yet proven as generic task-completion evidence

- Provider-specific Daily completion beyond the existing ad-event boundary.
- Game / Mini App completion from a concrete trusted backend contract.
- Non-Telegram social actions without an authoritative provider event/API.
- Web completion without a signed S2S webhook or authenticated server-bound single-use token.
- Special/Partner completion without a concrete authenticity/signature/HMAC contract and identity binding.

Issue #134 remains the evidence-contract gate. No new verifier is authorized merely because a generic provider configuration entry exists.

## Referral status

Implemented in the audited codebase:

- attribution;
- server-side qualification;
- activation;
- qualified referral count;
- permanent achievements;
- Telegram bootstrap/referral-link foundation;
- lifetime 20% reward through the existing Economy/Ledger path.

Pending:

- trusted production Share with Friends completion/reward;
- remaining referral UI/acceptance coverage.

## TON Deposit

The audited PR #148 milestone contains server-side blockchain evidence validation, transaction normalization, finality handling, trace binding, persisted network handling and the deposit evidence gate. Automated validation is part of the audited CI evidence. Production acceptance remains a separate operational gate.

## Reconciliation rules

- Open Issues/PRs are not proof of missing implementation.
- Merged `main` code, tests and CI are the implementation evidence.
- Already-implemented behavior must be reconciled, not reimplemented.
- PRs #146/#147 are superseded by the PR #148 milestone where their changes overlap.
- Issue #100's 20% lifetime reward is already implemented.
- Issue #106 must be reconciled against the current referral bootstrap implementation before new work is authorized.

## Next authorized action

After this documentation reconciliation PR is validated and merged, freeze the baseline and proceed with Phase 2 / Issue #134: identify a concrete, testable evidence contract before writing any new verifier. Tests must precede newly authorized implementation, and all changes must follow the normal PR workflow.
