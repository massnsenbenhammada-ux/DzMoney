# Phase 4 — Squad

**Specification status: LOCKED**  
**Implementation status: IN PROGRESS**

The authoritative Phase 4 business contract is:

- `docs/SQUAD_SYSTEM_CONTRACT.md`
- `docs/ADR-0012-SQUAD.md`

These documents supersede all earlier Squad-specific business rules in legacy roadmap material.

Current implementation status:

- System-created Squad persistence: merged.
- Free membership invitation/activation: merged.
- Paid membership purchase/activation: merged.
- Daily Squad State: merged on `main`.
- Daily DZP Contribution + Modifier: merged on `main` and validated through the Constitution 54 gate.
- Weekly Challenge accounting/settlement: merged through PR #202 and the canonical-rounding correction in PR #207; the final merged implementation is validated by CI.

The Weekly Challenge implementation uses the existing Verified Activity and Economy/Ledger records as its only evidence and economic sources. Each challenge snapshots its scope/reward configuration, spans exactly seven UTC+1 days, keeps independent accounting, supports the locked challenge scopes, and settles idempotently through the existing Economy/Ledger. A member must remain eligible at settlement. Proportional allocation reuses the existing Economy fixed-point half-up rounding rule; no Squad-specific rounding algorithm exists.

The `Verified Squad AdView` scope is supported by the accounting contract, but no new activity producer is introduced here because the current repository has no verified Squad-ad producer. Existing verified activity producers remain the source of truth.

Phase 4 remains **in progress** because the locked contract still contains membership-lifecycle obligations whose authoritative upstream control surface is not implemented in the current phase. In particular, the contract requires App Ban to be able to terminate a Squad membership, while the repository currently has no App-Ban/Admin membership-termination boundary. Constitution 54 and phase isolation prohibit inventing that boundary or introducing an Admin service/route/migration before its authorized phase.

Suspended/cancelled membership states are represented by the existing membership model and are respected by the implemented membership/challenge boundaries; no separate suspension system is authorized.

Implementation remains gated by Constitution 54: every slice must pass the required code, history, PR, CI, tracing, tests, documentation, issues, runtime/failure-history and final-diff gates before merge.
