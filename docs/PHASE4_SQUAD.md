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
- Daily DZP Contribution + Modifier: implemented on `feature/squad-daily-modifier-clean`, pending CI/runtime acceptance.

The Daily Modifier slice persists the daily modifier rate and a contributor snapshot, uses the locked mapping of 1,500 DZP → 15%, 5,000 DZP → 50%, and 10,000+ DZP → 100%, and applies the result only to qualifying Verified Activity rewards on the following UTC+1 day. The existing Economy/Ledger remains the economic source of truth; DZP is never increased by the modifier.

Implementation remains gated by Constitution 54: every slice must pass the required code, history, PR, CI, tracing, tests, documentation, issues, runtime/failure-history and final-diff gates before merge.
