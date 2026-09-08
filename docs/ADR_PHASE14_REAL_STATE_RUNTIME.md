# ADR — Phase 14 Isolated Real-State Runtime

## Status

Proposed — validation branch only.

## Decision

Release-critical real-state E2E must execute against an isolated PostgreSQL database and an isolated DzMoney server process. It must never mutate the Railway production Economy/Ledger as test evidence.

The GitHub Actions runtime uses the same application entrypoint, migrations, HTTP routes, provider registry, and canonical Economy/Ledger code as the application. PostgreSQL is ephemeral and scoped to the CI job.

This runtime is an automated backend/application gate. It does not claim to authenticate a Telegram Android session or to prove a real AdsGram network advertisement. Those remain separate gates.

## Constraints

- No fake Telegram authentication for Android release evidence.
- No fake AdsGram completion for provider release evidence.
- No SDK-only mock may authorize a reward.
- No second Economy, Ledger, Reward, or Verification system.
- Production Railway configuration is not changed by this runtime.
- Real-state specs must prove state transition, persisted economic outcome, returned reward, visible outcome, reload persistence, and idempotency.

## Consequence

The backend real-state gate can be validated safely in CI before investing in authenticated Telegram Android infrastructure. A green backend gate is necessary but insufficient for the final Watch Ad release decision.
