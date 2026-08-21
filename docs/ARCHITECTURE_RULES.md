# DzMoney 2.0 — Architecture Rules

This document is a change-control contract for the clean rebuild. It exists to prevent architectural drift, duplicated business logic and cross-phase coupling.

## 1. One source of truth

- `PROJECT_ROADMAP.md` is the product specification.
- `IMPLEMENTATION_STATUS.md` records only validated implementation state.
- Code is authoritative for runtime behavior.
- If specification, status and code disagree, stop feature work and reconcile them before proceeding.

## 2. Phase isolation

- Implement one phase at a time.
- A later phase may not add runtime services, routes, migrations or database tables before its phase is opened.
- UI may show a clearly labelled future placeholder, but it must not call an unimplemented API.
- A phase is not complete until its migration, runtime tests, invariants and acceptance criteria pass.

## 3. Layer boundaries

```text
public/                 presentation only
src/http/               authentication, validation, transport
src/services/           business rules and transactions
src/db/                 database connection/infrastructure
migrations/             append-only schema evolution
scripts/                repeatable verification/maintenance
```

- Frontend never calculates authoritative balances, rewards, eligibility or cooldowns.
- HTTP handlers do not contain economy business rules.
- Services do not depend on browser state.
- Database constraints enforce invariants that must survive concurrent requests.
- Do not create a second service for an existing domain primitive unless the responsibility is genuinely different.

## 4. Economy rules

- All balance movements use the existing atomic economy/ledger primitives.
- Every reward has one immutable economic source.
- Squad is a modifier, never a source.
- Referral, Squad and Reward Pool remain separate systems.
- Idempotency keys are mandatory for externally repeatable reward/settlement operations.
- Historical ledger records are immutable.

## 5. Migration rules

- Migrations are append-only once they may have reached any environment.
- Never edit or delete an already-deployed migration to hide an architectural mistake.
- Correct an obsolete schema with a new explicit cleanup migration.
- Every migration must be safe to run through the canonical `scripts/migrate.js` runner.
- Do not introduce compatibility tables or aliases without a documented, time-bounded reason.

## 6. Testing gates

Every milestone must leave a reproducible command behind. The baseline gate is:

```text
npm run test:frontend
npm run test:phase1
npm run test:economy-ledger
npm run test:deposit
npm run test:phase2
npm run reconcile:economy
```

A new subsystem must add focused invariants without weakening the existing gates.

## 7. No fake integrations

- Provider callbacks must be real, authenticated and replay-safe before rewards are enabled.
- Placeholder UI must state that a backend/provider is not yet connected.
- Never mark a reward as verified from a client-side event alone.

## 8. Change discipline

Before merging any feature, answer:

1. Which phase owns this change?
2. Which existing module should own the behavior?
3. Does a new table/service/route actually need to exist?
4. Which invariant prevents duplicate or conflicting state?
5. Which tests prove the behavior?
6. Does `IMPLEMENTATION_STATUS.md` match the code after the change?

If any answer is unclear, do not add the feature yet.
