# ADR — Phase 14 Isolated Real-State Runtime

## Status

Proposed — validation branch only.

## Decision

Release-critical real-state E2E must execute against an isolated PostgreSQL database and an isolated DzMoney server process. It must never mutate the Railway production Economy/Ledger as test evidence.

The GitHub Actions runtime uses the same application entrypoint, migrations, HTTP routes, provider registry, and canonical Economy/Ledger code as the application. PostgreSQL is ephemeral and scoped to the CI job.

For deterministic CI, the existing provider adapters are used through the production HTTP boundaries. Gaming uses the existing GigaPub adapter's deterministic completion contract; Share with Friends uses the existing Monetag trusted postback boundary. The browser performs the real application UI action and the reward is finalized by the same server/database path used by the application. No SDK-only reward mock is used.

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
