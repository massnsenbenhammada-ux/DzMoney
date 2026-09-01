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
- Weekly Challenge accounting/settlement: implemented on the current feature branch, pending CI/runtime/final-diff acceptance.

The Weekly Challenge slice uses the existing Verified Activity and Economy/Ledger records as its only evidence and economic sources. Each challenge snapshots its scope/reward configuration, spans exactly seven UTC+1 days, keeps independent accounting, supports the locked challenge scopes, and settles idempotently through the existing Economy/Ledger. A member must remain eligible at settlement. No separate Activity, Verification, Reward, Economy, or Ledger system is introduced.

The `Verified Squad AdView` scope is supported by the accounting contract, but no new activity producer is introduced here because the current repository has no verified Squad-ad producer. Existing verified activity producers remain the source of truth.

Implementation remains gated by Constitution 54: every slice must pass the required code, history, PR, CI, tracing, tests, documentation, issues, runtime/failure-history and final-diff gates before merge.
