# Phase 4 — Squad

**Specification status: LOCKED**  
**Implementation status: CLOSED**

The authoritative Phase 4 business contract is:

- `docs/SQUAD_SYSTEM_CONTRACT.md`
- `docs/ADR-0012-SQUAD.md`

These documents supersede all earlier Squad-specific business rules in legacy roadmap material.

Validated implementation on `main` includes:

- System-created Squad persistence.
- Free membership invitation/activation.
- Paid membership purchase/activation.
- Daily Squad State.
- Daily DZP Contribution + Modifier.
- Weekly Challenge accounting/settlement with the canonical Economy rounding rule.

The Weekly Challenge implementation uses the existing Verified Activity and Economy/Ledger records as its only evidence and economic sources. Each challenge snapshots its scope/reward configuration, spans exactly seven UTC+1 days, keeps independent accounting, supports the locked challenge scopes, and settles idempotently through the existing Economy/Ledger. A member must remain eligible at settlement. Proportional allocation reuses the existing Economy fixed-point half-up rounding rule; no Squad-specific rounding algorithm exists.

The `Verified Squad AdView` scope is supported by the accounting contract, but no new activity producer is introduced here because the current repository has no verified Squad-ad producer. Existing verified activity producers remain the source of truth.

### App Ban boundary

App Ban is **not an automatic Squad action** and is not owned by the Squad subsystem. The system may generate an administrative warning when evidence indicates that a user should be suspended/banned. The **Admin is the enforcement authority**: after reviewing the warning/evidence, an authorized Admin explicitly decides whether to suspend/ban the user. Ignoring a warning performs no membership mutation.

The existing `squad_membership.status` model already represents `suspended` and `cancelled`, and implemented membership/challenge boundaries respect membership eligibility. The authoritative Admin warning/enforcement control surface belongs to the later Admin Panel phase and must be implemented there when that phase is opened; Phase 4 must not invent a duplicate Admin service, route, or enforcement system.

Accordingly, the absence of the later Admin control surface is no longer treated as an implementation blocker for Phase 4. Phase 4 is closed on the Squad implementation currently authorized by its contract; the future Admin integration remains a documented later-phase dependency.

Every future slice remains subject to Constitution 54: code, history, PR, CI, tracing, tests, documentation, issues, runtime/failure-history and final-diff gates before merge.
