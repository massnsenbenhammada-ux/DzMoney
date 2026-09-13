# DzMoney — Context Summary

## Authoritative snapshot

- Current authoritative baseline is `main` after the merged Phase 4 milestones through PR #355 and the reconciled Squad Option B implementation.
- Documentation changes must use branch → PR → CI → review/authorization → merge.
- GitHub `main`, merged code, tests, CI, migrations, ADRs and locked contracts are the implementation evidence. Open Issues/PRs are not proof of missing implementation.

## Current phase

- Phase 2 — Activity / Ads / Tasks: code scope closed for currently defined contracts; provider-dependent evidence remains `PENDING_PROVIDER`.
- Phase 3 — Referral: closed/complete for the accepted Referral contract.
- **Project Phase 4 — Squad / Hierarchical Squad System: IN PROGRESS.**
- **Squad internal Phase 4 — Paid Purchase + Tier-1 Waiting / Option B: CLOSED.**
- Squad internal Phases 5–10 remain independently gated inside Project Phase 4.
- Later product phases remain independently gated by phase isolation; the completion of Squad internal Phase 4 does not authorize Project Phase 5 Gaming work.

## Validated architecture

- Existing Task Catalog, Task Execution, Task Verification, Advertisement, Activity, Referral and Economy/Ledger boundaries remain canonical.
- No second reward store, ledger, economy, verification, activity or referral system is allowed.
- Verification and economic mutations are server-authoritative and idempotent.
- Daily Check-in uses rolling 24 hours; applicable Daily system tasks use the documented UTC+1 calendar-day policy.
- Share with Friends uses the accepted Click Proof contract; no Telegram-native share attestation is claimed.
- Squad is independent of Referral/Reward Pool and reuses existing Verified Activity and Economy/Ledger sources.

## Project Phase 4 — Squad status

Project Phase 4 is the product-level Hierarchical Squad System milestone. The current locked Squad redesign contains internal Squad Phases 0–10. These internal phase numbers must never be conflated with the product-level roadmap phases.

The current validated implementation lineage includes:

- PR #194 — system-created Squads and deterministic Owner assignment.
- PR #195 — free membership invitation/acceptance/activation.
- PR #196 — paid membership purchase/activation through the existing Economy/Ledger burn path.
- PR #198 — Daily Squad State.
- PR #200 — Daily DZP Contribution + Modifier.
- PR #202 — Weekly Challenge accounting/settlement.
- PR #207 — canonical Economy proportional rounding correction and zero-share hardening for Weekly Challenge settlement.
- PR #355 — paid membership affordability, persistent pending state, T1-only pending pairing, and T2–T10 persistent interest fallback under the locked Option B scope.

PR #355 merge commit: `a5956497c3fb7cc13225a8b767d0e51de5d71f63`.

The final paid/pending implementation lineage is behaviorally validated and exact-head CI passed. Economy/Ledger reconciliation reported zero negative wallets, zero DZP source mismatches, zero ledger mismatches, zero invalid ledger currencies, zero ledger-balance mismatches, and zero ledger-chain mismatches.

The locked matching order is:

1. eligible existing Squad first;
2. pending only as fallback;
3. T1 may pair the first two affordable pending requests to form one Squad;
4. T2–T10 never pair pending requests and never create a Squad from pending requests; they remain persistent zero-charge interest requests until an existing eligible Squad becomes available.

This evidence closes **Squad internal Phase 4 only**. It does **not** close Project Phase 4.

## Squad internal phase sequence

The governing Squad contract defines these remaining gates after internal Phase 4:

- **Internal Phase 5 — Persistent Interest Requests**
- **Internal Phase 6 — Switch and Upgrade Semantic Gate**
- **Internal Phase 7 — Modifier/Economy decision and implementation gate**
- **Internal Phase 8 — Squad UX Contract (Design Only)**
- **Internal Phase 9 — Squad UI Implementation Gate**
- **Internal Phase 10 — Investigation and Validation Gate**

Their current completion state is not inferred from numbering. Each phase must be audited independently against its contract, implementation, tests, schema/migrations, callers, CI, and runtime evidence before it can be marked closed.

## App Ban boundary

App Ban is an administrative enforcement action, not an automatic Squad action. The existing membership model represents `suspended` and `cancelled` states and Challenge settlement respects membership eligibility. The later Admin Panel owns the authoritative warning/review/enforcement control surface. Its absence is **not** a Project Phase 4 blocker, and Phase 4 must not invent a duplicate Admin service, route, or enforcement system.

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
