# DzMoney — Context Summary

## Authoritative snapshot

- Current authoritative baseline is `main` after the merged Phase 4 milestones through PR #207.
- Documentation changes must use branch → PR → CI → review/authorization → merge.
- GitHub `main`, merged code, tests, CI, migrations, ADRs and locked contracts are the implementation evidence. Open Issues/PRs are not proof of missing implementation.

## Current phase

- Phase 2 — Activity / Ads / Tasks: code scope closed for currently defined contracts; provider-dependent evidence remains `PENDING_PROVIDER`.
- Phase 3 — Referral: closed/complete for the accepted Referral contract.
- Phase 4 — Squad: implementation in progress from the locked contract.
- Later phases remain gated by phase isolation.

## Validated architecture

- Existing Task Catalog, Task Execution, Task Verification, Advertisement, Activity, Referral and Economy/Ledger boundaries remain canonical.
- No second reward store, ledger, economy, verification, activity or referral system is allowed.
- Verification and economic mutations are server-authoritative and idempotent.
- Daily Check-in uses rolling 24 hours; applicable Daily system tasks use the documented UTC+1 calendar-day policy.
- Share with Friends uses the accepted Click Proof contract; no Telegram-native share attestation is claimed.
- Squad is independent of Referral/Reward Pool and reuses existing Verified Activity and Economy/Ledger sources.

## Phase 4 — Squad status

Implemented and merged:

- PR #194 — system-created Squads and deterministic Owner assignment.
- PR #195 — free membership invitation/acceptance/activation.
- PR #196 — paid membership purchase/activation through the existing Economy/Ledger burn path.
- PR #198 — Daily Squad State.
- PR #200 — Daily DZP Contribution + Modifier.
- PR #202 — Weekly Challenge accounting/settlement.
- PR #207 — canonical Economy proportional rounding correction and zero-share hardening for Weekly Challenge settlement.

PR #207 merge commit: `5202bd82578de8e06d60a1335977d20781ae4038`.

The Weekly Challenge implementation supports the six locked scopes, exact seven-day UTC+1 windows, immutable configuration snapshots, current-cycle DZP contribution accounting, settlement-time eligibility, deterministic proportional allocation, canonical Economy fixed-point half-up rounding, exact configured reward totals, non-negative allocations and idempotent settlement.

## Remaining Phase 4 boundary

The locked Squad contract requires App Ban to be able to terminate a Squad membership. The current repository has no authoritative App-Ban/Admin membership-termination boundary. Admin Panel is a later phase, and architecture rules prohibit introducing later-phase runtime services/routes/migrations early. Therefore this is recorded as a phase-boundary dependency, not as permission to invent a Squad endpoint or Admin subsystem.

The existing membership model represents `suspended` and `cancelled` states, and Challenge settlement respects membership eligibility. No separate suspension/ban subsystem is authorized without an authoritative upstream control surface.

## Phase 2 evidence status

### Proven

- Telegram Channel Membership through the existing verifier and authenticated Telegram identity.
- Monetag and OnClickA as advertisement-provider evidence boundaries.
- Existing Creator verification contracts within the accepted verification boundary.

### Pending provider evidence

- Special/Partner completion requiring a real partner backend/API/HMAC/Webhook evidence source.
- Future Game/Mini App completion requiring provider-owned trusted backend evidence beyond current Creator methods.
- Future non-Telegram social completion requiring an authoritative provider event/API.
- Future Web completion requiring signed S2S webhook or authenticated server-bound single-use token.

No new verifier is authorized merely because a generic provider configuration entry exists.

## TON Deposit

The audited PR #148 milestone contains server-side blockchain evidence validation, transaction normalization, finality handling, trace binding, persisted network handling and the deposit evidence gate. Production acceptance remains a separate operational gate.

## Reconciliation rules

- Never restart or redesign settled work.
- Before every change follow Constitution 54: Code → Git history → PRs → CI → Commits → Tracing → Tests → Documentation → Issues → Runtime failure history.
- Use YAGNI, KISS and DRY.
- Tests precede newly authorized implementation.
- Reuse canonical rounding; do not create Squad-specific rounding algorithms.
- Do not resurrect legacy Squad migrations or introduce duplicate economic/activity/reward/verification systems.
