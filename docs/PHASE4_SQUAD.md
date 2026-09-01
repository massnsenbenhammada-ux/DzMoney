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
- Daily Squad State: implemented on `feature/squad-daily-state`, pending CI/runtime acceptance.

The Daily Squad State slice freezes the day's eligible-member count, derives the daily DZP target from that snapshot, counts active members from existing verified task/ad activity records, and evaluates `ACTIVE` when either the daily DZP target or the 50% active-member condition is reached. DZP contribution is read from the existing Economy/Ledger reward records. The resulting state is effective for the following UTC+1 day.

Implementation remains gated by Constitution 54: every slice must pass the required code, history, PR, CI, tracing, tests, documentation, issues, runtime/failure-history and final-diff gates before merge.
