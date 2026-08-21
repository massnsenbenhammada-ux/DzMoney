# DzMoney — Architecture Decision Record

## ADR-0001 — Additive engineering execution rules

**Status:** Accepted  
**Date:** 2026-08-21

### Context

DzMoney already has architecture and change-control rules in `docs/ARCHITECTURE_RULES.md`. The project now needs additional engineering execution rules without duplicating or replacing those existing rules.

### Decision

The following rules are additive to the existing architecture rules:

1. **YAGNI:** do not implement unnecessary additions. Proposed improvements are recorded in `TODO.md` and are not implemented opportunistically.
2. **TDD:** write focused unit tests before implementation, then add the minimum code required to pass them.
3. **Code quality:** new functions should be kept at 20 lines or fewer where practical; public functions require docstrings; complex code requires explanatory comments; errors must be handled explicitly.
4. **Scope discipline:** do not make unrelated improvements while implementing a requested feature.
5. **Context summaries:** after every five completed features, create or update `CONTEXT_SUMMARY.md` with the validated project state, decisions, tests and remaining risks.
6. **Integration testing:** every completed feature must include integration coverage for its interaction with relevant existing features.
7. **Database changes:** every schema change requires an append-only migration, a practical rollback/reversal strategy where applicable, and an updated application/database model.
8. **Self-review:** before delivery, review duplication, performance, security, consistency, source-of-truth alignment, tests and scope.

### Consequences

These rules reduce architectural drift and uncontrolled cleanup while making feature work reproducible. They do not override the existing phase, migration, economy, testing, or source-of-truth rules; they supplement them.

## ADR-0002 — Active task catalog remains a service read model

**Status:** Accepted  
**Date:** 2026-08-21

### Context

Phase 2 already owns the `activity_tasks` schema and `task-service.js`. The first task feature needs a safe catalog of user-visible active tasks without introducing another repository, table, or task-specific service.

### Decision

Expose the active task catalog through `task-service.js` as a read operation. It returns only active tasks and the fields required by the catalog: category, title, description, configured rewards and verification-ad duration. Optional category filtering is validated against the existing task type set.

No new database table, migration, provider, or service is introduced for the catalog.

### Consequences

The existing `activity_tasks` table remains the single persistence source for tasks, while `task-service.js` remains the business boundary. Draft and inactive tasks cannot leak into the user catalog. Future HTTP/UI work can consume this service without duplicating task selection rules.

## ADR-0003 — Task verification configuration is task-scoped and provider-neutral

**Status:** Accepted  
**Date:** 2026-08-21

### Context

Tasks may require different external verification sources. Some sources can provide a known verifier automatically, while others require administrator configuration. Some registration tasks also need an external application's referral link, optionally followed by verification that the registered account belongs to the DzMoney task user.

### Decision

Keep verification configuration inside the existing `activity_tasks.config` JSONB owned by `task-service.js`. Do not introduce a second task configuration store or a second verification service.

Verification defaults are provider-neutral and resolve to `automatic` mode when no task-specific override exists. A known provider can be selected by its provider identifier without embedding provider credentials in a task record.

External referral configuration has exactly these modes:

- `disabled`
- `link_only`
- `link_and_owner_verification`

`link_only` means DzMoney may provide the external application's referral link, but the link itself is not proof of registration or task completion. `link_and_owner_verification` requires a trusted external verification source capable of proving that the completed external account belongs to the task user before a reward can be issued.

Provider credentials must not be stored in task configuration. They belong to a separate protected provider-credential mechanism to be added only when an actual admin/provider integration requires it.

### Consequences

Existing Task Execution, Task Verification, Economy, and Ledger boundaries remain unchanged. Adding another provider later does not require rewriting task reward logic. Tasks without a trusted verifier cannot be treated as verified merely because a client event or referral link was opened.
