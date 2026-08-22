# Phase 2 Verification Gate

This is a verification checklist, not a second specification. The roadmap, architecture rules and ADR remain authoritative.

Phase 2 stays open until the current commit has reproducible evidence for implementation, integration, runtime behavior and CI.

## Evidence Rules

- Evidence must correspond to the commit being reviewed.
- Historical CI from an older commit does not close the current gate.
- Railway deployment success is not a substitute for CI.
- Production must never be used as the test database.
- Tests must use isolated PostgreSQL infrastructure.
- A passing unit test does not replace required integration/runtime acceptance.

## Verification Matrix

| Area | Required evidence | Status |
|---|---|---|
| Migrations | Current migrations apply cleanly in isolated PostgreSQL | ⬜ |
| Frontend | `npm run test:frontend` | ⬜ |
| Economy | `npm run test:phase1` | ⬜ |
| Economy/Ledger | `npm run test:economy-ledger` | ⬜ |
| Deposit | `npm run test:deposit` | ⬜ |
| Phase 2 | `npm run test:phase2` | ⬜ |
| Daily Check-in | `npm run test:daily-checkin` | ⬜ |
| Daily Check-in HTTP | `npm run test:daily-checkin-http` | ⬜ |
| Task Catalog | `npm run test:task-catalog` | ⬜ |
| Task Execution | `npm run test:task-execution` | ⬜ |
| Task Lifecycle | `npm run test:task-lifecycle` | ⬜ |
| Verification Config | `npm run test:task-verification-config` | ⬜ |
| Ad Provider | `npm run test:ad-provider-system` | ⬜ |
| Monetag Postback | `npm run test:monetag-postback` | ⬜ |
| Monetag YMID | `npm run test:monetag-ymid` | ⬜ |
| Monetag Finalization | `npm run test:monetag-finalization` | ⬜ |
| Reconciliation | `npm run reconcile:economy` | ⬜ |
| Health | `/health` and `/health/db` on current deployment | ⬜ |
| Provider runtime | Real supported Telegram runtime behavior | ⬜ |
| Daily Check-in acceptance | Claim → ad → trusted callback → reward | ⬜ |
| Anti-fraud | Callback ownership/replay/trust-boundary review | ⬜ |
| Full CI | Full suite green on current commit | ⬜ |

## Architecture Gate

Before Phase 2 closure, confirm:

- No second Economy or Ledger exists.
- No duplicate Task business boundary exists.
- No duplicate Verification business boundary exists.
- No client-callable reward finalization exists.
- Monetag zone/context has one configuration source.
- Advertisement contexts remain distinct.
- Squad and Referral remain outside Phase 2.
- Admin provider configuration remains outside Phase 2.
- No test-only fake callback is used by production paths.
- No unnecessary migration or abstraction was introduced.

## Documentation Gate

Before Phase 2 closure:

- `PROJECT_ROADMAP.md` matches actual phase state.
- `IMPLEMENTATION_STATUS.md` contains only evidence-backed claims.
- `docs/ARCHITECTURE_RULES.md` and `ADR.md` do not contradict implementation.
- `TODO.md` contains only non-blocking deferred work.
- No duplicate specification file is created.
- Stale PR documentation is reconciled on current `main` or explicitly closed as obsolete.

## Closure Rule

Phase 2 can be marked **CLOSED / VERIFIED** only when all required evidence is green for the current commit and the documentation is reconciled in the same accepted change set.
