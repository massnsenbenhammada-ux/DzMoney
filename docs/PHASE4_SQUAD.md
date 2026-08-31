# Phase 4 — Squad

**Specification status: LOCKED**  
**Implementation status: NOT STARTED**

The authoritative Phase 4 business contract is:

- `docs/SQUAD_SYSTEM_CONTRACT.md`
- `docs/ADR-0012-SQUAD.md`
- `docs/ADR-0013-SQUAD-CREATION.md`

## Locked creation model

- Squads are created by the system.
- Users cannot create Squads or self-assign as Owners.
- The system assigns the Squad Owner.
- Owner assignment is server-authoritative and idempotent.

These documents supersede all earlier Squad-specific business rules in legacy roadmap material.

Implementation is gated by the Constitution 54 phase-order rule: Phase 3 acceptance must be closed before Phase 4 runtime implementation begins.
